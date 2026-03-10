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
export class WarehouseService {
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

  private async findWarehouseOrThrow(warehouseId: string, tenantId: string) {
    const warehouse = await (this.prisma.warehouse as any).findFirst({
      where: {
        id: warehouseId,
        tenantId,
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    if (!warehouse) throw new NotFoundException('Almacén no encontrado');
    if (warehouse.deletedAt) throw new BadRequestException('Almacén eliminado');

    return warehouse;
  }

  async create(
    input: { name: string; address?: string; phone?: string },
    user: AuthUser,
  ) {
    const tenantId = this.getTenantIdOrThrow(user);
    const createdById = this.getAuthUserIdOrThrow(user);

    return this.prisma.$transaction(async (prisma) => {
      const warehouse = await (prisma.warehouse as any).create({
        data: {
          name: input.name,
          address: input.address ?? null,
          phone: input.phone ?? null,
          tenantId,
          createdById,
        },
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          createdAt: true,
        },
      });

      const stores = await prisma.store.findMany({
        where: { tenantId },
        select: { id: true },
      });

      if (stores.length > 0) {
        await prisma.warehouseStore.createMany({
          data: stores.map((s) => ({
            warehouseId: warehouse.id,
            storeId: s.id,
            priority: null,
          })),
          skipDuplicates: true,
        });
      }

      // Crear WarehouseProducts para todos los productos existentes del catálogo
      const allProducts = await prisma.product.findMany({
        where: { isDeleted: false }
      });
      
      if (allProducts.length > 0) {
        const warehouseProductsData = allProducts.map(product => ({
          warehouseId: warehouse.id,
          productId: product.id,
          tenantId: tenantId,
          stock: 0,
          stockThreshold: 1 // Valor por defecto
        }));
        
        await prisma.warehouseProduct.createMany({
          data: warehouseProductsData,
          skipDuplicates: true
        });
      }

      return warehouse;
    });
  }

  async update(
    warehouseId: string,
    input: { name?: string; address?: string; phone?: string },
    user: AuthUser,
  ) {
    const tenantId = this.getTenantIdOrThrow(user);
    await this.findWarehouseOrThrow(warehouseId, tenantId);

    return (this.prisma.warehouse as any).update({
      where: { id: warehouseId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.address !== undefined ? { address: input.address ?? null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
      },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
      },
    });
  }

  async softDelete(warehouseId: string, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    await this.findWarehouseOrThrow(warehouseId, tenantId);

    await (this.prisma.warehouse as any).update({
      where: { id: warehouseId },
      data: { deletedAt: new Date() },
      select: { id: true },
    });

    return { success: true };
  }

  async list(user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    return (this.prisma.warehouse as any).findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listStores(warehouseId: string, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    await this.findWarehouseOrThrow(warehouseId, tenantId);

    const links = await (this.prisma.warehouseStore as any).findMany({
      where: {
        warehouseId,
        warehouse: { tenantId, deletedAt: null },
      },
      select: {
        store: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    return links.map((l) => l.store);
  }

  async updateStores(warehouseId: string, storeIds: string[], user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    await this.findWarehouseOrThrow(warehouseId, tenantId);

    return this.prisma.$transaction(async (prisma) => {
      // Eliminar todas las relaciones existentes
      await (prisma.warehouseStore as any).deleteMany({
        where: { warehouseId },
      });

      // Crear nuevas relaciones si hay storeIds
      if (storeIds.length > 0) {
        // Verificar que todas las tiendas existan y pertenezcan al tenant
        const stores = await (prisma.store as any).findMany({
          where: {
            id: { in: storeIds },
            tenantId,
          },
          select: { id: true },
        });

        if (stores.length !== storeIds.length) {
          throw new BadRequestException('Algunas tiendas no existen o no pertenecen a tu tenant');
        }

        // Crear las nuevas relaciones
        await (prisma.warehouseStore as any).createMany({
          data: storeIds.map((storeId) => ({
            warehouseId,
            storeId,
            priority: null,
          })),
          skipDuplicates: true,
        });
      }

      return { success: true, message: 'Tiendas actualizadas correctamente' };
    });
  }

  async listSimple(user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    return (this.prisma.warehouse as any).findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async lookup(user: AuthUser) {
    return this.listSimple(user);
  }

  async getDetails(warehouseId: string, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    await this.findWarehouseOrThrow(warehouseId, tenantId);

    const warehouse = await (this.prisma.warehouse as any).findFirst({
      where: {
        id: warehouseId,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        warehouseEmployees: {
          select: {
            id: true,
            role: true,
            assignedAt: true,
            employed: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                status: true,
              },
            },
          },
        },
        warehouseStores: {
          select: {
            id: true,
            priority: true,
            createdAt: true,
            store: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
        },
        warehouseProducts: {
          select: {
            id: true,
            stock: true,
            product: {
              select: {
                name: true,
              },
            },
          },
          where: {
            product: {
              isDeleted: false,
            },
          },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException('Almacén no encontrado');
    }

    return warehouse;
  }
}
