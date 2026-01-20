import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
};

@Injectable()
export class ProviderService {
  constructor(private readonly prisma: PrismaService) {}

  private getTenantIdOrThrow(user: AuthUser): string {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }
    return tenantId;
  }

  private getAuthUserIdOrThrow(user: AuthUser): string {
    const anyUser = user as any;
    const userId = user?.userId ?? anyUser?.sub ?? anyUser?.id;
    if (!userId) {
      throw new ForbiddenException('No se pudo obtener el id del usuario desde el token');
    }
    return String(userId);
  }

  private async assertProviderBelongsToTenant(providerId: string, tenantId: string) {
    const provider = await (this.prisma.provider as any).findFirst({
      where: {
        id: providerId,
        deletedAt: null,
        createdBy: { tenantId },
      },
      select: { id: true },
    });

    if (!provider) {
      throw new NotFoundException('Proveedor no encontrado');
    }
  }

  async create(
    input: { ruc: string; name: string; phone?: string; email?: string; address?: string },
    user: AuthUser,
  ) {
    const tenantId = this.getTenantIdOrThrow(user);
    const creatorUserId = this.getAuthUserIdOrThrow(user);

    const ruc = String(input.ruc || '').trim();
    const name = String(input.name || '').trim();

    if (!ruc) throw new BadRequestException('ruc es obligatorio');
    if (!name) throw new BadRequestException('name es obligatorio');

    const existing = await (this.prisma.provider as any).findFirst({
      where: {
        ruc,
        deletedAt: null,
        createdBy: { tenantId },
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('Ya existe un proveedor con este ruc');
    }

    const created = await (this.prisma.provider as any).create({
      data: {
        ruc,
        name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        createdById: creatorUserId,
      },
      select: { id: true, name: true, ruc: true },
    });

    return created;
  }

  async update(
    providerId: string,
    input: { name?: string; phone?: string; email?: string; address?: string },
    user: AuthUser,
  ) {
    const tenantId = this.getTenantIdOrThrow(user);
    await this.assertProviderBelongsToTenant(providerId, tenantId);

    await (this.prisma.provider as any).update({
      where: { id: providerId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
      },
      select: { id: true },
    });

    return { success: true };
  }

  async softDelete(providerId: string, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    await this.assertProviderBelongsToTenant(providerId, tenantId);

    await (this.prisma.provider as any).update({
      where: { id: providerId },
      data: { deletedAt: new Date() },
      select: { id: true },
    });

    return { success: true };
  }

  async setProviderProducts(providerId: string, input: { productIds: string[] }, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    await this.assertProviderBelongsToTenant(providerId, tenantId);

    const productIds = Array.from(new Set(input.productIds || [])).filter(Boolean);
    if (productIds.length === 0) {
      throw new BadRequestException('productIds no puede estar vacío');
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        isDeleted: false,
        createdBy: { tenantId },
      },
      select: { id: true },
    });

    if (products.length !== productIds.length) {
      throw new ForbiddenException('Uno o más productos no pertenecen a tu tenant o no existen');
    }

    await this.prisma.$transaction(async (prisma) => {
      await prisma.providerProduct.deleteMany({ where: { providerId } });
      await prisma.providerProduct.createMany({
        data: productIds.map((productId) => ({ providerId, productId })),
        skipDuplicates: true,
      });
    });

    return { success: true };
  }

  async list(user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    return (this.prisma.provider as any).findMany({
      where: {
        deletedAt: null,
        createdBy: { tenantId },
      },
      select: {
        id: true,
        name: true,
        address: true,
        ruc: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDetail(providerId: string, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    const provider = await (this.prisma.provider as any).findFirst({
      where: {
        id: providerId,
        deletedAt: null,
        createdBy: { tenantId },
      },
      include: {
        createdBy: {
          select: { id: true, email: true, name: true },
        },
        providerProducts: {
          where: {
            product: {
              createdBy: { tenantId },
              isDeleted: false,
            },
          },
          select: {
            id: true,
            buyCost: true,
            product: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        },
        supplyOrders: {
          where: { tenantId },
          select: {
            id: true,
            code: true,
            status: true,
            description: true,
            createdAt: true,
            updatedAt: true,
            warehouseId: true,
            storeId: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!provider) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    return {
      ...provider,
    };
  }
}
