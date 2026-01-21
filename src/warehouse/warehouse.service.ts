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
        supplyOrders: {
          select: {
            id: true,
            code: true,
            status: true,
            description: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        warehouseReceptions: {
          select: {
            id: true,
            reference: true,
            notes: true,
            receivedAt: true,
            createdAt: true,
          },
          orderBy: { receivedAt: 'desc' },
        },
        warehouseProducts: {
          select: {
            id: true,
            stock: true,
            stockThreshold: true,
            createdAt: true,
            updatedAt: true,
            product: {
              select: {
                id: true,
                name: true,
                description: true,
              },
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
