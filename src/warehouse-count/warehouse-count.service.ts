import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WarehouseAccessService } from '../warehouse-common/warehouse-access.service';
import { AddWarehouseCountItemDto } from './dto/add-warehouse-count-item.dto';
import { CreateWarehouseCountSessionDto } from './dto/create-warehouse-count-session.dto';
import { UpdateWarehouseCountItemDto } from './dto/update-warehouse-count-item.dto';

type AuthUser = {
  userId: string;
  role: string;
  tenantId?: string;
};

@Injectable()
export class WarehouseCountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly warehouseAccessService: WarehouseAccessService,
  ) {}

  private async assertSessionAccess(sessionId: string, warehouseId: string, user: AuthUser) {
    const tenantId = this.warehouseAccessService.getTenantIdOrThrow(user);
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);

    const session = await this.prisma.warehouseCountSession.findFirst({
      where: {
        id: sessionId,
        warehouseId,
        warehouse: { tenantId },
      },
    });

    if (!session) {
      throw new NotFoundException('Sesión de conteo de almacén no encontrada');
    }

    return session;
  }

  async createSession(user: AuthUser, warehouseId: string, dto: CreateWarehouseCountSessionDto) {
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);

    return this.prisma.warehouseCountSession.create({
      data: {
        name: dto.name,
        warehouseId,
        createdById: user.userId,
      },
    });
  }

  async listSessions(user: AuthUser, warehouseId: string) {
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);

    return this.prisma.warehouseCountSession.findMany({
      where: { warehouseId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
      },
    });
  }

  async addItem(user: AuthUser, warehouseId: string, sessionId: string, dto: AddWarehouseCountItemDto) {
    const session = await this.assertSessionAccess(sessionId, warehouseId, user);

    if (session.finalizedAt) {
      throw new BadRequestException('La sesión ya está finalizada');
    }

    const existing = await this.prisma.warehouseCountItem.findFirst({
      where: {
        sessionId,
        warehouseProductId: dto.warehouseProductId,
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('Este producto ya fue registrado en esta sesión');
    }

    const warehouseProduct = await this.prisma.warehouseProduct.findFirst({
      where: {
        id: dto.warehouseProductId,
        warehouseId: session.warehouseId,
      },
      select: { id: true, stock: true },
    });

    if (!warehouseProduct) {
      throw new NotFoundException('Producto de almacén no encontrado');
    }

    const expectedStock = warehouseProduct.stock;
    const difference = dto.physicalStock - expectedStock;

    return this.prisma.warehouseCountItem.create({
      data: {
        sessionId,
        warehouseProductId: dto.warehouseProductId,
        expectedStock,
        physicalStock: dto.physicalStock,
        difference,
      },
      include: {
        warehouseProduct: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async updateItem(user: AuthUser, warehouseId: string, itemId: string, dto: UpdateWarehouseCountItemDto) {
    const item = await this.prisma.warehouseCountItem.findUnique({
      where: { id: itemId },
      include: {
        session: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Item de conteo no encontrado');
    }

    await this.assertSessionAccess(item.sessionId, warehouseId, user);

    if (item.session.finalizedAt) {
      throw new BadRequestException('La sesión ya está finalizada');
    }

    const difference = dto.physicalStock - item.expectedStock;

    return this.prisma.warehouseCountItem.update({
      where: { id: itemId },
      data: {
        physicalStock: dto.physicalStock,
        difference,
      },
      include: {
        warehouseProduct: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async closeSession(user: AuthUser, warehouseId: string, sessionId: string) {
    const tenantId = this.warehouseAccessService.getTenantIdOrThrow(user);
    const session = await this.assertSessionAccess(sessionId, warehouseId, user);

    if (session.finalizedAt) {
      throw new BadRequestException('La sesión ya está cerrada');
    }

    const items = await this.prisma.warehouseCountItem.findMany({
      where: { sessionId },
      include: {
        warehouseProduct: true,
      },
    });

    const finalizedAt = new Date();

    await this.prisma.$transaction(async (prisma) => {
      for (const item of items) {
        if (item.difference === 0) continue;

        await prisma.warehouseProduct.update({
          where: { id: item.warehouseProductId },
          data: {
            stock: { increment: item.difference },
          },
        });

        await prisma.warehouseMovement.create({
          data: {
            warehouseId: session.warehouseId,
            warehouseProductId: item.warehouseProductId,
            userId: user.userId,
            tenantId,
            type: InventoryMovementType.ADJUST,
            quantity: item.difference,
            description: `Ajuste por conteo físico sesión ${session.name}`,
          },
        });
      }

      await prisma.warehouseCountSession.update({
        where: { id: sessionId },
        data: { finalizedAt },
      });
    });

    return this.getSessionReport(user, warehouseId, sessionId);
  }

  async getSessionReport(user: AuthUser, warehouseId: string, sessionId: string) {
    await this.assertSessionAccess(sessionId, warehouseId, user);

    const session = await this.prisma.warehouseCountSession.findUnique({
      where: { id: sessionId },
      include: {
        warehouse: {
          select: { id: true, name: true },
        },
        items: {
          include: {
            warehouseProduct: {
              include: {
                product: {
                  select: { id: true, name: true, description: true },
                },
              },
            },
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Sesión de conteo no encontrada');
    }

    const totalProducts = session.items.length;
    const correctCount = session.items.filter((i) => i.difference === 0).length;

    return {
      session: {
        id: session.id,
        name: session.name,
        createdAt: session.createdAt,
        finalizedAt: session.finalizedAt,
        warehouse: session.warehouse,
        createdBy: session.createdBy,
      },
      summary: {
        totalProducts,
        correctCount,
        discrepancies: totalProducts - correctCount,
      },
      items: session.items,
    };
  }
}
