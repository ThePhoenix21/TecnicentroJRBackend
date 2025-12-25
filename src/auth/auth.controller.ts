import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Res,
  Req,
  Patch,
  HttpStatus,
  Inject,
  forwardRef,
  UnauthorizedException,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CreateAdminFromJwtDto } from './dto/create-admin-from-jwt.dto';
import type { Response } from 'express';
import { CreateUserResponseDto } from './dto/create-user-response.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { TokensDto } from './dto/tokens.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthChangePasswordDto } from './dto/auth-change-password.dto';
import { UsersService } from 'src/users/users.service';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Role } from './enums/role.enum';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_PERMISSIONS } from './permissions';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly userService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('permissions')
  @ApiOperation({
    summary: 'Obtener lista de permisos disponibles',
    description: 'Devuelve el catálogo oficial de permisos que el backend reconoce para control de acceso granular.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de permisos obtenida correctamente',
    schema: {
      type: 'object',
      properties: {
        permissions: {
          type: 'array',
          items: { type: 'string' },
          example: ['VIEW_DASHBOARD', 'VIEW_INVENTORY', 'MANAGE_USERS'],
        },
      },
    },
  })
  getPermissions() {
    return { permissions: ALL_PERMISSIONS };
  }

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Crear un nuevo ADMIN (requiere JWT)',
    description: 'Crea un nuevo usuario con rol ADMIN dentro del mismo tenant del ADMIN autenticado. El tenantId se toma del JWT (no del body).',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuario registrado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
        email: { type: 'string', example: 'usuario@ejemplo.com' },
        name: { type: 'string', example: 'Nombre del Usuario' },
        username: { type: 'string', example: 'nombreusuario' },
        phone: { type: 'string', example: '+1234567890' },
        verified: { type: 'boolean', example: false },
        createdAt: { type: 'string', format: 'date-time', example: '2025-11-28T19:52:12.930Z' }
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
        message: { type: 'string', example: 'El email debe ser un correo válido' },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @ApiResponse({
    status: 409,
    description: 'El correo electrónico o nombre de usuario ya está en uso',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 409 },
        message: { type: 'string', example: 'El email ya está registrado' },
        error: { type: 'string', example: 'Conflict' }
      }
    }
  })
  @ApiBody({
    type: CreateAdminFromJwtDto,
    description: 'Datos del nuevo admin',
    examples: {
      example: {
        value: {
          email: 'admin2@correo.com',
          password: 'TuPassword1!',
          name: 'Nombre Admin',
          username: 'admin2',
          phone: '+1234567890',
          permissions: ['VIEW_DASHBOARD', 'MANAGE_ORDERS'],
        },
      },
    },
  })
  async register(
    @Req() req,
    @Body() registerDto: CreateAdminFromJwtDto,
  ): Promise<CreateUserResponseDto> {
    const tenantId: string | undefined = req.user?.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant no encontrado en el token');
    }

    const language = 'es';
    const timezone = 'UTC';

    // Registrar el usuario
    const user = await this.authService.register(
      registerDto.email,
      registerDto.password,
      registerDto.name,
      registerDto.username,
      tenantId,
      registerDto.phone,
      undefined,
      language,
      timezone,
      registerDto.permissions || [] // Pasar permisos
    );

    // Obtener tiendas del usuario (si es ADMIN, obtener todas las tiendas)
    let stores: any[] = [];
    if (user.role === 'ADMIN') {
      stores = await this.prisma.store.findMany({
        where: { tenantId: user.tenantId },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        }
      });
    } else {
      // Para usuarios normales, obtener sus tiendas asignadas
      const userStores = await this.prisma.storeUsers.findMany({
        where: { userId: user.id },
        include: {
          store: {
            include: {
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true
                }
              }
            }
          }
        }
      });
      stores = userStores.map(us => us.store);
    }

    // Devolver la respuesta
    const response: CreateUserResponseDto = {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      phone: user.phone,
      verified: user.verified, // Usar la propiedad 'verified' del modelo de usuario
      createdAt: user.createdAt,
      stores: stores // Incluir tiendas del usuario
    };

    return response;
  }
  
  @Post('refresh')
  @ApiOperation({
    summary: 'Refrescar token',
    description:
      'Obtiene un nuevo token de acceso usando un token de actualización almacenado en cookie HttpOnly. La cookie debe enviarse automáticamente con withCredentials: true',
  })
  @ApiResponse({
    status: 201,
    description: 'Token refrescado exitosamente',
    schema: {
      type: 'object',
      properties: {
        access_token: { 
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
        },
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
  })
  @ApiResponse({
    status: 401,
    description: 'Token de actualización inválido o expirado',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Token de actualización inválido' },
        error: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Cookie de refresh_token no encontrada',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'No se encontró cookie de refresh_token' },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  async refreshToken(@Req() req, @Res() res: Response, @Body('refreshToken') refreshToken: string) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    return this.authService.refreshToken(refreshToken, ipAddress, res);
  }

  @Post('login')
  @RateLimit({
    keyType: ['ip', 'identity'],
    rules: [
      { limit: 5, windowSeconds: 60 },
      { limit: 20, windowSeconds: 3600 },
    ],
    cooldownSeconds: 600,
  })
  @ApiOperation({
    summary: 'Iniciar sesión',
    description:
      'Autentica un usuario usando email y contraseña. Devuelve access_token en JSON y establece refresh_token en cookie HttpOnly segura',
  })
  @ApiBody({
    description: 'Credenciales de inicio de sesión',
    schema: {
      type: 'object',
      properties: {
        email: { 
          type: 'string', 
          format: 'email',
          example: 'usuario@ejemplo.com',
          description: 'Correo electrónico del usuario'
        },
        password: { 
          type: 'string', 
          format: 'password',
          example: 'contraseñaSegura123',
          description: 'Contraseña del usuario'
        }
      },
      required: ['email', 'password']
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Inicio de sesión exitoso',
    schema: {
      type: 'object',
      properties: {
        access_token: { 
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
        },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
            email: { type: 'string', example: 'usuario@ejemplo.com' },
            name: { type: 'string', example: 'Nombre del Usuario' },
            username: { type: 'string', example: 'nombreusuario' },
            role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'USER' },
            verified: { type: 'boolean', example: true },
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
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas o cuenta no verificada',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Credenciales inválidas' },
        error: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  @ApiResponse({
    status: 403,
    description: 'Cuenta no verificada',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Por favor verifica tu correo electrónico' },
        error: { type: 'string', example: 'Forbidden' }
      }
    }
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiadas solicitudes',
  })
  async login(
    @Req() req,
    @Res() res: Response,
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    console.log('Iniciando proceso de login para:', email);
    try {
      console.log('Validando credenciales...');
      const user = await this.authService.validateUser(email, password);
      console.log('Usuario validado, obteniendo dirección IP...');
      const ipAddress =
        req.ip ||
        req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress;
      console.log('IP detectada:', ipAddress);
      console.log('Iniciando sesión...');
      const result = await this.authService.login(user, ipAddress, res);
      console.log('Login exitoso');
      return res.status(200).json(result);
    } catch (error) {
      console.error('Error en login:', error);
      if (error instanceof UnauthorizedException) {
        console.log('Error de autenticación:', error.message);
        throw error;
      }
      console.error('Error inesperado en login:', error);
      throw new UnauthorizedException('Error al iniciar sesión');
    }
  }

  @Post('login/username')
  @RateLimit({
    keyType: ['ip', 'identity'],
    rules: [
      { limit: 5, windowSeconds: 60 },
      { limit: 20, windowSeconds: 3600 },
    ],
    cooldownSeconds: 600,
  })
  @ApiOperation({
    summary: 'Iniciar sesión con nombre de usuario',
    description: 'Autentica un usuario usando nombre de usuario y contraseña. Devuelve access_token en JSON y establece refresh_token en cookie HttpOnly segura',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { 
          type: 'string', 
          example: 'usuario123',
          description: 'Nombre de usuario único'
        },
        password: { 
          type: 'string', 
          format: 'password',
          example: 'contraseñaSegura123',
          description: 'Contraseña del usuario'
        },
      },
      required: ['username', 'password'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Inicio de sesión exitoso',
    schema: {
      type: 'object',
      properties: {
        access_token: { 
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
        },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
            email: { type: 'string', example: 'usuario@ejemplo.com' },
            name: { type: 'string', example: 'Nombre del Usuario' },
            username: { type: 'string', example: 'usuario123' },
            role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'USER' },
            verified: { type: 'boolean', example: true },
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
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas o cuenta no verificada',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Credenciales inválidas' },
        error: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  @ApiResponse({
    status: 403,
    description: 'Cuenta no verificada',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Por favor verifica tu correo electrónico' },
        error: { type: 'string', example: 'Forbidden' }
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
        message: { type: 'string', example: 'Usuario no encontrado' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiadas solicitudes',
  })
  async loginWithUsername(
    @Req() req,
    @Res() res: Response,
    @Body('username') username: string,
    @Body('password') password: string,
  ) {
    this.logger.log(`Iniciando proceso de login para usuario: ${username}`);
    try {
      this.logger.debug('Validando credenciales...');
      const user = await this.authService.validateUserByUsername(username, password);
      
      this.logger.debug('Usuario validado, obteniendo dirección IP...');
      const ipAddress =
        req.ip ||
        req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress;
      
      this.logger.debug(`IP detectada: ${ipAddress}`);
      this.logger.debug('Generando tokens...');
      
      const result = await this.authService.login(user, ipAddress, res);
      this.logger.log('Login exitoso');
      
      return res.status(200).json(result);
    } catch (error) {
      this.logger.error(`Error en login con usuario: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        this.logger.warn(`Error de autenticación: ${error.message}`);
        throw error;
      }
      this.logger.error('Error inesperado en login con usuario:', error);
      throw new UnauthorizedException('Error al iniciar sesión');
    }
  }

  @Get('verify')
  @ApiOperation({
    summary: 'Verificar correo electrónico',
    description:
      'Verifica la dirección de correo electrónico del usuario usando un token de verificación. Redirige al frontend con mensaje de éxito o error',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirección al frontend',
    headers: {
      Location: {
        description: 'URL de redirección al frontend',
        schema: { type: 'string', example: 'http://localhost:3000/login?verified=true' }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Token de verificación inválido o expirado',
    headers: {
      Location: {
        description: 'URL de redirección al frontend con error',
        schema: { type: 'string', example: 'http://localhost:3000/verify-email?error=invalid_token' }
      }
    }
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Token de verificación enviado por correo electrónico',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ2ZXJpZmljYXRpb24iLCJpYXQiOjE2MzAwMDAwMDAsImV4cCI6MTYzMDA4NjQwMH0.signature',
  })
  async verifyEmail(@Query('token') token: string, @Res() res: Response) {
    try {
      const user = await this.authService.verifyEmail(token);

      // Redirigir al frontend con mensaje de éxito
      return res.redirect(`${process.env.FRONTEND_URL}/login?verified=true`);
    } catch (error) {
      // Redirigir al frontend con mensaje de error
      return res.redirect(
        `${process.env.FRONTEND_URL}/verify-email?error=invalid_token`,
      );
    }
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 3, windowSeconds: 60 }],
  })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cambiar contraseña',
    description:
      'Permite a un usuario autenticado cambiar su contraseña actual',
  })
  @ApiResponse({
    status: 200,
    description: 'Contraseña cambiada exitosamente',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Contraseña actualizada exitosamente',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Datos de entrada inválidos o la nueva contraseña no cumple con los requisitos',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: {
          type: 'string',
          example: 'La nueva contraseña debe ser diferente a la actual',
        },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado - Token inválido o expirado',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'No autorizado' },
        error: { type: 'string', example: 'Unauthorized' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Credenciales actuales incorrectas',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: {
          type: 'string',
          example: 'Credenciales actuales incorrectas',
        },
        error: { type: 'string', example: 'Forbidden' },
      },
    },
  })
  @ApiBody({
    type: AuthChangePasswordDto,
    description: 'Datos para el cambio de contraseña',
    examples: {
      example: {
        value: {
          email: 'usuario@ejemplo.com',
          currentPassword: 'contraseñaActual123',
          newPassword: 'nuevaContraseñaSegura123',
        },
      },
    },
  })
  async changePassword(
    @Body() { email, currentPassword, newPassword }: AuthChangePasswordDto,
    @Req() req: any,
  ) {
    // Obtener el ID del usuario del token JWT
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    this.logger.log(`Iniciando cambio de contraseña para el usuario ID: ${userId}`);

    if (!userId) {
      this.logger.error('No se pudo obtener el ID del usuario del token JWT');
      throw new UnauthorizedException('No se pudo autenticar al usuario');
    }

    try {
      // Obtener el usuario actual
      this.logger.debug(`Buscando usuario con ID: ${userId}`);
      const user = await this.userService.findById(userId);
      if (!user) {
        this.logger.warn(`Usuario no encontrado con ID: ${userId}`);
        throw new UnauthorizedException('Usuario no encontrado');
      }
      this.logger.debug(`Usuario encontrado: ${user.email}`);

      // Verificar credenciales actuales
      this.logger.debug('Validando credenciales actuales del usuario');
      const isValid = await this.authService.validateUser(
        user.email,
        currentPassword,
      );
      if (!isValid) {
        this.logger.warn(`Credenciales inválidas para el usuario: ${user.email}`);
        throw new ForbiddenException('Credenciales actuales incorrectas');
      }
      this.logger.debug('Credenciales validadas correctamente');

      // Cambiar la contraseña
      this.logger.debug('Iniciando proceso de cambio de contraseña');
      await this.userService.changePassword(
        user.email,
        currentPassword,
        newPassword,
      );

      this.logger.log(`Contraseña actualizada exitosamente para el usuario: ${user.email}`);
      return { message: 'Contraseña actualizada exitosamente' };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        this.logger.error(`Error de autorización: ${error.message}`, error.stack);
        throw error;
      }
      this.logger.error(`Error al cambiar la contraseña: ${error.message}`, error.stack);
      throw new BadRequestException('No se pudo cambiar la contraseña');
    }
  }

  @Post('request-password-reset')
  @RateLimit({
    keyType: 'identity',
    rules: [{ limit: 3, windowSeconds: 60 }],
  })
  @ApiOperation({
    summary: 'Solicitar restablecimiento de contraseña',
    description:
      'Envía un correo electrónico con un enlace para restablecer la contraseña. Por seguridad, siempre devuelve éxito sin revelar si el email existe',
  })
  @ApiResponse({
    status: 200,
    description: 'Solicitud procesada exitosamente',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Si el correo existe, recibirás un enlace para resetear tu contraseña, intentalo de nuevo si no recibes nada.'
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Formato de correo electrónico inválido',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'El email debe ser un correo válido' },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @ApiBody({
    description: 'Correo electrónico del usuario que desea restablecer su contraseña',
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          format: 'email',
          example: 'usuario@ejemplo.com',
          description: 'Correo electrónico del usuario'
        }
      },
      required: ['email']
    },
    examples: {
      validEmail: {
        summary: 'Email válido',
        value: { email: 'usuario@ejemplo.com' }
      }
    }
  })
  async requestPasswordReset(@Body() body: RequestPasswordResetDto) {
    await this.authService.requestPasswordReset(body.email);

    return {
      message:
        'Si el correo existe, recibirás un enlace para resetear tu contraseña, intentalo de nuevo si no recibes nada.',
    };
  }

  @Patch('reset-password')
  @ApiOperation({
    summary: 'Restablecer contraseña',
    description:
      'Restablece la contraseña de un usuario usando un token de restablecimiento válido. El token expira después de 1 hora',
  })
  @ApiResponse({
    status: 200,
    description: 'Contraseña restablecida exitosamente',
    schema: {
      type: 'object',
      properties: {
        message: { 
          type: 'string',
          example: 'Contraseña restablecida correctamente.'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Token inválido, expirado o nueva contraseña inválida',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { 
          type: 'string',
          example: 'No se pudo restablecer la contraseña. El token puede ser inválido o haber expirado.'
        },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @ApiBody({
    description: 'Token de restablecimiento y nueva contraseña',
    schema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZXNldCIsImlhdCI6MTYzMDAwMDAwMCwiZXhwIjoxNjMwMDM2NDAwfQ.signature',
          description: 'Token de restablecimiento recibido por correo'
        },
        newPassword: {
          type: 'string',
          format: 'password',
          minLength: 8,
          example: 'nuevaContraseñaSegura123',
          description: 'Nueva contraseña (mínimo 8 caracteres)'
        }
      },
      required: ['token', 'newPassword']
    },
    examples: {
      validReset: {
        summary: 'Restablecimiento válido',
        value: {
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZXNldCIsImlhdCI6MTYzMDAwMDAwMCwiZXhwIjoxNjMwMDM2NDAwfQ.signature',
          newPassword: 'nuevaContraseñaSegura123'
        }
      }
    }
  })
  async resetPassword(@Body() body: ResetPasswordDto) {
    const { token, newPassword } = body;
    const success = await this.authService.resetPassword(token, newPassword);

    if (success) {
      return { message: 'Contraseña restablecida correctamente.' };
    } else {
      return {
        message:
          'No se pudo restablecer la contraseña. El token puede ser inválido o haber expirado.',
      };
    }
  }
}


