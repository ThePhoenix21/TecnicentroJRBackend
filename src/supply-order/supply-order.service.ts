import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplyOrderDto } from './dto/create-supply-order.dto';
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
          status: SupplyOrderStatus.PENDING,
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
}
