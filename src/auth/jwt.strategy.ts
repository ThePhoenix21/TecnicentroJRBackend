import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { Role } from '@prisma/client';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = configService.get<string>('JWT_SECRET') || 'superSecretKey';
    
    const strategyOptions: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    };
    
    super(strategyOptions);
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    // Verificar si el usuario existe en la base de datos
    const user = await this.usersService.findById(payload.sub);
    
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    
    // Retornar los datos del usuario que estarán disponibles en req.user
    return { 
      id: payload.sub, 
      email: payload.email, 
      role: payload.role as Role
    };
  }
}
