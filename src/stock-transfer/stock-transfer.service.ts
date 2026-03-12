import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EstablishmentType, Prisma, StockTransferStatus } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { buildPaginatedResponse, getPaginationParams } from '../common/pagination/pagination.helper';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { UpdateStockTransferDto } from './dto/update-stock-transfer.dto';
import { ReceiveStockTransferDto } from './dto/receive-stock-transfer.dto';
import { AnnulStockTransferDto } from './dto/annul-stock-transfer.dto';
import { ListStockTransfersDto } from './dto/list-stock-transfers.dto';

const codeGenerator = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

type AuthUser = {
  userId?: string;
  id?: string;
  tenantId?: string;
  role?: string;
};

@Injectable()
export class StockTransferService {
  private readonly logger = new Logger(StockTransferService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getTenantIdOrThrow(user?: AuthUser): string {
    const tenantId = user?.tenantId;
    if (!tenantId) throw new ForbiddenException('Tenant no encontrado en el token');
    return tenantId;
  }

  private getAuthUserIdOrThrow(user?: AuthUser): string {
    const userId = user?.userId ?? user?.id;
    if (!userId) throw new ForbiddenException('Usuario no autenticado');
    return userId;
  }

  private async assertEstablishmentAccess(
    user: AuthUser,
    type: EstablishmentType,
    storeId: string | null | undefined,
    warehouseId: string | null | undefined,
    tenantId: string,
  ): Promise<void> {
    if (type === EstablishmentType.STORE) {
      if (!storeId) throw new BadRequestException('originStoreId o destinationStoreId requerido para tipo STORE');
      const store = await this.prisma.store.findFirst({
        where: { id: storeId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!store) throw new NotFoundException('Tienda no encontrada');
      if (user.role !== 'ADMIN') {
        const member = await this.prisma.storeUsers.findFirst({
          where: { storeId, userId: this.getAuthUserIdOrThrow(user) },
          select: { id: true },
        });
        if (!member) throw new ForbiddenException('No tienes acceso a esta tienda');
      }
    } else {
      if (!warehouseId) throw new BadRequestException('originWarehouseId o destinationWarehouseId requerido para tipo WAREHOUSE');
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: warehouseId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!warehouse) throw new NotFoundException('Almacén no encontrado');
      if (user.role !== 'ADMIN') {
        const userId = this.getAuthUserIdOrThrow(user);
        const byEmployee = await this.prisma.warehouseEmployed.findFirst({
          where: { warehouseId, employed: { userId } },
          select: { id: true },
        });
        if (!byEmployee) {
          const byStore = await this.prisma.warehouseStore.findFirst({
            where: { warehouseId, store: { storeUsers: { some: { userId } } } },
            select: { id: true },
          });
          if (!byStore) throw new ForbiddenException('No tienes acceso a este almacén');
        }
      }
    }
  }

  private async userBelongsToEstablishment(
    user: AuthUser,
    type: EstablishmentType,
    storeId: string | null | undefined,
    warehouseId: string | null | undefined,
  ): Promise<boolean> {
    if (user.role === 'ADMIN') return true;
    const userId = this.getAuthUserIdOrThrow(user);
    if (type === EstablishmentType.STORE && storeId) {
      const member = await this.prisma.storeUsers.findFirst({
        where: { storeId, userId },
        select: { id: true },
      });
      return !!member;
    }
    if (type === EstablishmentType.WAREHOUSE && warehouseId) {
      const byEmployee = await this.prisma.warehouseEmployed.findFirst({
        where: { warehouseId, employed: { userId } },
        select: { id: true },
      });
      if (byEmployee) return true;
      const byStore = await this.prisma.warehouseStore.findFirst({
        where: { warehouseId, store: { storeUsers: { some: { userId } } } },
        select: { id: true },
      });
      return !!byStore;
    }
    return false;
  }

  private async validateEstablishmentExists(
    type: EstablishmentType,
    storeId: string | null | undefined,
    warehouseId: string | null | undefined,
    tenantId: string,
  ): Promise<void> {
    if (type === EstablishmentType.STORE) {
      if (!storeId) throw new BadRequestException('storeId es requerido para tipo STORE');
      const store = await this.prisma.store.findFirst({
        where: { id: storeId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!store) throw new NotFoundException('Tienda destino no encontrada');
    } else {
      if (!warehouseId) throw new BadRequestException('warehouseId es requerido para tipo WAREHOUSE');
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: warehouseId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!warehouse) throw new NotFoundException('Almacén destino no encontrado');
    }
  }

  private async generateCode(prisma: Prisma.TransactionClient, tenantId: string): Promise<string> {
    while (true) {
      const code = `TRF-${codeGenerator()}`;
      const exists = await prisma.stockTransfer.findFirst({
        where: { tenantId, code },
        select: { id: true },
      });
      if (!exists) return code;
    }
  }

  async create(dto: CreateStockTransferDto, user: AuthUser): Promise<{ success: boolean }> {
    const tenantId = this.getTenantIdOrThrow(user);
    const createdById = this.getAuthUserIdOrThrow(user);

    if (dto.originType === EstablishmentType.STORE && !dto.originStoreId) {
      throw new BadRequestException('originStoreId es requerido cuando originType es STORE');
    }
    if (dto.originType === EstablishmentType.WAREHOUSE && !dto.originWarehouseId) {
      throw new BadRequestException('originWarehouseId es requerido cuando originType es WAREHOUSE');
    }
    if (dto.destinationType === EstablishmentType.STORE && !dto.destinationStoreId) {
      throw new BadRequestException('destinationStoreId es requerido cuando destinationType es STORE');
    }
    if (dto.destinationType === EstablishmentType.WAREHOUSE && !dto.destinationWarehouseId) {
      throw new BadRequestException('destinationWarehouseId es requerido cuando destinationType es WAREHOUSE');
    }

    if (
      dto.originType === dto.destinationType &&
      ((dto.originStoreId && dto.originStoreId === dto.destinationStoreId) ||
        (dto.originWarehouseId && dto.originWarehouseId === dto.destinationWarehouseId))
    ) {
      throw new BadRequestException('El origen y el destino no pueden ser el mismo establecimiento');
    }

    const productIds = dto.items.map((i) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException('No se permiten productos duplicados en la transferencia');
    }

    await this.assertEstablishmentAccess(user, dto.originType, dto.originStoreId, dto.originWarehouseId, tenantId);
    await this.validateEstablishmentExists(dto.destinationType, dto.destinationStoreId, dto.destinationWarehouseId, tenantId);

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isDeleted: false, createdBy: { tenantId } },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('Uno o más productos no existen o no pertenecen a este tenant');
    }

    await this.prisma.$transaction(async (prisma) => {
      const code = await this.generateCode(prisma, tenantId);
      const transfer = await prisma.stockTransfer.create({
        data: {
          code,
          status: StockTransferStatus.ISSUED,
          notes: dto.notes ?? null,
          originType: dto.originType,
          originStoreId: dto.originStoreId ?? null,
          originWarehouseId: dto.originWarehouseId ?? null,
          destinationType: dto.destinationType,
          destinationStoreId: dto.destinationStoreId ?? null,
          destinationWarehouseId: dto.destinationWarehouseId ?? null,
          tenantId,
          createdById,
        },
        select: { id: true },
      });

      await prisma.stockTransferProduct.createMany({
        data: dto.items.map((item) => ({
          stockTransferId: transfer.id,
          productId: item.productId,
          quantityRequested: item.quantityRequested,
        })),
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { success: true };
  }

  async confirm(transferId: string, user: AuthUser): Promise<{ success: boolean }> {
    const tenantId = this.getTenantIdOrThrow(user);
    const userId = this.getAuthUserIdOrThrow(user);

    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id: transferId, tenantId },
      include: { items: true },
    });

    if (!transfer) throw new NotFoundException('Transferencia no encontrada');
    if (transfer.status !== StockTransferStatus.ISSUED) {
      throw new BadRequestException('Solo se puede confirmar una transferencia en estado ISSUED');
    }

    await this.assertEstablishmentAccess(user, transfer.originType, transfer.originStoreId, transfer.originWarehouseId, tenantId);

    await this.prisma.$transaction(async (prisma) => {
      if (transfer.originType === EstablishmentType.STORE) {
        const storeId = transfer.originStoreId!;
        for (const item of transfer.items) {
          const storeProduct = await prisma.storeProduct.findFirst({
            where: { storeId, productId: item.productId },
            select: { id: true, stock: true },
          });
          if (!storeProduct) {
            throw new NotFoundException(`Producto ${item.productId} no existe en la tienda origen`);
          }
          if (storeProduct.stock < item.quantityRequested) {
            throw new BadRequestException(
              `Stock insuficiente para el producto. Disponible: ${storeProduct.stock}, solicitado: ${item.quantityRequested}`,
            );
          }
          await prisma.storeProduct.update({
            where: { id: storeProduct.id },
            data: { stock: { decrement: item.quantityRequested } },
          });
          await prisma.inventoryMovement.create({
            data: {
              type: 'OUTGOING',
              quantity: -item.quantityRequested,
              description: `Salida por transferencia de stock: ${transfer.code}`,
              storeProductId: storeProduct.id,
              storeId,
              userId,
              tenantId,
            },
          });
        }
      } else {
        const warehouseId = transfer.originWarehouseId!;
        for (const item of transfer.items) {
          const warehouseProduct = await prisma.warehouseProduct.findFirst({
            where: { warehouseId, productId: item.productId },
            select: { id: true, stock: true },
          });
          if (!warehouseProduct) {
            throw new NotFoundException(`Producto ${item.productId} no existe en el almacén origen`);
          }
          if (warehouseProduct.stock < item.quantityRequested) {
            throw new BadRequestException(
              `Stock insuficiente para el producto. Disponible: ${warehouseProduct.stock}, solicitado: ${item.quantityRequested}`,
            );
          }
          await prisma.warehouseProduct.update({
            where: { id: warehouseProduct.id },
            data: { stock: { decrement: item.quantityRequested } },
          });
          await prisma.warehouseMovement.create({
            data: {
              warehouseId,
              warehouseProductId: warehouseProduct.id,
              type: 'OUTGOING',
              quantity: -item.quantityRequested,
              description: `Salida por transferencia de stock: ${transfer.code}`,
              userId,
              tenantId,
            },
          });
        }
      }

      await prisma.stockTransfer.update({
        where: { id: transferId },
        data: {
          status: StockTransferStatus.PENDING,
          confirmedById: userId,
          confirmedAt: new Date(),
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { success: true };
  }

  async receive(transferId: string, dto: ReceiveStockTransferDto, user: AuthUser): Promise<{ success: boolean }> {
    const tenantId = this.getTenantIdOrThrow(user);
    const userId = this.getAuthUserIdOrThrow(user);

    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id: transferId, tenantId },
      include: { items: true },
    });

    if (!transfer) throw new NotFoundException('Transferencia no encontrada');
    if (
      transfer.status !== StockTransferStatus.PENDING &&
      transfer.status !== StockTransferStatus.PARTIAL
    ) {
      throw new BadRequestException('Solo se puede recepcionar en estado PENDING o PARTIAL');
    }

    await this.assertEstablishmentAccess(
      user,
      transfer.destinationType,
      transfer.destinationStoreId,
      transfer.destinationWarehouseId,
      tenantId,
    );

    const itemMap = new Map<string, any>(transfer.items.map((i: any) => [i.id, i]));

    const dtoIds = dto.items.map((i) => i.stockTransferProductId);
    if (new Set(dtoIds).size !== dtoIds.length) {
      throw new BadRequestException('No se permiten items duplicados en la recepción');
    }

    for (const dtoItem of dto.items) {
      const item = itemMap.get(dtoItem.stockTransferProductId);
      if (!item) {
        throw new NotFoundException(`Item ${dtoItem.stockTransferProductId} no pertenece a esta transferencia`);
      }
      const alreadyReceived = item.quantityReceived ?? 0;
      const remaining = item.quantityRequested - alreadyReceived;
      if (dtoItem.quantityReceived > remaining) {
        throw new BadRequestException(
          `Cantidad a recepcionar (${dtoItem.quantityReceived}) supera la pendiente (${remaining}) para el producto ${item.productId}`,
        );
      }
    }

    const updatedReceived = new Map<string, number>();
    for (const item of transfer.items) {
      const dtoItem = dto.items.find((d) => d.stockTransferProductId === item.id);
      const existing = item.quantityReceived ?? 0;
      const additional = dtoItem?.quantityReceived ?? 0;
      updatedReceived.set(item.id, existing + additional);
    }

    const allComplete = transfer.items.every(
      (item) => (updatedReceived.get(item.id) ?? 0) >= item.quantityRequested,
    );

    const nextStatus = allComplete
      ? StockTransferStatus.COMPLETED
      : dto.closePartial
        ? StockTransferStatus.PARTIALLY_RECEIVED
        : StockTransferStatus.PARTIAL;

    await this.prisma.$transaction(async (prisma) => {
      for (const dtoItem of dto.items) {
        const item = itemMap.get(dtoItem.stockTransferProductId)!;
        const newReceived = (item.quantityReceived ?? 0) + dtoItem.quantityReceived;

        await prisma.stockTransferProduct.update({
          where: { id: item.id },
          data: { quantityReceived: newReceived },
        });

        if (transfer.destinationType === EstablishmentType.STORE) {
          const storeId = transfer.destinationStoreId!;
          const existing = await prisma.storeProduct.findFirst({
            where: { storeId, productId: item.productId },
            select: { id: true },
          });
          const storeProduct = existing
            ? await prisma.storeProduct.update({
                where: { id: existing.id },
                data: { stock: { increment: dtoItem.quantityReceived } },
                select: { id: true },
              })
            : await prisma.storeProduct.create({
                data: {
                  storeId,
                  productId: item.productId,
                  userId,
                  tenantId,
                  price: 0,
                  stock: dtoItem.quantityReceived,
                  stockThreshold: 0,
                },
                select: { id: true },
              });
          await prisma.inventoryMovement.create({
            data: {
              type: 'INCOMING',
              quantity: dtoItem.quantityReceived,
              description: `Recepción por transferencia de stock: ${transfer.code}`,
              storeProductId: storeProduct.id,
              storeId,
              userId,
              tenantId,
            },
          });
        } else {
          const warehouseId = transfer.destinationWarehouseId!;
          const warehouseProduct = await prisma.warehouseProduct.upsert({
            where: { warehouseId_productId: { warehouseId, productId: item.productId } },
            update: { stock: { increment: dtoItem.quantityReceived } },
            create: {
              warehouseId,
              productId: item.productId,
              tenantId,
              stock: dtoItem.quantityReceived,
              stockThreshold: 0,
            },
            select: { id: true },
          });
          await prisma.warehouseMovement.create({
            data: {
              warehouseId,
              warehouseProductId: warehouseProduct.id,
              type: 'INCOMING',
              quantity: dtoItem.quantityReceived,
              description: `Recepción por transferencia de stock: ${transfer.code}`,
              userId,
              tenantId,
            },
          });
        }
      }

      await prisma.stockTransfer.update({
        where: { id: transferId },
        data: { status: nextStatus },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { success: true };
  }

  async closePartial(transferId: string, user: AuthUser): Promise<{ success: boolean }> {
    const tenantId = this.getTenantIdOrThrow(user);

    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id: transferId, tenantId },
      select: { id: true, status: true, destinationType: true, destinationStoreId: true, destinationWarehouseId: true },
    });

    if (!transfer) throw new NotFoundException('Transferencia no encontrada');
    if (transfer.status !== StockTransferStatus.PARTIAL) {
      throw new BadRequestException('Solo se puede cerrar como parcial una transferencia en estado PARTIAL');
    }

    await this.assertEstablishmentAccess(
      user,
      transfer.destinationType,
      transfer.destinationStoreId,
      transfer.destinationWarehouseId,
      tenantId,
    );

    await this.prisma.stockTransfer.update({
      where: { id: transferId },
      data: { status: StockTransferStatus.PARTIALLY_RECEIVED },
    });

    return { success: true };
  }

  async annul(transferId: string, dto: AnnulStockTransferDto, user: AuthUser): Promise<{ success: boolean }> {
    const tenantId = this.getTenantIdOrThrow(user);
    const userId = this.getAuthUserIdOrThrow(user);

    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id: transferId, tenantId },
      include: { items: true },
    });

    if (!transfer) throw new NotFoundException('Transferencia no encontrada');
    if (
      transfer.status !== StockTransferStatus.ISSUED &&
      transfer.status !== StockTransferStatus.PENDING
    ) {
      throw new BadRequestException(
        'Solo se puede anular una transferencia en estado ISSUED o PENDING',
      );
    }

    const isOrigin = await this.userBelongsToEstablishment(
      user,
      transfer.originType,
      transfer.originStoreId,
      transfer.originWarehouseId,
    );
    const isDestination = await this.userBelongsToEstablishment(
      user,
      transfer.destinationType,
      transfer.destinationStoreId,
      transfer.destinationWarehouseId,
    );

    if (user.role !== 'ADMIN' && !isOrigin && !isDestination) {
      throw new ForbiddenException('No tienes permiso para anular esta transferencia');
    }
    if (transfer.status === StockTransferStatus.ISSUED && user.role !== 'ADMIN' && !isOrigin) {
      throw new ForbiddenException('Solo el establecimiento origen puede anular una transferencia en estado ISSUED');
    }

    await this.prisma.$transaction(async (prisma) => {
      if (transfer.status === StockTransferStatus.PENDING) {
        if (transfer.originType === EstablishmentType.STORE) {
          const storeId = transfer.originStoreId!;
          for (const item of transfer.items) {
            const storeProduct = await prisma.storeProduct.findFirst({
              where: { storeId, productId: item.productId },
              select: { id: true },
            });
            if (storeProduct) {
              await prisma.storeProduct.update({
                where: { id: storeProduct.id },
                data: { stock: { increment: item.quantityRequested } },
              });
              await prisma.inventoryMovement.create({
                data: {
                  type: 'INCOMING',
                  quantity: item.quantityRequested,
                  description: `Restauración de stock por anulación de transferencia: ${transfer.code}`,
                  storeProductId: storeProduct.id,
                  storeId,
                  userId,
                  tenantId,
                },
              });
            }
          }
        } else {
          const warehouseId = transfer.originWarehouseId!;
          for (const item of transfer.items) {
            const warehouseProduct = await prisma.warehouseProduct.findFirst({
              where: { warehouseId, productId: item.productId },
              select: { id: true },
            });
            if (warehouseProduct) {
              await prisma.warehouseProduct.update({
                where: { id: warehouseProduct.id },
                data: { stock: { increment: item.quantityRequested } },
              });
              await prisma.warehouseMovement.create({
                data: {
                  warehouseId,
                  warehouseProductId: warehouseProduct.id,
                  type: 'INCOMING',
                  quantity: item.quantityRequested,
                  description: `Restauración de stock por anulación de transferencia: ${transfer.code}`,
                  userId,
                  tenantId,
                },
              });
            }
          }
        }
      }

      await prisma.stockTransfer.update({
        where: { id: transferId },
        data: {
          status: StockTransferStatus.ANNULLATED,
          cancelledById: userId,
          cancelledAt: new Date(),
          cancelReason: dto.cancelReason,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { success: true };
  }

  async update(transferId: string, dto: UpdateStockTransferDto, user: AuthUser): Promise<{ success: boolean }> {
    const tenantId = this.getTenantIdOrThrow(user);

    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id: transferId, tenantId },
      select: { id: true, status: true, originType: true, originStoreId: true, originWarehouseId: true },
    });

    if (!transfer) throw new NotFoundException('Transferencia no encontrada');
    if (transfer.status !== StockTransferStatus.ISSUED) {
      throw new BadRequestException('Solo se puede editar una transferencia en estado ISSUED');
    }

    await this.assertEstablishmentAccess(
      user,
      transfer.originType,
      transfer.originStoreId,
      transfer.originWarehouseId,
      tenantId,
    );

    if (dto.items) {
      const productIds = dto.items.map((i) => i.productId);
      if (new Set(productIds).size !== productIds.length) {
        throw new BadRequestException('No se permiten productos duplicados');
      }
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds }, isDeleted: false, createdBy: { tenantId } },
        select: { id: true },
      });
      if (products.length !== productIds.length) {
        throw new BadRequestException('Uno o más productos no existen o no pertenecen a este tenant');
      }
    }

    await this.prisma.$transaction(async (prisma) => {
      if (dto.items) {
        await prisma.stockTransferProduct.deleteMany({
          where: { stockTransferId: transferId },
        });
        await prisma.stockTransferProduct.createMany({
          data: dto.items.map((item) => ({
            stockTransferId: transferId,
            productId: item.productId,
            quantityRequested: item.quantityRequested,
          })),
        });
      }
      if (dto.notes !== undefined) {
        await prisma.stockTransfer.update({
          where: { id: transferId },
          data: { notes: dto.notes },
        });
      }
    });

    return { success: true };
  }

  async list(query: ListStockTransfersDto, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    if (!query.storeId && !query.warehouseId) {
      throw new BadRequestException('Debes proporcionar storeId o warehouseId');
    }
    if (query.storeId && query.warehouseId) {
      throw new BadRequestException('Solo puedes proporcionar storeId o warehouseId, no ambos');
    }

    const isStore = !!query.storeId;
    const establishmentId = query.storeId ?? query.warehouseId!;
    const establishmentType = isStore ? EstablishmentType.STORE : EstablishmentType.WAREHOUSE;

    await this.assertEstablishmentAccess(
      user,
      establishmentType,
      isStore ? establishmentId : undefined,
      !isStore ? establishmentId : undefined,
      tenantId,
    );

    const { page, pageSize, skip } = getPaginationParams({
      page: query.page,
      pageSize: query.pageSize,
      defaultPage: 1,
      defaultPageSize: 15,
      maxPageSize: 100,
    });

    const originFilter = isStore ? { originStoreId: establishmentId } : { originWarehouseId: establishmentId };
    const destFilter = isStore ? { destinationStoreId: establishmentId } : { destinationWarehouseId: establishmentId };

    const where: any = {
      tenantId,
      OR: [
        originFilter,
        { ...destFilter, status: { not: StockTransferStatus.ISSUED } },
      ],
    };

    if (query.status) where.status = query.status;
    if (query.code) where.code = { contains: query.code, mode: 'insensitive' };

    const [total, items] = await Promise.all([
      this.prisma.stockTransfer.count({ where }),
      this.prisma.stockTransfer.findMany({
        where,
        select: {
          id: true,
          code: true,
          status: true,
          notes: true,
          cancelReason: true,
          createdAt: true,
          originType: true,
          originStoreId: true,
          originStore: { select: { id: true, name: true } },
          originWarehouseId: true,
          originWarehouse: { select: { id: true, name: true } },
          destinationType: true,
          destinationStoreId: true,
          destinationStore: { select: { id: true, name: true } },
          destinationWarehouseId: true,
          destinationWarehouse: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return buildPaginatedResponse(
      items.map((item: any) => ({
        id: item.id,
        code: item.code,
        status: item.status,
        createdAt: item.createdAt,
        ...(item.status === StockTransferStatus.ANNULLATED
          ? { notes: item.notes, cancelReason: item.cancelReason }
          : {}),
        origin: {
          type: item.originType,
          id: item.originStoreId ?? item.originWarehouseId,
          name: item.originStore?.name ?? item.originWarehouse?.name ?? null,
        },
        destination: {
          type: item.destinationType,
          id: item.destinationStoreId ?? item.destinationWarehouseId,
          name: item.destinationStore?.name ?? item.destinationWarehouse?.name ?? null,
        },
        createdBy: {
          id: item.createdBy?.id ?? null,
          name: item.createdBy?.name ?? null,
        },
        itemCount: item._count?.items ?? 0,
      })),
      total,
      page,
      pageSize,
    );
  }

  async findOne(transferId: string, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id: transferId, tenantId },
      select: {
        id: true,
        code: true,
        status: true,
        notes: true,
        cancelReason: true,
        createdAt: true,
        updatedAt: true,
        confirmedAt: true,
        cancelledAt: true,
        originType: true,
        originStoreId: true,
        originStore: { select: { id: true, name: true, address: true, phone: true } },
        originWarehouseId: true,
        originWarehouse: { select: { id: true, name: true, address: true, phone: true } },
        destinationType: true,
        destinationStoreId: true,
        destinationStore: { select: { id: true, name: true, address: true, phone: true } },
        destinationWarehouseId: true,
        destinationWarehouse: { select: { id: true, name: true, address: true, phone: true } },
        createdBy: { select: { id: true, name: true } },
        confirmedBy: { select: { id: true, name: true } },
        cancelledBy: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            productId: true,
            quantityRequested: true,
            quantityReceived: true,
            product: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!transfer) throw new NotFoundException('Transferencia no encontrada');

    const isOrigin = await this.userBelongsToEstablishment(
      user,
      transfer.originType,
      transfer.originStoreId,
      transfer.originWarehouseId,
    );
    const isDestination = await this.userBelongsToEstablishment(
      user,
      transfer.destinationType,
      transfer.destinationStoreId,
      transfer.destinationWarehouseId,
    );

    if (user.role !== 'ADMIN' && !isOrigin && !isDestination) {
      throw new ForbiddenException('No tienes acceso a esta transferencia');
    }
    if (transfer.status === StockTransferStatus.ISSUED && user.role !== 'ADMIN' && !isOrigin) {
      throw new ForbiddenException('Esta transferencia aún no ha sido confirmada para el destino');
    }

    return {
      id: transfer.id,
      code: transfer.code,
      status: transfer.status,
      notes: transfer.notes,
      cancelReason: transfer.cancelReason,
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
      confirmedAt: transfer.confirmedAt,
      cancelledAt: transfer.cancelledAt,
      origin: {
        type: transfer.originType,
        ...(transfer.originStore ?? transfer.originWarehouse),
      },
      destination: {
        type: transfer.destinationType,
        ...(transfer.destinationStore ?? transfer.destinationWarehouse),
      },
      createdBy: transfer.createdBy,
      confirmedBy: transfer.confirmedBy ?? null,
      cancelledBy: transfer.cancelledBy ?? null,
      items: transfer.items,
    };
  }
}
