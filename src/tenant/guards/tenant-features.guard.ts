import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantFeature, TenantStatus } from '@prisma/client';
import { TENANT_FEATURES_KEY } from '../decorators/tenant-features.decorator';

@Injectable()
export class TenantFeaturesGuard implements CanActivate {
  private readonly logger = new Logger(TenantFeaturesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeatures = this.reflector.getAllAndOverride<TenantFeature[]>(
      TENANT_FEATURES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Si no hay usuario autenticado, no bloquear aquí.
    // Esto permite que JwtAuthGuard (u otro guard de auth) responda 401 correctamente.
    if (!user) {
      return true;
    }

    const tenantId: string | undefined = user?.tenantId;

    if (!tenantId) {
      this.logger.warn('Intento de acceso a feature sin tenantId en el token');
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true, features: true },
    });

    if (!tenant) {
      throw new ForbiddenException('Tenant no encontrado');
    }

    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new ForbiddenException('Tenant inactivo');
    }

    const tenantFeatures = tenant.features || [];
    const hasAllFeatures = requiredFeatures.every((feature) =>
      tenantFeatures.includes(feature),
    );

    if (!hasAllFeatures) {
      this.logger.warn(
        `Tenant ${tenantId} intentó acceder sin features suficientes. Requeridos: [${requiredFeatures.join(
          ', ',
        )}], Tiene: [${tenantFeatures.join(', ')}]`,
      );
      throw new ForbiddenException(
        `Funcionalidad no habilitada para este tenant: ${requiredFeatures.join(
          ', ',
        )}`,
      );
    }

    return true;
  }
}
