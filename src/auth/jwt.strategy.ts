import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions, VerifyCallback } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { Role } from '@prisma/client';

type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  tenantId?: string;
  tenantName?: string;
  permissions?: string[];
  stores?: string[];
  iat?: number;
  exp?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = configService.get<string>('JWT_SECRET') || 'superSecretKey';
    
    const strategyOptions: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: false,
    };
    
    super(strategyOptions);
  }

  async validate(payload: JwtPayload): Promise<{ userId: string; email: string; role: Role; permissions: string[]; stores?: string[]; tenantId?: string; tenantName?: string }> {
    try {
      this.logger.debug(`Validando token para usuario: ${payload.email}`);
      
      // Verificar si el token está expirado
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        this.logger.warn(`Token expirado para el usuario: ${payload.email}`);
        throw new UnauthorizedException('La sesión ha expirado. Por favor, inicie sesión nuevamente.');
      }

      // Verificar si el usuario existe en la base de datos
      const user = await this.usersService.findById(payload.sub);
      
      if (!user) {
        this.logger.warn(`Usuario no encontrado con ID: ${payload.sub}`);
        throw new UnauthorizedException('Usuario no encontrado. Por favor, inicie sesión nuevamente.');
      }

      // Verificar si el usuario está activo
      if (user.status !== 'ACTIVE') {
        this.logger.warn(`Intento de acceso de usuario con estado ${user.status}: ${payload.email}`);
        throw new UnauthorizedException(
          user.status === 'SUSPENDED' 
            ? 'Su cuenta ha sido suspendida. Contacte al administrador.'
            : user.status === 'INACTIVE'
            ? 'Su cuenta está inactiva. Contacte al administrador.'
            : 'Su cuenta no está activa. Por favor, verifique su correo electrónico o contacte al administrador.'
        );
      }
      
      this.logger.debug(`Usuario autenticado correctamente: ${user.email}`);

      if (payload.tenantId && user.tenantId && payload.tenantId !== user.tenantId) {
        this.logger.warn(`Mismatch de tenantId en token para usuario ${user.email}`);
        throw new UnauthorizedException('Tenant inválido');
      }
      
      return { 
        userId: payload.sub, 
        email: payload.email, 
        role: payload.role as Role,
        permissions: user.permissions || [], 
        stores: payload.stores || [],
        tenantId: (payload.tenantId ?? user.tenantId) ?? undefined,
        tenantName: payload.tenantName
      };
      
    } catch (error) {
      this.logger.error(`Error en la validación del token: ${error.message}`, error.stack);
      
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      throw new UnauthorizedException('Error de autenticación. Por favor, inicie sesión nuevamente.');
    }
  }
}
