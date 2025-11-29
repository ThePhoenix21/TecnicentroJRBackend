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
import { User } from '@prisma/client';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as bcrypt from 'bcrypt';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/auth/enums/role.enum';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { CreateUserResponseDto } from 'src/auth/dto/create-user-response.dto';
import { generateUsername } from 'src/common/utility/usernameGenerator';
import { supabase } from '../supabase.client';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  private readonly BUCKET_NAME = 'tecnicentroJR-img';
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService
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
      this.logger.debug('Datos del usuario autenticado:', JSON.stringify(req.user));
      
      // Obtener el ID del usuario de diferentes formas posibles del token JWT
      const userId = req.user?.id || req.user?.sub || req.user?.userId;
      
      if (!userId) {
        this.logger.error('No se pudo obtener el ID del usuario del token JWT');
        throw new UnauthorizedException('No se pudo autenticar al usuario');
      }

      // Asegurarse de que el rol esté definido
      const userRole = req.user?.role || Role.USER;

      // Crear un objeto de solicitud modificado que incluya la información necesaria
      const modifiedReq = {
        ...req,
        user: {
          ...req.user,
          id: userId,
          sub: userId,  // Asegurar que 'sub' esté definido
          role: userRole
        }
      };
      
      // Llamar a uploadAvatar con el ID del usuario autenticado
      return await this.uploadAvatar(file, userId, modifiedReq);
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
      storeId: createUserDto.storeId, // Agregar el storeId (obligatorio)
    };

    this.logger.debug(`Datos del usuario a crear: ${JSON.stringify({...userData, password: '***'})}`);
    
    try {
      const user = await this.usersService.create(userData);
      this.logger.debug(`Usuario creado exitosamente con ID: ${user.id}`);
      
      // Registrar asociación con la tienda (ahora es obligatorio)
      this.logger.debug(`Usuario asociado obligatoriamente a la tienda con ID: ${createUserDto.storeId}`);
      
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
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
          email: { type: 'string', example: 'usuario@ejemplo.com' },
          name: { type: 'string', example: 'Nombre del Usuario' },
          role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'USER' },
          status: { 
            type: 'string', 
            enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED'], 
            example: 'ACTIVE',
            description: 'Estado actual del usuario'
          },
          phone: { type: 'string', example: '+123456789' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          stores: {
            type: 'array',
            description: 'Tiendas asociadas al usuario (para ADMIN: todas las tiendas, para USER: tiendas asignadas)',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
                name: { type: 'string', example: 'Tienda Principal' },
                address: { type: 'string', example: 'Av. Principal 123' },
                phone: { type: 'string', example: '+123456789' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
                createdById: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' }
              }
            }
          }
        }
      }
    }
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
  @UseGuards(JwtAuthGuard)
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
  @Put('change-password')
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @Request() req: any
  ) {
    const userId = req.user.userId;    
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

  @Put('update/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({
    summary: 'Actualizar perfil de usuario',
    description: 'Actualiza los datos del perfil de un usuario existente. ADMIN puede editar cualquier usuario, USER solo puede editar sus propios datos. No permite cambiar rol ni contraseña.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID del usuario a actualizar (USER solo puede usar su propio ID)',
    example: '550e8400-e29b-41d4-a716-446655440001'
  })
  @ApiBody({
    description: 'Datos del usuario a actualizar (sin rol ni contraseña). Todos los campos son opcionales.',
    type: UpdateUserDto,
    examples: {
      ejemplo_actualizacion_user: {
        summary: 'Actualización de usuario normal (USER)',
        description: 'Ejemplo de lo que un USER puede editar de su propio perfil (campos restringidos no permitidos)',
        value: {
          name: 'Juan Pérez Actualizado',
          phone: '+346987654321',
          language: 'es',
          timezone: 'Europe/Madrid',
          birthdate: '1990-01-01'
        }
      },
      ejemplo_actualizacion_admin: {
        summary: 'Actualización completa por ADMIN',
        description: 'Ejemplo de lo que un ADMIN puede editar de cualquier usuario (incluyendo campos restringidos)',
        value: {
          name: 'María García López',
          email: 'maria.garcia@ejemplo.com',
          phone: '+346123456789',
          username: 'maria.garcia',
          birthdate: '1990-01-01',
          language: 'es',
          timezone: 'Europe/Madrid',
          status: 'ACTIVE',
          avatarUrl: 'https://example.com/avatars/maria.jpg',
          verified: true,
          storeId: '550e8400-e29b-41d4-a716-446655440003'
        }
      },
      ejemplo_cambio_tienda: {
        summary: 'Cambiar tienda asignada al usuario',
        description: 'Ejemplo para cambiar la tienda a la que pertenece un usuario (solo para USER)',
        value: {
          storeId: '550e8400-e29b-41d4-a716-446655440003'
        }
      },
      ejemplo_cambio_estado: {
        summary: 'Cambiar estado del usuario',
        description: 'Ejemplo para activar/desactivar un usuario',
        value: {
          status: 'INACTIVE'
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario actualizado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
        email: { type: 'string', example: 'usuario@ejemplo.com' },
        name: { type: 'string', example: 'Nombre del Usuario' },
        role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'USER' },
        phone: { type: 'string', example: '+123456789' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        stores: {
          type: 'array',
          description: 'Tiendas asociadas al usuario',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
              name: { type: 'string', example: 'Tienda Principal' },
              address: { type: 'string', example: 'Av. Principal 123' },
              phone: { type: 'string', example: '+123456789' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
              createdById: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuario no encontrado',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Usuario no encontrado' }
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
        message: { type: 'string', example: 'Datos de entrada inválidos' },
        details: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', example: 'email' },
              message: { type: 'string', example: 'Email inválido' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 403, 
    description: 'No autorizado - Requiere rol de ADMIN',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'No autorizado' }
      }
    }
  })
  @ApiResponse({ 
    status: 409, 
    description: 'Conflicto - Email o username ya existen',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 409 },
        message: { type: 'string', example: 'El correo electrónico ya está en uso' }
      }
    }
  })
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @Request() req: Request & { user: { userId: string; email: string; role: Role } }) {
    this.logger.debug(`Iniciando actualización de usuario con ID: ${id}`);
    this.logger.debug(`Datos recibidos: ${JSON.stringify(updateUserDto)}`);
    this.logger.debug(`Usuario solicitante: ${req.user.userId}, Rol: ${req.user.role}`);

    try {
      // Verificar que el usuario exista
      const existingUser = await this.usersService.findOne(id);
      if (!existingUser) {
        this.logger.warn(`Usuario no encontrado con ID: ${id}`);
        throw new NotFoundException('Usuario no encontrado');
      }

      // Validar permisos: USER solo puede editar sus propios datos, ADMIN puede editar cualquiera
      if (req.user.role === Role.USER && req.user.userId !== id) {
        this.logger.warn(`USER ${req.user.userId} intentando editar datos de otro usuario ${id}`);
        throw new ForbiddenException('No tienes permisos para editar este usuario');
      }

      // Para USER, restringir algunos campos que solo ADMIN puede modificar
      if (req.user.role === Role.USER) {
        const { storeId, status, verified, ...allowedUpdateData } = updateUserDto;
        
        // Si USER intenta modificar campos restringidos, lanzar error
        if (storeId || status !== undefined || verified !== undefined) {
          this.logger.warn(`USER ${req.user.userId} intentando modificar campos restringidos`);
          throw new ForbiddenException('No tienes permisos para modificar estos campos. Solo ADMIN puede modificar storeId, status y verified.');
        }
        
        updateUserDto = allowedUpdateData;
      }

      // Si se incluye storeId, validar que exista y manejar el cambio
      if (updateUserDto.storeId) {
        // Verificar que la tienda exista
        const store = await this.prisma.store.findUnique({
          where: { id: updateUserDto.storeId }
        });

        if (!store) {
          this.logger.warn(`Tienda no encontrada con ID: ${updateUserDto.storeId}`);
          throw new BadRequestException(`Tienda no encontrada con ID: ${updateUserDto.storeId}`);
        }

        // Eliminar asignaciones actuales del usuario a tiendas
        await this.prisma.storeUsers.deleteMany({
          where: { userId: id }
        });

        // Crear nueva asignación a la tienda especificada
        await this.prisma.storeUsers.create({
          data: {
            userId: id,
            storeId: updateUserDto.storeId
          }
        });

        this.logger.log(`Usuario ${id} asignado a la tienda ${updateUserDto.storeId}`);

        // Eliminar storeId del DTO para no intentar actualizarlo directamente en el usuario
        const { storeId, ...userUpdateData } = updateUserDto;
        
        // Actualizar otros datos del usuario
        const updatedUser = await this.usersService.updateUser(id, userUpdateData);
        
        // Obtener el usuario actualizado con su nueva tienda
        const userWithNewStore = await this.prisma.user.findUnique({
          where: { id },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            phone: true,
            createdAt: true,
            updatedAt: true
          }
        });

        // Obtener la nueva tienda asignada
        let stores: { id: string; name: string; address: string | null; phone: string | null; createdAt: Date; updatedAt: Date; createdById: string | null }[] = [];
        if (userWithNewStore?.role === 'ADMIN') {
          stores = await this.prisma.store.findMany({
            select: {
              id: true,
              name: true,
              address: true,
              phone: true,
              createdAt: true,
              updatedAt: true,
              createdById: true
            }
          });
        } else {
          const userStores = await this.prisma.storeUsers.findMany({
            where: { userId: id },
            include: {
              store: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                  phone: true,
                  createdAt: true,
                  updatedAt: true,
                  createdById: true
                }
              }
            }
          });
          stores = userStores.map(us => us.store);
        }

        this.logger.log(`Usuario actualizado exitosamente con ID: ${id} por ${req.user.userId}`);

        return {
          ...userWithNewStore,
          stores
        };
      } else {
        // Actualizar usuario sin cambiar tienda
        const updatedUser = await this.usersService.updateUser(id, updateUserDto);

        // Obtener tiendas actuales del usuario para mantener consistencia
        let stores: { id: string; name: string; address: string | null; phone: string | null; createdAt: Date; updatedAt: Date; createdById: string | null }[] = [];
        if (updatedUser.role === 'ADMIN') {
          stores = await this.prisma.store.findMany({
            select: {
              id: true,
              name: true,
              address: true,
              phone: true,
              createdAt: true,
              updatedAt: true,
              createdById: true
            }
          });
        } else {
          const userStores = await this.prisma.storeUsers.findMany({
            where: { userId: id },
            include: {
              store: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                  phone: true,
                  createdAt: true,
                  updatedAt: true,
                  createdById: true
                }
              }
            }
          });
          stores = userStores.map(us => us.store);
        }

        this.logger.log(`Usuario actualizado exitosamente con ID: ${id} por ${req.user.userId}`);

        return {
          ...updatedUser,
          stores
        };
      }
    } catch (error) {
      this.logger.error(`Error al actualizar usuario: ${error.message}`, error.stack);

      // Reenviar el error si ya es una excepción conocida
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      throw new InternalServerErrorException('Error al actualizar el usuario');
    }
  }

  @Put('change-role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Cambiar rol de usuario',
    description: 'Cambia el rol de un usuario existente. REQUIERE: 1) Usuario ADMIN autenticado con JWT, 2) Credenciales válidas (email/password) del usuario cuyo rol se cambiará. Incluye auditoría completa de quién realizó el cambio.'
  })
  @ApiBody({
    description: 'Credenciales del usuario y nuevo rol',
    type: ChangeRoleDto,
    examples: {
      example: {
        value: {
          email: 'usuario@example.com',
          password: 'contraseñaSegura123',
          newRole: 'ADMIN'
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Rol actualizado exitosamente',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Rol actualizado exitosamente' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'uuid' },
            email: { type: 'string', example: 'usuario@example.com' },
            name: { type: 'string', example: 'Nombre Usuario' },
            role: { type: 'string', example: 'ADMIN' }
          }
        },
        changedBy: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'admin-uuid' },
            email: { type: 'string', example: 'admin@example.com' },
            role: { type: 'string', example: 'ADMIN' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  async changeRole(@Body() changeRoleDto: ChangeRoleDto, @Request() req: any) {
    this.logger.debug(`Iniciando cambio de rol para el email: ${changeRoleDto.email}`);
    this.logger.debug(`Nuevo rol solicitado: ${changeRoleDto.newRole}`);
    this.logger.debug(`Usuario ADMIN ejecutando: ${req.user.email} (ID: ${req.user.sub})`);

    try {
      // Verificar que el usuario que hace la petición sea ADMIN (redundante, pero explícito)
      if (req.user.role !== Role.ADMIN) {
        this.logger.warn(`Intento no autorizado de cambio de rol por usuario no ADMIN: ${req.user.email}`);
        throw new ForbiddenException('Solo usuarios con rol ADMIN pueden cambiar roles');
      }

      // Validar las credenciales del usuario cuyo rol se quiere cambiar
      const userToUpdate = await this.authService.validateAnyUser(changeRoleDto.email, changeRoleDto.password);

      this.logger.debug(`Usuario a actualizar validado: ${userToUpdate.email} (ID: ${userToUpdate.id})`);

      // Verificar que el usuario validado exista en la base de datos
      const currentUser = await this.usersService.findOne(userToUpdate.id);
      if (!currentUser) {
        this.logger.warn(`Usuario validado no encontrado en la base de datos: ${userToUpdate.id}`);
        throw new NotFoundException('Usuario no encontrado');
      }

      // Actualizar el rol del usuario validado
      const updatedUser = await this.usersService.update(userToUpdate.id, { role: changeRoleDto.newRole });

      this.logger.log(`Rol actualizado exitosamente por ADMIN ${req.user.email} para usuario ${userToUpdate.email} (ID: ${userToUpdate.id}) de ${userToUpdate.role} a ${changeRoleDto.newRole}`);

      return {
        message: 'Rol actualizado exitosamente',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: updatedUser.role
        },
        changedBy: {
          id: req.user.sub,
          email: req.user.email,
          role: req.user.role
        }
      };
    } catch (error) {
      this.logger.error(`Error al cambiar rol: ${error.message}`, error.stack);

      // Reenviar el error si ya es una excepción conocida
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      throw new InternalServerErrorException('Error al cambiar el rol del usuario');
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ 
    summary: 'Eliminar usuario (Soft Delete)',
    description: 'Realiza un soft delete de un usuario cambiando su status a DELETED. El usuario no se elimina físicamente de la base de datos. Requiere rol de ADMIN.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID del usuario a eliminar (soft delete)',
    example: '550e8400-e29b-41d4-a716-446655440001'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Usuario eliminado exitosamente (soft delete)',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
        email: { type: 'string', example: 'usuario@ejemplo.com' },
        name: { type: 'string', example: 'Nombre del Usuario' },
        role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'USER' },
        status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED'], example: 'DELETED' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Usuario no encontrado',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Usuario no encontrado' }
      }
    }
  })
  @ApiResponse({ 
    status: 403, 
    description: 'No autorizado - Requiere rol de ADMIN',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'No autorizado' }
      }
    }
  })
  async remove(@Param('id') id: string) {
    this.logger.debug(`Iniciando soft delete del usuario con ID: ${id}`);
    
    try {
      const result = await this.usersService.deleteUserById(id);
      this.logger.log(`Usuario con ID ${id} marcado como DELETED exitosamente`);
      return result;
    } catch (error) {
      this.logger.error(`Error al realizar soft delete del usuario ${id}: ${error.message}`);
      throw error;
    }
  }
}
