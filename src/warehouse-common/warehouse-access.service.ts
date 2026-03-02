import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../auth/enums/role.enum';

type AuthUser = {
  userId: string;
  role: string;
  tenantId?: string;
};

@Injectable()
export class WarehouseAccessService {
  constructor(private readonly prisma: PrismaService) {}

  getTenantIdOrThrow(user: AuthUser): string {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }
    return tenantId;
  }

  async assertWarehouseAccess(user: AuthUser, warehouseId?: string): Promise<string> {
    const tenantId = this.getTenantIdOrThrow(user);

    const targetWarehouseId = warehouseId;
    if (!targetWarehouseId) {
      throw new BadRequestException('warehouseId es requerido');
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: targetWarehouseId, tenantId, deletedAt: null },
      select: { id: true },
    });

    if (!warehouse) {
      throw new NotFoundException('Almacén no encontrado');
    }

    if (user.role === Role.ADMIN) {
      return warehouse.id;
    }

    const byEmployee = await this.prisma.warehouseEmployed.findFirst({
      where: {
        warehouseId: targetWarehouseId,
        employed: { userId: user.userId },
      },
      select: { id: true },
    });

    if (byEmployee) {
      return warehouse.id;
    }

    const byStore = await this.prisma.warehouseStore.findFirst({
      where: {
        warehouseId: targetWarehouseId,
        store: {
          storeUsers: {
            some: { userId: user.userId },
          },
        },
      },
      select: { id: true },
    });

    if (!byStore) {
      throw new ForbiddenException('No tienes acceso a este almacén');
    }

    return warehouse.id;
  }
}
