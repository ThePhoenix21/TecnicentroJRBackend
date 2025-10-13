import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
        ]);

        if (!requiredRoles) {
        return true;
        }

        const request = context.switchToHttp().getRequest();
        
        // Extraer el token del header de autorización
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            throw new ForbiddenException('No se proporcionó token de autenticación');
        }

        // El formato del header es: Bearer <token>
        const token = authHeader.split(' ')[1];
        if (!token) {
            throw new ForbiddenException('Formato de token inválido');
        }

        // Decodificar el token JWT
        let payload;
        try {
            const jwtService = new JwtService({
                secret: process.env.JWT_SECRET || 'superSecretKey',
            });
            payload = jwtService.verify(token);
        } catch (error) {
            console.error('Error al verificar el token:', error);
            throw new ForbiddenException('Token inválido o expirado');
        }

        // Extraer el rol del payload
        const userRole = payload.role;
        console.log('Roles requeridos:', requiredRoles);
        console.log('Rol del usuario:', userRole);

        if (!userRole) {
            throw new ForbiddenException('El token no contiene información de roles');
        }

        // Verificar si el usuario tiene al menos uno de los roles requeridos
        const hasRole = requiredRoles.some((role) => userRole === role);
        
        if (!hasRole) {
            throw new ForbiddenException(
            `Se requiere uno de estos roles: ${requiredRoles.join(', ')}`
            );
        }

        return true;
        }
}