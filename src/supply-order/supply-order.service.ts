import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplyOrderDto } from './dto/create-supply-order.dto';
import { ReceiveSupplyOrderDto } from './dto/receive-supply-order.dto';
import { SupplyOrderStatus } from '@prisma/client';
import { customAlphabet } from 'nanoid';

const codeGenerator = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);

type AuthUser = {
  userId?: string;
  id?: string;
  tenantId?: string;
  role?: string;
};

@Injectable()
export class SupplyOrderService {
  private readonly logger = new Logger(SupplyOrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getTenantIdOrThrow(user?: AuthUser): string {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }
    return tenantId;
  }

  private getAuthUserIdOrThrow(user?: AuthUser): string {
    const userId = user?.userId ?? user?.id;
    if (!userId) {
      throw new ForbiddenException('Usuario no autenticado');
    }
    return userId;
  }

  private generateCode(): string {
    return codeGenerator();
  }

  async create(input: CreateSupplyOrderDto, user?: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    const createdById = this.getAuthUserIdOrThrow(user);

    if (input.warehouseId && input.storeId) {
      throw new BadRequestException('Solo puedes enviar warehouseId o storeId, no ambos');
    }

    if (!input.warehouseId && !input.storeId) {
      throw new BadRequestException('Debes enviar warehouseId o storeId');
    }

    if (!input.products || input.products.length === 0) {
      throw new BadRequestException('La lista de productos no puede estar vacía');
    }

    const productIds = input.products.map((p) => p.productId);
    const uniqueIds = new Set(productIds);
    if (uniqueIds.size !== productIds.length) {
      throw new BadRequestException('No se permiten productos duplicados en la solicitud');
    }

    const provider = await (this.prisma.provider as any).findFirst({
      where: {
        id: input.providerId,
        deletedAt: null,
        createdBy: { tenantId },
      },
      select: { id: true },
    });

    if (!provider) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    if (input.warehouseId) {
      const warehouse = await (this.prisma.warehouse as any).findFirst({
        where: { id: input.warehouseId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!warehouse) {
        throw new NotFoundException('Almacén no encontrado');
      }
    }

    if (input.storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: input.storeId, tenantId },
        select: { id: true },
      });
      if (!store) {
        throw new NotFoundException('Tienda no encontrada');
      }
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

    const providerProducts = await this.prisma.providerProduct.findMany({
      where: {
        providerId: input.providerId,
        productId: { in: productIds },
      },
      select: { productId: true },
    });

    const suppliedIds = new Set(providerProducts.map((p) => p.productId));
    const missingIds = productIds.filter((id) => !suppliedIds.has(id));
    if (missingIds.length > 0) {
      this.logger.warn(
        `Proveedor ${input.providerId} no abastece ${missingIds.length} productos solicitados`,
      );
    }

    await this.prisma.$transaction(async (prisma) => {
      const supplyOrder = await prisma.supplyOrder.create({
        data: {
          code: this.generateCode(),
          status: SupplyOrderStatus.ISSUED,
          description: input.description ?? null,
          providerId: input.providerId,
          tenantId,
          createdById,
          warehouseId: input.warehouseId ?? null,
          storeId: input.storeId ?? null,
        },
        select: { id: true },
      });

      await prisma.supplyOrderProduct.createMany({
        data: input.products.map((product) => ({
          supplyOrderId: supplyOrder.id,
          productId: product.productId,
          quantity: product.quantity,
          note: product.note ?? null,
        })),
        skipDuplicates: false,
      });

      if (input.warehouseId) {
        await prisma.warehouseReception.create({
          data: {
            warehouseId: input.warehouseId,
            supplyOrderId: supplyOrder.id,
            tenantId,
            createdById,
          },
          select: { id: true },
        });
      }

      if (input.storeId) {
        await prisma.storeReception.create({
          data: {
            storeId: input.storeId,
            supplyOrderId: supplyOrder.id,
            tenantId,
            createdById,
          },
          select: { id: true },
        });
      }
    });

    return { success: true };
  }

  async receive(orderId: string, input: ReceiveSupplyOrderDto, user?: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    const receivedById = this.getAuthUserIdOrThrow(user);

    const supplyOrder = await this.prisma.supplyOrder.findFirst({
      where: {
        id: orderId,
        tenantId,
      },
      include: {
        products: {
          select: { productId: true, quantity: true },
        },
        warehouseReceptions: {
          select: { id: true, warehouseId: true },
        },
        storeReceptions: {
          select: { id: true, storeId: true },
        },
      },
    });

    if (!supplyOrder) {
      throw new NotFoundException('Orden de suministro no encontrada');
    }

    if (supplyOrder.status === SupplyOrderStatus.ANNULLATED) {
      throw new BadRequestException('La orden está anulada');
    }

    if (
      supplyOrder.status !== SupplyOrderStatus.PENDING &&
      supplyOrder.status !== SupplyOrderStatus.PARTIAL
    ) {
      throw new BadRequestException('La orden no está pendiente de recepción');
    }

    if (!input.products || input.products.length === 0) {
      throw new BadRequestException('La lista de productos no puede estar vacía');
    }

    const productIds = input.products.map((p) => p.productId);
    const uniqueIds = new Set(productIds);
    if (uniqueIds.size !== productIds.length) {
      throw new BadRequestException('No se permiten productos duplicados en la recepción');
    }

    const orderProductsMap = new Map(
      supplyOrder.products.map((p) => [p.productId, p.quantity]),
    );

    for (const product of input.products) {
      if (!orderProductsMap.has(product.productId)) {
        throw new BadRequestException('Hay productos no solicitados en la orden');
      }

      if (product.batches && product.batches.length > 0) {
        const batchTotal = product.batches.reduce((sum, b) => sum + b.quantity, 0);
        if (batchTotal !== product.quantity) {
          throw new BadRequestException(
            `La suma de lotes debe ser igual a la cantidad recibida para el producto ${product.productId}`,
          );
        }
      }
    }

    const previousReceived = new Map<string, number>();

    if (supplyOrder.warehouseId) {
      const receptions = await this.prisma.warehouseReceptionProduct.findMany({
        where: {
          warehouseReception: { supplyOrderId: orderId },
        },
        select: { productId: true, quantity: true },
      });

      receptions.forEach((r) => {
        previousReceived.set(r.productId, (previousReceived.get(r.productId) ?? 0) + r.quantity);
      });
    }

    if (supplyOrder.storeId) {
      const receptions = await this.prisma.storeReceptionProduct.findMany({
        where: {
          storeReception: { supplyOrderId: orderId },
        },
        select: { productId: true, quantity: true },
      });

      receptions.forEach((r) => {
        previousReceived.set(r.productId, (previousReceived.get(r.productId) ?? 0) + r.quantity);
      });
    }

    for (const product of input.products) {
      const orderedQty = orderProductsMap.get(product.productId) ?? 0;
      const alreadyReceived = previousReceived.get(product.productId) ?? 0;
      if (alreadyReceived + product.quantity > orderedQty) {
        throw new BadRequestException(
          `La cantidad recibida supera la cantidad pedida para el producto ${product.productId}`,
        );
      }
    }

    const receivedTotals = new Map<string, number>();
    orderProductsMap.forEach((qty, productId) => {
      receivedTotals.set(productId, previousReceived.get(productId) ?? 0);
    });
    input.products.forEach((product) => {
      receivedTotals.set(
        product.productId,
        (receivedTotals.get(product.productId) ?? 0) + product.quantity,
      );
    });

    const allReceived = Array.from(orderProductsMap.entries()).every(([productId, qty]) => {
      return (receivedTotals.get(productId) ?? 0) >= qty;
    });

    const receivedAt = new Date();

    await this.prisma.$transaction(async (prisma) => {
      if (supplyOrder.warehouseId) {
        const reception = supplyOrder.warehouseReceptions[0];
        if (!reception?.id) {
          throw new BadRequestException('Recepción de almacén no encontrada');
        }

        await prisma.warehouseReception.update({
          where: { id: reception.id },
          data: {
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            receivedAt,
            createdById: receivedById,
          },
          select: { id: true },
        });

        await prisma.warehouseReceptionProduct.createMany({
          data: input.products.map((product) => ({
            warehouseReceptionId: reception.id,
            productId: product.productId,
            quantity: product.quantity,
          })),
        });

        for (const product of input.products) {
          const warehouseProduct = await prisma.warehouseProduct.upsert({
            where: {
              warehouseId_productId: {
                warehouseId: supplyOrder.warehouseId!,
                productId: product.productId,
              },
            },
            update: {
              stock: { increment: product.quantity },
            },
            create: {
              warehouseId: supplyOrder.warehouseId!,
              productId: product.productId,
              tenantId,
              stock: product.quantity,
              stockThreshold: 0,
            },
            select: { id: true },
          });

          if (product.batches && product.batches.length > 0) {
            await prisma.productBatch.createMany({
              data: product.batches.map((batch) => ({
                warehouseProductId: warehouseProduct.id,
                quantity: batch.quantity,
                productionDate: batch.productionDate ?? null,
                expirationDate: batch.expirationDate ?? null,
                receivedAt,
              })),
            });
          }
        }
      }

      if (supplyOrder.storeId) {
        const reception = supplyOrder.storeReceptions[0];
        if (!reception?.id) {
          throw new BadRequestException('Recepción de tienda no encontrada');
        }

        await prisma.storeReception.update({
          where: { id: reception.id },
          data: {
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            receivedAt,
            createdById: receivedById,
          },
          select: { id: true },
        });

        await prisma.storeReceptionProduct.createMany({
          data: input.products.map((product) => ({
            storeReceptionId: reception.id,
            productId: product.productId,
            quantity: product.quantity,
          })),
        });

        for (const product of input.products) {
          const existing = await prisma.storeProduct.findFirst({
            where: {
              storeId: supplyOrder.storeId!,
              productId: product.productId,
            },
            select: { id: true, stock: true },
          });

          const storeProduct = existing
            ? await prisma.storeProduct.update({
                where: { id: existing.id },
                data: { stock: { increment: product.quantity } },
                select: { id: true },
              })
            : await prisma.storeProduct.create({
                data: {
                  storeId: supplyOrder.storeId!,
                  productId: product.productId,
                  userId: receivedById,
                  tenantId,
                  price: 0,
                  stock: product.quantity,
                  stockThreshold: 0,
                },
                select: { id: true },
              });

          await prisma.inventoryMovement.create({
            data: {
              type: 'INCOMING',
              quantity: product.quantity,
              description: 'Ingreso por recepción de orden de suministro',
              storeProductId: storeProduct.id,
              userId: receivedById,
            },
          });

          if (product.batches && product.batches.length > 0) {
            await prisma.productBatch.createMany({
              data: product.batches.map((batch) => ({
                storeProductId: storeProduct.id,
                quantity: batch.quantity,
                productionDate: batch.productionDate ?? null,
                expirationDate: batch.expirationDate ?? null,
                receivedAt,
              })),
            });
          }
        }
      }

      await prisma.supplyOrder.update({
        where: { id: supplyOrder.id },
        data: {
          status: allReceived ? SupplyOrderStatus.RECEIVED : SupplyOrderStatus.PARTIAL,
        },
        select: { id: true },
      });
    });

    return { success: true };
  }

  async approve(orderId: string, user?: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    const approverId = this.getAuthUserIdOrThrow(user);

    const supplyOrder = await this.prisma.supplyOrder.findFirst({
      where: { id: orderId, tenantId },
      select: { id: true, status: true },
    });

    if (!supplyOrder) {
      throw new NotFoundException('Orden de suministro no encontrada');
    }

    if (supplyOrder.status === SupplyOrderStatus.ANNULLATED) {
      throw new BadRequestException('La orden está anulada');
    }

    if (supplyOrder.status !== SupplyOrderStatus.ISSUED) {
      throw new BadRequestException('La orden ya fue aprobada o procesada');
    }

    await this.prisma.supplyOrder.update({
      where: { id: supplyOrder.id },
      data: {
        status: SupplyOrderStatus.PENDING,
      },
      select: { id: true },
    });

    return { success: true };
  }
}
