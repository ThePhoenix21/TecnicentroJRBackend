import { ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Verificar si hay un token en el encabezado
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('Intento de acceso sin token de autenticación');
      throw new UnauthorizedException('Token de autenticación no proporcionado');
    }

    const token = authHeader.split(' ')[1];
    
    // Log para depuración (no incluir el token completo en producción)
    this.logger.debug(`Validando token para ruta: ${request.path}`);
    
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      this.logger.error(`Error de autenticación: ${err?.message || info?.message || 'Token inválido'}`);
      
      if (info instanceof Error) {
        if (info.name === 'TokenExpiredError') {
          throw new UnauthorizedException('La sesión ha expirado. Por favor, inicie sesión nuevamente.');
        } else if (info.name === 'JsonWebTokenError') {
          throw new UnauthorizedException('Token inválido. Por favor, inicie sesión nuevamente.');
        }
      }
      
      throw new UnauthorizedException('No autorizado. Por favor, inicie sesión.');
    }
    
    return user;
  }
}
