import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryMovementType, SupplyOrderStatus } from '@prisma/client';
import { buildPaginatedResponse, getPaginationParams } from '../common/pagination/pagination.helper';
import { PrismaService } from '../prisma/prisma.service';
import { WarehouseAccessService } from '../warehouse-common/warehouse-access.service';
import { CreateWarehouseReceptionDto } from './dto/create-warehouse-reception.dto';
import { ListWarehouseReceptionsDto } from './dto/list-warehouse-receptions.dto';

type AuthUser = {
  userId: string;
  role: string;
  tenantId?: string;
};

@Injectable()
export class WarehouseReceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly warehouseAccessService: WarehouseAccessService,
  ) {}

  async create(user: AuthUser, warehouseId: string, dto: CreateWarehouseReceptionDto) {
    const tenantId = this.warehouseAccessService.getTenantIdOrThrow(user);
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);

    if (!dto.products || dto.products.length === 0) {
      throw new BadRequestException('La recepción debe incluir al menos un producto');
    }

    const productIds = dto.products.map((item) => item.productId);
    const uniqueIds = new Set(productIds);
    if (uniqueIds.size !== productIds.length) {
      throw new BadRequestException('No se permiten productos repetidos en la recepción');
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
      throw new ForbiddenException('Uno o más productos no pertenecen al tenant');
    }

    let supplyOrderId: string | null = null;
    if (dto.supplyOrderId) {
      const order = await this.prisma.supplyOrder.findFirst({
        where: {
          id: dto.supplyOrderId,
          tenantId,
          warehouseId,
        },
        include: {
          products: {
            select: { productId: true, quantity: true },
          },
        },
      });

      if (!order) {
        throw new NotFoundException('Orden de suministro no encontrada para este almacén');
      }

      if (order.status === SupplyOrderStatus.ANNULLATED) {
        throw new BadRequestException('No se puede recepcionar una orden anulada');
      }

      const requestedProducts = new Set(order.products.map((p) => p.productId));
      for (const productId of productIds) {
        if (!requestedProducts.has(productId)) {
          throw new BadRequestException('La recepción contiene productos fuera de la orden de suministro');
        }
      }

      supplyOrderId = order.id;
    }

    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();

    const created = await this.prisma.$transaction(async (prisma) => {
      const reception = await prisma.warehouseReception.create({
        data: {
          warehouseId,
          supplyOrderId,
          tenantId,
          createdById: user.userId,
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
          receivedAt,
        },
        select: {
          id: true,
          warehouseId: true,
          supplyOrderId: true,
          receivedAt: true,
          reference: true,
          notes: true,
          createdAt: true,
        },
      });

      await prisma.warehouseReceptionProduct.createMany({
        data: dto.products.map((product) => ({
          warehouseReceptionId: reception.id,
          productId: product.productId,
          quantity: product.quantity,
        })),
      });

      for (const item of dto.products) {
        const warehouseProduct = await prisma.warehouseProduct.upsert({
          where: {
            warehouseId_productId: {
              warehouseId,
              productId: item.productId,
            },
          },
          create: {
            warehouseId,
            productId: item.productId,
            tenantId,
            stock: item.quantity,
            stockThreshold: 0,
          },
          update: {
            stock: { increment: item.quantity },
          },
          select: {
            id: true,
          },
        });

        await prisma.warehouseMovement.create({
          data: {
            warehouseId,
            warehouseProductId: warehouseProduct.id,
            type: InventoryMovementType.INCOMING,
            quantity: item.quantity,
            description: 'Ingreso por recepción de almacén',
            userId: user.userId,
            tenantId,
          },
        });
      }

      if (supplyOrderId) {
        await prisma.supplyOrder.update({
          where: { id: supplyOrderId },
          data: { status: SupplyOrderStatus.RECEIVED },
          select: { id: true },
        });
      }

      return reception;
    });

    return created;
  }

  async list(user: AuthUser, warehouseId: string, query: ListWarehouseReceptionsDto) {
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
      ...(query.fromDate || query.toDate
        ? {
            receivedAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.warehouseReception.count({ where }),
      this.prisma.warehouseReception.findMany({
        where,
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          products: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          supplyOrder: {
            select: {
              id: true,
              code: true,
              status: true,
            },
          },
        },
        orderBy: { receivedAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return buildPaginatedResponse(rows, total, page, pageSize);
  }

  async findOne(user: AuthUser, warehouseId: string, id: string) {
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);

    const row = await this.prisma.warehouseReception.findFirst({
      where: {
        id,
        warehouseId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        products: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        },
        supplyOrder: {
          select: {
            id: true,
            code: true,
            status: true,
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Recepción de almacén no encontrada');
    }

    return row;
  }
}
