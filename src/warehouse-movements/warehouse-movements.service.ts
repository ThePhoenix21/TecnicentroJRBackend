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

    const { page, pageSize, skip } = getPaginationParams({
      page: query.page,
      pageSize: query.pageSize,
      defaultPage: 1,
      defaultPageSize: 20,
      maxPageSize: 100,
    });

    const where: any = {
      warehouseId,
      ...(query.type ? { type: this.toPrismaType(query.type) } : {}),
      ...(query.fromDate || query.toDate
        ? {
            date: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.warehouseMovement.count({ where }),
      this.prisma.warehouseMovement.findMany({
        where,
        include: {
          warehouseProduct: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return buildPaginatedResponse(rows, total, page, pageSize);
  }
}
