import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantFeature, TenantStatus } from '@prisma/client';
import { TENANT_FEATURES_KEY } from '../decorators/tenant-features.decorator';

@Injectable()
export class TenantFeaturesGuard implements CanActivate {
  private readonly logger = new Logger(TenantFeaturesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeatures = this.reflector.getAllAndOverride<Array<TenantFeature | string>>(
      TENANT_FEATURES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    let user = request.user;

    // Nota: este guard está registrado como APP_GUARD, por lo que puede ejecutarse
    // antes que JwtAuthGuard (que setea request.user). En ese caso, resolvemos el
    // tenantId desde el JWT para evitar bypass.
    if (!user) {
      const authHeader: string | undefined = request.headers?.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Token de autenticación no proporcionado');
      }

      const token = authHeader.split(' ')[1];
      try {
        user = await this.jwtService.verifyAsync(token);
      } catch {
        throw new UnauthorizedException('Token inválido. Por favor, inicie sesión nuevamente.');
      }
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
      throw new ForbiddenException(
        'Su usuario ha sido desactivado. Por favor, póngase en contacto con soporte para más información.',
      );
    }

    const tenantFeatures = (tenant.features || []).map((f) => String(f));
    const requiredFeatureStrings = requiredFeatures.map((f) => String(f));
    const hasAllFeatures = requiredFeatureStrings.every((feature) =>
      tenantFeatures.includes(feature),
    );

    if (!hasAllFeatures) {
      this.logger.warn(
        `Tenant ${tenantId} intentó acceder sin features suficientes. Requeridos: [${requiredFeatureStrings.join(
          ', ',
        )}], Tiene: [${tenantFeatures.join(', ')}]`,
      );
      throw new ForbiddenException(
        `Funcionalidad no habilitada para este tenant: ${requiredFeatureStrings.join(
          ', ',
        )}`,
      );
    }

    return true;
  }
}
