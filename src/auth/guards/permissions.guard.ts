import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Role } from '@prisma/client';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si no se requieren permisos específicos, permitir acceso
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      this.logger.warn('Intento de verificar permisos sin usuario autenticado');
      throw new ForbiddenException('Usuario no autenticado');
    }

    // Los ADMINs suelen tener acceso total, pero si quieres ser estricto, quita este bloque.
    // Por ahora, asumiremos que ADMIN tiene superpoderes, o verificamos sus permisos también.
    // Si tu lógica de negocio dice que ADMIN tiene acceso a todo:
    if (user.role === Role.ADMIN) {
      return true;
    }

    // Verificar permisos del usuario
    const userPermissions = user.permissions || [];
    
    // Verificar si el usuario tiene TODOS los permisos requeridos (estrategia AND)
    // O si prefieres que tenga AL MENOS UNO (estrategia OR), cambia 'every' por 'some'.
    // Usualmente para seguridad granular es "necesitas tener este permiso específico".
    const hasAllPermissions = requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );

    if (!hasAllPermissions) {
      this.logger.warn(`Usuario ${user.email} intentó acceder a recurso protegido sin permisos suficientes. Requeridos: [${requiredPermissions}], Tiene: [${userPermissions}]`);
      throw new ForbiddenException(`No tienes permisos suficientes. Requerido: ${requiredPermissions.join(', ')}`);
    }

    return true;
  }
}
