import { 
  BadRequestException, 
  ConflictException, 
  ForbiddenException, 
  Injectable,
  Logger,
  UnauthorizedException 
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { EmailValidatorService } from '../common/validators/email-validator.service';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly emailValidator: EmailValidatorService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {
    // Limpiar usuarios no verificados al iniciar
    this.cleanupUnverifiedAdminsOnStartup();
  }

  // Se ejecuta al iniciar la aplicación
  private async cleanupUnverifiedAdminsOnStartup() {
    try {
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const result = await this.prisma.user.deleteMany({
        where: { 
          role: 'ADMIN',
          verified: false,
          createdAt: {
            lt: twentyFourHoursAgo
          }
        },
      });

      if (result.count > 0) {
        this.logger.log(`Se eliminaron ${result.count} administradores no verificados al iniciar`);
      }
    } catch (error) {
      this.logger.error('Error al limpiar administradores no verificados al iniciar:', error);
    }
  }

  // Se ejecuta todos los días a medianoche
  @Cron('0 0 * * *')
  async cleanupUnverifiedAdminsDaily() {
    this.logger.log('Iniciando limpieza diaria de administradores no verificados...');
    try {
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const result = await this.prisma.user.deleteMany({
        where: { 
          role: 'ADMIN',
          verified: false,
          createdAt: {
            lt: twentyFourHoursAgo
          }
        },
      });

      this.logger.log(`Limpieza diaria: Se eliminaron ${result.count} administradores no verificados`);
      return result;
    } catch (error) {
      this.logger.error('Error en la limpieza diaria de administradores no verificados:', error);
      throw error;
    }
  }

  // Limpia los tokens expirados todos los días a la medianoche
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanExpiredTokens() {
    this.logger.log('Iniciando limpieza de tokens expirados...');
    
    try {
      const result = await this.prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date() // Elimina tokens con fecha de expiración pasada
          }
        }
      });
      
      this.logger.log(`Se eliminaron ${result.count} tokens expirados`);
      return result;
    } catch (error) {
      this.logger.error('Error al limpiar tokens expirados:', error);
      throw error;
    }
  }

  // Limpia tokens huérfanos (sin usuario) el primer día de cada mes
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async cleanOrphanedTokens() {
    this.logger.log('Buscando tokens huérfanos...');
    
    try {
      // Encontrar todos los tokens con sus usuarios
      const allTokens = await this.prisma.refreshToken.findMany({
        include: { user: true }
      });
      
      // Filtrar tokens sin usuario
      const orphanedTokens = allTokens.filter(token => !token.user);

      if (orphanedTokens.length > 0) {
        this.logger.warn(`Encontrados ${orphanedTokens.length} tokens huérfanos`);
        const result = await this.prisma.refreshToken.deleteMany({
          where: {
            id: { in: orphanedTokens.map(t => t.id) }
          }
        });
        this.logger.log(`Tokens huérfanos eliminados: ${result.count}`);
        return result;
      }
      
      this.logger.log('No se encontraron tokens huérfanos');
      return { count: 0 };
    } catch (error) {
      this.logger.error('Error al limpiar tokens huérfanos:', error);
      throw error;
    }
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.verified) {
      throw new UnauthorizedException('Por favor verifica tu correo electrónico antes de iniciar sesión');
    }

    return user;
  }

  async validateUserByUsername(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);
    
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Verificar que el usuario tenga el rol USER
    if (user.role !== Role.USER) {
      throw new UnauthorizedException('Este método de autenticación es solo para usuarios regulares');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // No se requiere verificación de correo electrónico
    // para este método de autenticación

    return user;
  }

  async register(
    email: string,
    password: string,
    name: string,
    username: string,
    phone: string = 'sin_telefono',
    birthdate?: Date,
    language: string = 'es',
    timezone: string = 'UTC'
  ) {
    // Verificar si el correo ya existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('El correo electrónico ya está en uso');
    }

    // Verificar si el nombre de usuario ya existe
    const existingUsername = await this.prisma.user.findUnique({
      where: { username },
    });

    if (existingUsername) {
      throw new ConflictException('El nombre de usuario ya está en uso');
    }

    // Validar el formato del correo electrónico
    const isEmailValid = await this.emailValidator.isEmailValid(email);
    if (!isEmailValid) {
      throw new BadRequestException('El correo electrónico no es válido o el dominio no existe');
    }

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Crear token de verificación
    const verifyToken = randomBytes(32).toString('hex');
    const verifyTokenExpires = new Date();
    verifyTokenExpires.setHours(verifyTokenExpires.getHours() + 24); // Expira en 24 horas

    try {
      // Crear usuario
      const userData: Prisma.UserCreateInput = {
        email,
        password: hashedPassword,
        name,
        username,
        phone,
        birthdate: birthdate || null,
        language,
        timezone,
        verified: false,
        verifyToken,
        verifyTokenExpires,
        role: Role.ADMIN,
        status: 'ACTIVE' as const,
      };

      const newUser = await this.prisma.user.create({ data: userData });

      // Enviar correo de verificación
      await this.mailService.sendVerificationEmail(newUser.email, verifyToken, newUser.name);

      // Programar limpieza si no se verifica
      this.scheduleUserCleanup(newUser.id);

      // No devolver la contraseña
      const { password: _, verifyToken: __, verifyTokenExpires: ___, ...result } = newUser;
      return result;
    } catch (error) {
      console.error('Error en el registro:', error);
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error al registrar el usuario');
    }
  }

  private scheduleUserCleanup(userId: string) {
    // Ya no necesitamos el timeout individual ya que ahora tenemos la limpieza diaria
    // Solo registramos que el usuario necesita ser verificado
    this.logger.log(`Usuario ${userId} necesita verificación. Será verificado en la próxima limpieza diaria.`);
  }

  // Métodos existentes...
  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: { 
        verifyToken: token, 
        verifyTokenExpires: { 
          gt: new Date() 
        } 
      },
    });

    if (!user) {
      throw new BadRequestException('Token inválido o expirado');
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data: { 
        verified: true, 
        verifyToken: null, 
        verifyTokenExpires: null 
      },
    });
  }

  async requestPasswordReset(email: string): Promise<boolean> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {      
      return true;
    }

    // Generar token y expiración
    const token = randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 30); // expira en 30 min

    // Guardar token en la base de datos
    await this.prisma.user.update({
      where: { id: user.id },
      data: { 
        passwordResetToken: token,
        passwordResetTokenExpires: expires
      },
    });

    // Enviar correo de restablecimiento
    await this.mailService.sendPasswordResetEmail(user.email, token);

    return true;
  }

  async resetPassword(token: string, newPassword: string) {
    // 1. Buscar usuario con token
    const user = await this.prisma.user.findFirst({
      where: { 
        passwordResetToken: token,
        passwordResetTokenExpires: { gt: new Date() }
      },
    });
    
    if (!user) {
      throw new BadRequestException('Token inválido o expirado');
    }

    // 2. Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 3. Actualizar usuario
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetTokenExpires: null,
      },
    });

    return true;
  }

  async login(user: any, ipAddress?: string) {
    const payload = { 
      email: user.email, 
      sub: user.id,
      role: user.role 
    };

    // Crear tokens
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    
    // Calcular fecha de expiración (7 días desde ahora)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Guardar el refresh token en la base de datos
    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: expiresAt,
        revoked: false
      }
    });

    // Actualizar la última hora de inicio de sesión
    await this.prisma.user.update({
      where: { id: user.id },
      data: { 
        lastLoginAt: new Date(),
        ...(ipAddress && { lastLoginIp: ipAddress })
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        verified: user.verified
      }
    };
  } catch (error) {
    console.error('Error al refrescar token:', error);
    throw new UnauthorizedException('Token de refresco inválido');
  }

  async refreshToken(refreshToken: string, ipAddress: string) {
    try {
      // 1. Verificar que el token sea válido
      const payload = this.jwtService.verify(refreshToken);
      
      // 2. Buscar el token en la base de datos
      const storedToken = await this.prisma.refreshToken.findFirst({
        where: { 
          token: refreshToken,
          userId: payload.sub,
          revoked: false,
          expiresAt: { gte: new Date() }
        }
      });

      if (!storedToken) {
        throw new UnauthorizedException('Token de refresco inválido o expirado');
      }

      // 3. Obtener el usuario
      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }

      // 4. Crear nuevos tokens
      const newPayload = { 
        email: user.email, 
        sub: user.id,
        role: user.role 
      };

      const newAccessToken = this.jwtService.sign(newPayload);
      const newRefreshToken = this.jwtService.sign(newPayload, { expiresIn: '7d' });
      
      // 5. Calcular nueva fecha de expiración
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 7);

      // 6. Actualizar el refresh token en la base de datos
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { 
          token: newRefreshToken,
          expiresAt: newExpiresAt,
          updatedAt: new Date()
        }
      });

      // 7. Actualizar última actividad del usuario
      await this.prisma.user.update({
        where: { id: user.id },
        data: { 
          lastLoginAt: new Date(),
          ...(ipAddress && { lastLoginIp: ipAddress })
        },
      });

      return {
        access_token: newAccessToken,
        refresh_token: newRefreshToken
      };
    } catch (error) {
      console.error('Error al refrescar token:', error);
      throw new UnauthorizedException('Token de refresco inválido');
    }
  }
}
