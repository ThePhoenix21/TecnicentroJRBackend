import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  UseGuards,
  UseInterceptors, 
  UploadedFile, 
  BadRequestException, 
  HttpStatus,
  HttpCode,
  Req,
  Logger
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiConsumes, 
  ApiBody, 
  ApiParam,
  ApiBadRequestResponse,
  ApiCreatedResponse
} from '@nestjs/swagger';
import { ImageService } from './image.service';
import { CreateImageDto } from './dto/create-image.dto';
import { UpdateImageDto } from './dto/update-image.dto';
import { supabase } from '../supabase.client';
import { ErrorResponse } from './dto/image-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

/**
 * @apiDefine ImageResponse
 * @apiSuccess {Boolean} success Indica si la operación fue exitosa
 * @apiSuccess {String} message Mensaje descriptivo del resultado
 * @apiSuccess {Object} data Datos de la imagen subida
 * @apiSuccess {String} data.url URL pública de la imagen
 * @apiSuccess {String} data.expiresAt Fecha de expiración de la URL
 * @apiSuccess {Number} data.expiresInDays Días de validez de la URL
 */

/**
 * Controlador para gestionar las operaciones relacionadas con imágenes
 * Permite subir, listar, obtener, actualizar y eliminar imágenes
 * 
 * @class ImageController
 * @decorator @ApiTags('images')
 * @decorator @Controller('images')
 */
@ApiTags('images')
@Controller('images')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 500, description: 'Error interno del servidor', type: ErrorResponse })
export class ImageController {
  private readonly logger = new Logger(ImageController.name);

  private readonly bucketName = 'services';

  constructor(private readonly imageService: ImageService) {}

  @Post('upload')
  @Roles(Role.ADMIN, Role.USER)
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Subir una imagen', description: 'Sube una imagen al bucket de Supabase' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo de imagen a subir',
    required: true,
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo de imagen (JPEG, PNG, WebP) con tamaño máximo de 5MB'
        }
      }
    }
  })
  @ApiCreatedResponse({ 
    description: 'Imagen subida exitosamente',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', example: 'https://example.com/image.jpg' },
        path: { type: 'string', example: 'folder/filename.jpg' }
      }
    }
  })
  @ApiBadRequestResponse({ 
    description: 'Error al subir la imagen',
    type: ErrorResponse 
  })
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any
  ) {
    try {
      const tenantId = req?.user?.tenantId;
      if (!tenantId) {
        throw new BadRequestException('TenantId no encontrado en el token');
      }

      if (!file) {
        throw new BadRequestException('No se proporcionó ningún archivo');
      }

      // Validar tipo de archivo
      const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException('Formato de archivo no soportado. Use JPEG, PNG o WebP');
      }

      // Validar tamaño (5MB máximo)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new BadRequestException('El archivo excede el tamaño máximo de 5MB');
      }

      // Generar nombre único para el archivo
      const fileExt = file.originalname.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `tenants/${tenantId}/images/${fileName}`;

      // Verificar si el bucket existe y crearlo si no existe
      const { data: buckets } = await supabase.storage.listBuckets();
      const bucketExists = buckets?.some(bucket => bucket.name === this.bucketName);
      
      if (!bucketExists) {
        this.logger.log(`El bucket '${this.bucketName}' no existe, intentando crearlo...`);
        
        try {
          const { data: newBucket, error: createError } = await supabase.storage
            .createBucket(this.bucketName, {
              public: true,
              allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
              fileSizeLimit: '5MB'
            });

          if (createError) throw createError;
          
          this.logger.log(`Bucket '${this.bucketName}' creado exitosamente`);
          
          // Agregar políticas de acceso al bucket recién creado
          const { error: policyError } = await supabase.rpc('create_bucket_policy', {
            bucket_name: this.bucketName
          });
          
          if (policyError) {
            this.logger.warn('No se pudo configurar las políticas del bucket automáticamente:', policyError);
          }
          
        } catch (createError) {
          this.logger.error('Error al crear el bucket:', createError);
          throw new Error(`No se pudo crear el bucket '${this.bucketName}': ${createError.message}`);
        }
      }

      // Subir el archivo
      let uploadAttempts = 0;
      const maxAttempts = 3;
      let lastError: Error | null = null;
      
      // Reintentar la subida en caso de error
      while (uploadAttempts < maxAttempts) {
        try {
          const { data, error } = await supabase.storage
            .from(this.bucketName)
            .upload(filePath, file.buffer, {
              cacheControl: '3600',
              upsert: false,
              contentType: file.mimetype,
              duplex: 'half' as const
            });
          
          if (error) throw error;
          
          // Si llegamos aquí, la subida fue exitosa
          lastError = null;
          break;
          
        } catch (error: unknown) {
          lastError = error instanceof Error ? error : new Error(String(error));
          uploadAttempts++;
          this.logger.warn(`Intento ${uploadAttempts} de subida fallido:`, lastError);
          
          if (uploadAttempts < maxAttempts) {
            // Esperar un momento antes de reintentar
            await new Promise(resolve => setTimeout(resolve, 1000 * uploadAttempts));
          }
        }
      }
      
      if (lastError) {
        this.logger.error('Error en la subida después de varios intentos:', lastError);
        throw new Error(`Error al subir a Supabase: ${lastError.message}`);
      }

      // Configurar tiempo de expiración (1 año)
      const expiresInYears = 1;
      const expiresInDays = expiresInYears * 365;
      const expiresInSeconds = 60 * 60 * 24 * 365 * expiresInYears; // 1 año en segundos
      
      // Crear URL firmada con tiempo de expiración
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(this.bucketName)
        .createSignedUrl(filePath, expiresInSeconds);

      if (signedUrlError) {
        this.logger.error('Error al crear URL firmada:', signedUrlError);
        throw new Error(`Error al generar URL firmada: ${signedUrlError.message}`);
      }

      if (!signedUrlData || !signedUrlData.signedUrl) {
        throw new Error('No se pudo generar la URL firmada');
      }

      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + expiresInYears);

      this.logger.log(`Archivo subido exitosamente. URL válida por ${expiresInDays} días`);

      return {
        url: signedUrlData.signedUrl,
        path: filePath,
        expiresInDays: expiresInDays,
        expiresAt: expiresAt.toISOString()
      };

    } catch (error) {
      this.logger.error('Error al subir imagen:', error);
      throw new BadRequestException(
        error.response?.message || 'Error al subir la imagen. Por favor, intente nuevamente.'
      );
    }
  }

  @Post()
  @Roles(Role.ADMIN, Role.USER)
  create(@Body() createImageDto: CreateImageDto, @Req() req: any) {
    const tenantId = req?.user?.tenantId;
    return this.imageService.create(createImageDto, tenantId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.USER)
  findAll(@Req() req: any) {
    const tenantId = req?.user?.tenantId;
    return this.imageService.findAll(tenantId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.USER)
  findOne(@Param('id') id: string, @Req() req: any) {
    const tenantId = req?.user?.tenantId;
    return this.imageService.findOne(+id, tenantId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.USER)
  update(@Param('id') id: string, @Body() updateImageDto: UpdateImageDto, @Req() req: any) {
    const tenantId = req?.user?.tenantId;
    return this.imageService.update(+id, updateImageDto, tenantId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.USER)
  remove(@Param('id') id: string, @Req() req: any) {
    const tenantId = req?.user?.tenantId;
    return this.imageService.remove(+id, tenantId);
  }
}
