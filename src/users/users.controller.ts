import { 
  Controller, 
  Post, 
  Get,
  Put,
  Delete,
  Body, 
  Param,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiConsumes } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateSimpleUserDto } from '../auth/dto/create-simple-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Role, User } from '@prisma/client';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as bcrypt from 'bcrypt';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserResponseDto } from 'src/auth/dto/create-user-response.dto';
import { generateUsername } from 'src/common/utility/usernameGenerator';
import { supabase } from '../supabase.client';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  private readonly BUCKET_NAME = 'tecnicentroJR-img';
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService
  ) {
    // Asegurarse de que el bucket exista al iniciar
    this.initializeBucket();
  }

  private readonly logger = new Logger(UsersController.name);

  private async initializeBucket() {
    try {
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      
      if (listError) {
        this.logger.error('Error al listar los buckets:', listError);
        return;
      }

      const bucketExists = buckets?.some(bucket => bucket.name === this.BUCKET_NAME);
      
      if (!bucketExists) {
        this.logger.log(`Creando bucket: ${this.BUCKET_NAME}`);
        const { error: createError } = await supabase.storage.createBucket(this.BUCKET_NAME, {
          public: true,
          allowedMimeTypes: this.ALLOWED_FILE_TYPES,
          fileSizeLimit: this.MAX_FILE_SIZE,
        });

        if (createError) {
          this.logger.error('Error al crear el bucket:', createError);
          return;
        }
        
        this.logger.log(`Bucket ${this.BUCKET_NAME} creado exitosamente`);
      } else {
        this.logger.log(`Bucket ${this.BUCKET_NAME} ya existe`);
      }
    } catch (error) {
      this.logger.error('Error al inicializar el bucket de avatares:', error);
    }
  }

  @Post('upload-avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ 
    summary: 'Subir avatar de usuario', 
    description: 'Sube una imagen como avatar. Los administradores pueden subir para cualquier usuario especificando userId, los usuarios regulares solo pueden subir su propio avatar.' 
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo de imagen (JPG, JPEG, PNG) hasta 5MB'
        },
        userId: {
          type: 'string',
          description: 'ID del usuario al que se le asignará el avatar (solo para administradores)'
        }
      },
      required: ['file']
    }
  })
  @ApiResponse({ status: 200, description: 'Avatar actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Archivo no válido o usuario no encontrado' })
  @ApiResponse({ status: 403, description: 'No autorizado para actualizar este perfil' })
  async uploadAvatar(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png)$/ }),
        ],
      }),
    ) file: Express.Multer.File,
    @Body('userId') userId: string,
    @Request() req: any
  ) {
    // Determinar el ID del usuario objetivo
    const targetUserId = req.user.role === Role.ADMIN && userId ? userId : req.user.sub;
    
    // Verificar que el usuario sea el propietario o un administrador
    if (req.user.role !== Role.ADMIN && req.user.sub !== targetUserId) {
      this.logger.warn(`Intento no autorizado: Usuario ${req.user.sub} intentó actualizar avatar de ${targetUserId}`);
      throw new ForbiddenException('No tienes permiso para actualizar este perfil');
    }

    try {
      const user = await this.usersService.findOne(targetUserId);
      if (!user) {
        throw new BadRequestException('Usuario no encontrado');
      }

      // Generar un nombre de archivo único
      const fileExtension = path.extname(file.originalname).toLowerCase();
      const fileName = `${uuidv4()}${fileExtension}`;
      const filePath = `users/${targetUserId}/${fileName}`;

      // Subir a Supabase
      const { error: uploadError } = await supabase.storage
        .from(this.BUCKET_NAME)
        .upload(filePath, file.buffer, {
          cacheControl: '31536000', // 1 año en segundos
          upsert: true,
          contentType: file.mimetype,
        });

      if (uploadError) {
        this.logger.error('Error al subir el archivo a Supabase:', uploadError);
        throw new BadRequestException('Error al subir el archivo');
      }

      // Generar una URL firmada con expiración de 1 año (en segundos)
      const { data, error: signedUrlError } = await supabase.storage
        .from(this.BUCKET_NAME)
        .createSignedUrl(filePath, 31536000); // 1 año en segundos
      
      if (signedUrlError || !data?.signedUrl) {
        this.logger.error('Error al generar URL firmada:', signedUrlError);
        throw new BadRequestException('No se pudo generar la URL del avatar');
      }

      const avatarUrl = data.signedUrl;

      // Actualizar el usuario con la nueva URL del avatar
      const updatedUser = await this.usersService.update(targetUserId, { 
        avatarUrl
      });

      return {
        message: 'Avatar actualizado exitosamente',
        avatarUrl,
        user: updatedUser
      };
    } catch (error) {
      this.logger.error('Error al subir el avatar:', error);
      throw error;
    }
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ 
    summary: 'Subir mi avatar', 
    description: 'Sube una imagen como avatar del usuario autenticado' 
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo de imagen (JPG, JPEG, PNG) hasta 5MB'
        }
      },
      required: ['file']
    }
  })
  @ApiResponse({ status: 200, description: 'Avatar actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Archivo no válido' })
  async uploadMyAvatar(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png)$/ }),
        ],
      }),
    ) file: Express.Multer.File,
    @Request() req: any
  ) {
    try {
      if (!req.user || !req.user.id) {
        throw new UnauthorizedException('Usuario no autenticado');
      }

      // Crear un objeto de solicitud modificado que incluye el ID del usuario
      const modifiedReq = {
        ...req,
        body: {
          ...req.body,
          userId: req.user.id // Asegurarse de que el userId esté en el body
        },
        user: {
          ...req.user,
          sub: req.user.id,
          role: req.user.role
        }
      };
      
      return await this.uploadAvatar(file, req.user.id, modifiedReq);
    } catch (error) {
      this.logger.error('Error en uploadMyAvatar:', error);
      throw error;
    }
  }

  @Post('create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Crear nuevo usuario',
    description: 'Crea un nuevo usuario con los datos proporcionados. El username se generará automáticamente si no se especifica. Requiere rol de ADMIN',
  })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({
    status: 409,
    description: 'El correo electrónico o teléfono ya está en uso',
  })
  async createUser(@Body() createUserDto: CreateSimpleUserDto) {
    this.logger.debug('Iniciando creación de usuario');
    this.logger.debug(`Datos recibidos: ${JSON.stringify(createUserDto)}`);

    // Generar username automáticamente si no se proporciona
    const username = createUserDto.username || generateUsername();
    this.logger.debug(`Username generado: ${username}`);

    // Validar que el email esté presente
    if (!createUserDto.email) {
      this.logger.error('El correo electrónico es obligatorio');
      throw new Error('El correo electrónico es obligatorio');
    }

    // Preparar los datos del usuario
    const userData = {
      name: createUserDto.name,
      username,
      password: createUserDto.password,
      email: createUserDto.email, // Ya validado que no es undefined
      phone: createUserDto.phone || 'sin_telefono',
      role: Role.USER, // Siempre será USER en este controlador
      language: 'es',
      timezone: 'UTC',
      verified: true, // Usuario verificado por defecto
    };

    this.logger.debug(`Datos del usuario a crear: ${JSON.stringify({...userData, password: '***'})}`);
    
    try {
      const user = await this.usersService.create(userData);
      this.logger.debug(`Usuario creado exitosamente con ID: ${user.id}`);
      return user;
    } catch (error) {
      this.logger.error(`Error al crear usuario: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ 
    summary: 'Obtener todos los usuarios',
    description: 'Obtiene una lista de todos los usuarios registrados. Requiere rol de ADMIN'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de usuarios obtenida exitosamente',
    type: [CreateUserResponseDto]
  })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  async findAll() {
    return this.usersService.findAll();
  }

  @Put('change-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  @ApiOperation({
    summary: 'Cambiar contraseña de usuario',
    description: 'Permite a un usuario con rol USER cambiar su contraseña. Se requiere la contraseña actual para realizar el cambio.'
  })
  @ApiBody({
    description: 'Datos requeridos para el cambio de contraseña',
    type: ChangePasswordDto,
    examples: {
      example: {
        value: {
          currentPassword: 'contraseñaActual123',
          newPassword: 'nuevaContraseñaSegura123',
          confirmNewPassword: 'nuevaContraseñaSegura123'
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Contraseña actualizada exitosamente',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Contraseña actualizada exitosamente' },
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de entrada inválidos',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Las contraseñas no coinciden' },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'La contraseña actual es incorrecta' },
        error: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @Request() req: any
  ) {
    const userId = req.user.id;
    this.logger.log(`Iniciando cambio de contraseña para el usuario ID: ${userId}`);

    try {
      // Validar que las nuevas contraseñas coincidan
      if (changePasswordDto.newPassword !== changePasswordDto.confirmNewPassword) {
        throw new BadRequestException('Las contraseñas no coinciden');
      }

      // Obtener el usuario actual
      const user = await this.usersService.findById(userId);
      if (!user) {
        this.logger.warn(`Usuario no encontrado con ID: ${userId}`);
        throw new NotFoundException('Usuario no encontrado');
      }

      // Verificar que el usuario tenga el rol USER
      if (user.role !== Role.USER) {
        throw new ForbiddenException('Este endpoint es solo para usuarios con rol USER');
      }

      // Validar la contraseña actual
      const isPasswordValid = await bcrypt.compare(
        changePasswordDto.currentPassword,
        user.password
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('La contraseña actual es incorrecta');
      }

      // Actualizar la contraseña
      const hashedPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);
      await this.usersService.update(userId, { password: hashedPassword });
      
      this.logger.log(`Contraseña actualizada exitosamente para el usuario ID: ${userId}`);
      
      return {
        message: 'Contraseña actualizada exitosamente'
      };
    } catch (error) {
      this.logger.error(`Error al cambiar la contraseña: ${error.message}`, error.stack);
      
      // Reenviar el error si ya es una excepción conocida
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      
      throw new InternalServerErrorException('Error al cambiar la contraseña');
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ 
    summary: 'Eliminar usuario',
    description: 'Elimina un usuario del sistema. Requiere rol de ADMIN'
  })
  @ApiParam({ name: 'id', description: 'ID del usuario a eliminar' })
  @ApiResponse({ 
    status: 200, 
    description: 'Usuario eliminado exitosamente'
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async remove(@Param('id') id: string) {
    return this.usersService.deleteUserById(id);
  }
}
