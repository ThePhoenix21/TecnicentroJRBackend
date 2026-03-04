import { Injectable, NotFoundException } from '@nestjs/common';
import { InventoryMovementType } from '@prisma/client';
import { buildPaginatedResponse, getPaginationParams } from '../common/pagination/pagination.helper';
import { PrismaService } from '../prisma/prisma.service';
import { ensureNonNegativeStock, resolveStockChange } from '../shared/inventory-utils/stock-calculation.util';
import { WarehouseAccessService } from '../warehouse-common/warehouse-access.service';
import { CreateWarehouseMovementDto, WarehouseMovementKind } from './dto/create-warehouse-movement.dto';
import { ListWarehouseMovementsDto } from './dto/list-warehouse-movements.dto';

type AuthUser = {
  userId: string;
  role: string;
  tenantId?: string;
};

@Injectable()
export class WarehouseMovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly warehouseAccessService: WarehouseAccessService,
  ) {}

  private toPrismaType(type: WarehouseMovementKind): InventoryMovementType {
    if (type === WarehouseMovementKind.INCOMING) return InventoryMovementType.INCOMING;
    if (type === WarehouseMovementKind.OUTGOING) return InventoryMovementType.OUTGOING;
    return InventoryMovementType.ADJUST;
  }

  async create(user: AuthUser, warehouseId: string, dto: CreateWarehouseMovementDto) {
    const tenantId = this.warehouseAccessService.getTenantIdOrThrow(user);
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);

    const warehouseProduct = await this.prisma.warehouseProduct.findFirst({
      where: {
        id: dto.warehouseProductId,
        warehouseId,
      },
      select: {
        id: true,
        stock: true,
      },
    });

    if (!warehouseProduct) {
      throw new NotFoundException('Producto de almacén no encontrado');
    }

    const prismaType = this.toPrismaType(dto.type);
    const stockChange = resolveStockChange(prismaType, dto.quantity);
    const stockBefore = warehouseProduct.stock;
    ensureNonNegativeStock(stockBefore, stockChange);
    const stockAfter = stockBefore + stockChange;

    const movement = await this.prisma.$transaction(async (prisma) => {
      const created = await prisma.warehouseMovement.create({
        data: {
          warehouseId,
          warehouseProductId: warehouseProduct.id,
          type: prismaType,
          quantity: stockChange,
          description: dto.description ?? null,
          userId: user.userId,
          tenantId,
        },
      });

      await prisma.warehouseProduct.update({
        where: { id: warehouseProduct.id },
        data: {
          stock: { increment: stockChange },
        },
      });

      return created;
    });

    return {
      ...movement,
      stockBefore,
      stockAfter,
    };
  }

  async list(user: AuthUser, warehouseId: string, query: ListWarehouseMovementsDto) {
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);

    const tenantId = this.warehouseAccessService.getTenantIdOrThrow(user);

    const { page, pageSize, skip } = getPaginationParams({
      page: query.page,
      pageSize: query.pageSize,
      defaultPage: 1,
      defaultPageSize: 12,
      maxPageSize: 100,
    });

    const effectiveType = query.type ?? (query.kind ? this.toPrismaType(query.kind) : undefined);

    const where: any = {
      warehouseId,
      tenantId,
      ...(effectiveType ? { type: effectiveType } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.fromDate || query.toDate
        ? {
            date: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    if (query.name) {
      where.warehouseProduct = {
        ...(where.warehouseProduct ?? {}),
        product: {
          name: {
            contains: query.name,
            mode: 'insensitive',
          },
        },
      };
    }

    if (query.userName) {
      where.user = {
        ...(where.user ?? {}),
        name: {
          contains: query.userName,
          mode: 'insensitive',
        },
      };
    }

    const [total, rows] = await Promise.all([
      this.prisma.warehouseMovement.count({ where }),
      this.prisma.warehouseMovement.findMany({
        where,
        include: {
          warehouseProduct: {
            include: {
              product: {
                select: {
                  name: true,
                },
              },
            },
          },
          user: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const items = rows.map((movement) => ({
      id: movement.id,
      date: movement.date,
      name: movement.warehouseProduct?.product?.name ?? 'Producto sin nombre',
      type: movement.type,
      quantity: movement.quantity,
      userName: movement.user?.name ?? null,
      description: movement.description ?? null,
    }));

    return buildPaginatedResponse(items, total, page, pageSize);
  }
}
