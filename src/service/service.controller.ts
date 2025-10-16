import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  ParseUUIDPipe,
  Query,
  HttpStatus,
  HttpCode,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ServiceService } from './service.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Service } from './entities/service.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ServiceStatus, ServiceType } from '@prisma/client';
import { SupabaseStorageService } from '../common/utility/supabase-storage.util';
import { FileInterceptor } from '@nestjs/platform-express/multer';
import { memoryStorage } from 'multer';

@ApiTags('Servicios')
@ApiBearerAuth('JWT')
@Controller('services')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'No autorizado. Se requiere autenticación' })
@ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Error interno del servidor' })
export class ServiceController {
  constructor(
    private readonly serviceService: ServiceService,
    private readonly supabaseStorage: SupabaseStorageService
  ) {}

  @Post('create')
  @Roles(Role.ADMIN, Role.USER)
  @UseInterceptors(FileInterceptor('files', {
    storage: memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (req, file, cb) => {
      if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
        return cb(new Error('Solo se permiten imágenes (jpg, jpeg, png, gif)'), false);
      }
      cb(null, true);
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Crear un nuevo servicio',
    description: 'Permite a un administrador registrar un nuevo servicio en el sistema con imágenes opcionales.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'status', 'name', 'price', 'orderId'],
      properties: {
        type: { type: 'string', enum: Object.values(ServiceType), example: 'REPAIR' },
        status: { type: 'string', enum: Object.values(ServiceStatus), example: 'IN_PROGRESS' },
        name: { type: 'string', example: 'Reparación de motor' },
        description: { type: 'string', example: 'Revisión y reparación completa del motor' },
        price: { type: 'number', example: 250.00 },
        orderId: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary'
          },
          description: 'Archivos de imagen (máx. 5, 5MB cada uno)'
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'El servicio ha sido creado exitosamente',
    type: Service 
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Datos de entrada inválidos o faltantes' 
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'No tiene permisos para realizar esta acción' 
  })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createServiceDto: CreateServiceDto,
    @UploadedFiles() files?: Express.Multer.File[]
  ): Promise<Service> {
    try {
      // Subir imágenes a Supabase si hay archivos
      if (files && files.length > 0) {
        const uploadedFiles = await this.supabaseStorage.uploadServicePhotos(
          files.map(file => ({
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype
          }))
        );
        createServiceDto.photoUrls = uploadedFiles;
      }

      return this.serviceService.create(createServiceDto);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('findAll')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({
    summary: 'Obtener lista de servicios',
    description: 'Obtiene una lista paginada de servicios. Puede filtrarse por estado y tipo.'
  })
  @ApiQuery({ 
    name: 'status', 
    required: false, 
    enum: ServiceStatus, 
    description: 'Filtrar servicios por estado',
    example: 'IN_PROGRESS'
  })
  @ApiQuery({ 
    name: 'type', 
    required: false, 
    enum: ServiceType, 
    description: 'Filtrar servicios por tipo',
    example: 'REPAIR'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Lista de servicios obtenida exitosamente', 
    type: [Service] 
  })
  async findAll(
    @Query('status') status?: ServiceStatus,
    @Query('type') type?: ServiceType,
  ): Promise<Service[]> {
    return this.serviceService.findAll(status, type);
  }

  @Get('findOne/:id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({
    summary: 'Obtener servicio por ID',
    description: 'Obtiene los detalles completos de un servicio específico mediante su ID.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID único del servicio (UUID)', 
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: true 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Servicio encontrado', 
    type: Service 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'No se encontró ningún servicio con el ID proporcionado' 
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Service> {
    return this.serviceService.findOne(id);
  }

  @Patch('update/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Actualizar un servicio',
    description: 'Actualiza los datos de un servicio existente. Solo actualiza los campos proporcionados.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID único del servicio a actualizar', 
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: true 
  })
  @ApiBody({ 
    type: UpdateServiceDto,
    description: 'Campos del servicio a actualizar',
    examples: {
      actualizarEstado: {
        summary: 'Actualizar estado',
        value: { status: 'COMPLETED' }
      },
      actualizarPrecio: {
        summary: 'Actualizar precio',
        value: { price: 300.00 }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Servicio actualizado exitosamente', 
    type: Service 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'No se encontró el servicio especificado' 
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'No tiene permisos para realizar esta acción' 
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateServiceDto: UpdateServiceDto
  ): Promise<Service> {
    return this.serviceService.update(id, updateServiceDto);
  }

  @Delete('remove/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar un servicio',
    description: 'Elimina permanentemente un servicio del sistema. Esta acción no se puede deshacer.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID único del servicio a eliminar',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: true 
  })
  @ApiResponse({ 
    status: HttpStatus.NO_CONTENT, 
    description: 'Servicio eliminado exitosamente' 
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'No se encontró el servicio especificado' 
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'No tiene permisos para realizar esta acción' 
  })
  @ApiResponse({ 
    status: HttpStatus.CONFLICT, 
    description: 'No se puede eliminar el servicio porque tiene registros asociados' 
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.serviceService.remove(id);
  }
}
