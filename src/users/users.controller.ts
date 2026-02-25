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
  ValidationPipe,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateSimpleUserDto } from '../auth/dto/create-simple-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '@prisma/client';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
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
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { CreateUserFromEmployedDto } from './dto/create-user-from-employed.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { TenantFeature } from '@prisma/client';

@ApiTags('Users')
@Controller('users')
@RequireTenantFeatures(TenantFeature.USERS)
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

  @Post('from-employed')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.CONVERT_EMPLOYEE_TO_USER)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 20, windowSeconds: 60 }],
  })
  async createFromEmployed(
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateUserFromEmployedDto,
    @Request() req: any,
  ) {
    return this.usersService.createFromEmployed(dto, req.user);
  }

  @Post('upload-avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
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
      const user = await this.usersService.findOne(targetUserId, req.user);
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
      }, req.user);

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
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async createUser(@Body() createUserDto: CreateSimpleUserDto, @Request() req: any) {
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
      permissions: createUserDto.permissions || [] // Pasar permisos
    };

    this.logger.debug(`Datos del usuario a crear: ${JSON.stringify({...userData, password: '***'})}`);
    
    try {
      const user = await this.usersService.create(userData, req.user);
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
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_USERS)
  async findAll(@Request() req: any) {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    return this.usersService.findAll(tenantId);
  }

  @Get('lookup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.USER)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 120, windowSeconds: 60 }],
  })
  async lookup(@Request() req: any) {
    return this.usersService.lookup(req.user);
  }

  @Put('change-password')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async changePassword(@Body() changePasswordDto: ChangePasswordDto, @Request() req: any) {
    try {
      const userId = req.user?.id || req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new UnauthorizedException('No se pudo autenticar al usuario');
      }

      if (changePasswordDto.newPassword !== changePasswordDto.confirmNewPassword) {
        throw new BadRequestException('Las contraseñas no coinciden');
      }

      const user = await this.usersService.findById(userId, req.user);
      if (!user) {
        this.logger.warn(`Usuario no encontrado con ID: ${userId}`);
        throw new NotFoundException('Usuario no encontrado');
      }

      if (user.role !== Role.USER) {
        throw new ForbiddenException('Este endpoint es solo para usuarios con rol USER');
      }

      const isPasswordValid = await bcrypt.compare(
        changePasswordDto.currentPassword,
        user.password,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('La contraseña actual es incorrecta');
      }

      const hashedPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);
      await this.usersService.update(userId, { password: hashedPassword }, req.user);

      this.logger.log(`Contraseña actualizada exitosamente para el usuario ID: ${userId}`);

      return {
        message: 'Contraseña actualizada exitosamente',
      };
    } catch (error) {
      this.logger.error(`Error al cambiar la contraseña: ${error.message}`, error.stack);

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

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_USERS)
  async findOne(@Param('id') id: string, @Request() req: any) {
    this.logger.debug(`Buscando usuario con ID: ${id}`);
    
    try {
      const user = await this.usersService.findById(id, req.user);
      
      if (!user) {
        this.logger.warn(`Usuario no encontrado con ID: ${id}`);
        throw new NotFoundException('Usuario no encontrado');
      }

      // Obtener tiendas asociadas al usuario
      let stores: { id: string; name: string; address: string | null; phone: string | null; createdAt: Date; updatedAt: Date; createdById: string | null }[] = [];

      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        throw new UnauthorizedException('TenantId no encontrado en el token');
      }
      
      if (user.role === 'ADMIN') {
        // ADMIN: obtener todas las tiendas
        stores = await this.prisma.store.findMany({
          where: { tenantId },
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
        // USER: obtener tiendas asignadas
        const userStores = await this.prisma.storeUsers.findMany({
          where: { userId: id, store: { tenantId } },
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

      // Excluir campos sensibles de la respuesta
      const { password, passwordResetToken, passwordResetTokenExpires, verifyToken, verifyTokenExpires, ...userResponse } = user;
      
      this.logger.log(`Usuario con ID ${id} encontrado exitosamente con ${stores.length} tiendas`);
      return {
        ...userResponse,
        stores
      };
    } catch (error) {
      this.logger.error(`Error al buscar usuario ${id}: ${error.message}`);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Error al obtener el usuario');
    }
  }

  @Put('update/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @Request() req: Request & { user: { userId: string; email: string; role: Role; permissions?: string[] } }) {
    this.logger.debug(`Iniciando actualización de usuario con ID: ${id}`);
    this.logger.debug(`Datos recibidos: ${JSON.stringify(updateUserDto)}`);
    this.logger.debug(`Usuario solicitante: ${req.user.userId}, Rol: ${req.user.role}`);

    try {
      // Verificar que el usuario exista
      const existingUser = await this.usersService.findOne(id, req.user as any);
      if (!existingUser) {
        this.logger.warn(`Usuario no encontrado con ID: ${id}`);
        throw new NotFoundException('Usuario no encontrado');
      }

      // Validar permisos: 
      // - USER solo puede editar sus propios datos, a menos que tenga permiso MANAGE_USERS
      // - ADMIN puede editar cualquiera
      if (req.user.role === Role.USER && req.user.userId !== id) {
        // Verificar si el usuario tiene el permiso MANAGE_USERS
        const userPermissions = req.user.permissions || [];
        const hasManageUsersPermission = userPermissions.includes(PERMISSIONS.MANAGE_USERS);
        
        if (!hasManageUsersPermission) {
          this.logger.warn(`USER ${req.user.userId} intentando editar datos de otro usuario ${id} sin permiso MANAGE_USERS`);
          throw new ForbiddenException('No tienes permisos para editar este usuario');
        }
      }

      // Para USER, restringir algunos campos que solo ADMIN puede modificar
      // a menos que tenga el permiso MANAGE_USERS
      if (req.user.role === Role.USER) {
        const userPermissions = req.user.permissions || [];
        const hasManageUsersPermission = userPermissions.includes(PERMISSIONS.MANAGE_USERS);
        
        if (!hasManageUsersPermission) {
          const { storeId, status, verified, ...allowedUpdateData } = updateUserDto;
          
          // Si USER intenta modificar campos restringidos, lanzar error
          if (storeId || status !== undefined || verified !== undefined) {
            this.logger.warn(`USER ${req.user.userId} intentando modificar campos restringidos sin permiso MANAGE_USERS`);
            throw new ForbiddenException('No tienes permisos para modificar estos campos. Se requiere permiso de administrador.');
          }
          
          updateUserDto = allowedUpdateData;
        }
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
        const updatedUser = await this.usersService.updateUser(id, userUpdateData, req.user as any);
        
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
            where: { tenantId: (req.user as any)?.tenantId },
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
            where: { userId: id, store: { tenantId: (req.user as any)?.tenantId } },
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
        const updatedUser = await this.usersService.updateUser(id, updateUserDto, req.user as any);

        // Obtener tiendas actuales del usuario para mantener consistencia
        let stores: { id: string; name: string; address: string | null; phone: string | null; createdAt: Date; updatedAt: Date; createdById: string | null }[] = [];
        if (updatedUser.role === 'ADMIN') {
          stores = await this.prisma.store.findMany({
            where: { tenantId: (req.user as any)?.tenantId },
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
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async changeRole(@Body() changeRoleDto: ChangeRoleDto, @Request() req: any) {
    this.logger.debug(`Iniciando cambio de rol para el email: ${changeRoleDto.email}`);
    this.logger.debug(`Nuevo rol solicitado: ${changeRoleDto.newRole}`);
    this.logger.debug(`Usuario ADMIN ejecutando: ${req.user.email} (ID: ${req.user.sub})`);

    try {
      // Verificar que el usuario que hace la petición sea ADMIN o USER con permiso MANAGE_USERS
      if (req.user.role !== Role.ADMIN) {
        // Si no es ADMIN, verificar que sea USER con permiso MANAGE_USERS
        if (req.user.role === Role.USER) {
          const userPermissions = req.user.permissions || [];
          const hasManageUsersPermission = userPermissions.includes(PERMISSIONS.MANAGE_USERS);
          
          if (!hasManageUsersPermission) {
            this.logger.warn(`Intento no autorizado de cambio de rol por USER sin permiso MANAGE_USERS: ${req.user.email}`);
            throw new ForbiddenException('No tienes permisos para cambiar roles. Se requiere permiso MANAGE_USERS.');
          }
        } else {
          this.logger.warn(`Intento no autorizado de cambio de rol por usuario no autorizado: ${req.user.email}`);
          throw new ForbiddenException('No tienes permisos para cambiar roles');
        }
      }

      // Validar las credenciales del usuario cuyo rol se quiere cambiar
      const userToUpdate = await this.authService.validateAnyUser(changeRoleDto.email, changeRoleDto.password);

      this.logger.debug(`Usuario a actualizar validado: ${userToUpdate.email} (ID: ${userToUpdate.id})`);

      // Verificar que el usuario no esté intentando cambiar su propio rol
      if (req.user.sub === userToUpdate.id || req.user.email === userToUpdate.email) {
        this.logger.warn(`Usuario ${req.user.email} intentando cambiar su propio rol`);
        throw new ForbiddenException('No puedes cambiar tu propio rol');
      }

      // Verificar que el usuario validado exista en la base de datos
      const currentUser = await this.usersService.findOne(userToUpdate.id, req.user);
      if (!currentUser) {
        this.logger.warn(`Usuario validado no encontrado en la base de datos: ${userToUpdate.id}`);
        throw new NotFoundException('Usuario no encontrado');
      }

      // Validar que el usuario solo pueda asignar roles que él mismo posee
      if (req.user.role !== Role.ADMIN) {
        // Si no es ADMIN, solo puede asignar roles que él mismo tenga
        const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.role];
        
        if (!userRoles.includes(changeRoleDto.newRole)) {
          this.logger.warn(`Usuario ${req.user.email} intentando asignar rol ${changeRoleDto.newRole} que no posee`);
          throw new ForbiddenException(`No puedes asignar el rol ${changeRoleDto.newRole} porque no lo posees. Tus roles actuales: ${userRoles.join(', ')}`);
        }
      }

      // Actualizar el rol del usuario validado
      const updatedUser = await this.usersService.update(userToUpdate.id, { role: changeRoleDto.newRole }, req.user);

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
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.DELETE_USERS)
  async remove(@Param('id') id: string, @Request() req: any) {
    this.logger.debug(`Iniciando soft delete del usuario con ID: ${id}`);
    
    try {
      const result = await this.usersService.deleteUserById(id, req.user);
      this.logger.log(`Usuario con ID ${id} marcado como DELETED exitosamente`);
      return result;
    } catch (error) {
      this.logger.error(`Error al realizar soft delete del usuario ${id}: ${error.message}`);
      throw error;
    }
  }
}
