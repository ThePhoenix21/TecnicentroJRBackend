import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { FilterInventoryMovementDto } from './dto/filter-inventory-movement.dto';
import { InventoryMovementType, Prisma } from '@prisma/client';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
};

@Injectable()
export class InventoryMovementService {
  constructor(private prisma: PrismaService) {}

  private async assertStoreAccess(storeId: string, user: AuthUser) {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        tenantId: true,
      },
    });

    if (!store) {
      throw new NotFoundException('Tienda no encontrada');
    }

    if (!store.tenantId || store.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para acceder a esta tienda');
    }

    if (user.role !== 'ADMIN') {
      const storeUser = await this.prisma.storeUsers.findFirst({
        where: {
          storeId,
          userId: user.userId,
        },
        select: { id: true },
      });

      if (!storeUser) {
        throw new ForbiddenException('No tienes permisos para acceder a esta tienda');
      }
    }

    return store;
  }

  private async assertStoreProductAccess(storeProductId: string, user: AuthUser) {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const storeProduct = await this.prisma.storeProduct.findUnique({
      where: { id: storeProductId },
      include: {
        store: {
          select: {
            id: true,
            tenantId: true,
          },
        },
      },
    });

    if (!storeProduct) {
      throw new NotFoundException('Producto de tienda no encontrado');
    }

    if (!storeProduct.store?.tenantId || storeProduct.store.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para acceder a este producto de tienda');
    }

    if (user.role !== 'ADMIN') {
      const storeUser = await this.prisma.storeUsers.findFirst({
        where: {
          storeId: storeProduct.storeId,
          userId: user.userId,
        },
        select: { id: true },
      });

      if (!storeUser) {
        throw new ForbiddenException('No tienes permisos para acceder a este producto de tienda');
      }
    }

    return storeProduct;
  }

  async create(createDto: CreateInventoryMovementDto, user: AuthUser) {
    const { storeProductId, type, quantity, description } = createDto;

    // 1. Validar StoreProduct
    const storeProduct = await this.assertStoreProductAccess(storeProductId, user);

    // 2. Determinar el cambio de stock
    // Ahora quantity puede ser positivo o negativo directamente
    // El tipo solo sirve para categorización histórica
    let stockChange = quantity;
    
    // Validación especial para OUTGOING: si quantity es positivo, lo tratamos como resta
    if (type === InventoryMovementType.OUTGOING || type === InventoryMovementType.SALE) {
      stockChange = -Math.abs(quantity); // Asegurar que sea negativo
    }
    // Para INCOMING, RETURN, ADJUST: usamos el quantity tal como viene (puede ser + o -)

    // Validar stock suficiente para salidas
    if (stockChange < 0 && (storeProduct.stock + stockChange < 0)) {
      throw new BadRequestException('Stock insuficiente para realizar esta salida');
    }

    return this.prisma.$transaction(async (prisma) => {
      // Crear movimiento
      const movement = await prisma.inventoryMovement.create({
        data: {
          storeProductId,
          type,
          quantity: stockChange, // Guardamos con signo
          description,
          userId: user.userId,
        },
      });

      // Actualizar stock
      await prisma.storeProduct.update({
        where: { id: storeProductId },
        data: {
          stock: { increment: stockChange },
        },
      });

      return movement;
    });
  }

  async findAll(filterDto: FilterInventoryMovementDto, user: AuthUser) {
    const { storeId, storeProductId, startDate, endDate } = filterDto;

    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    if (storeId) {
      await this.assertStoreAccess(storeId, user);
    }
    
    const where: Prisma.InventoryMovementWhereInput = {};

    if (storeProductId) {
      where.storeProductId = storeProductId;
    }

    where.storeProduct = {
      ...(storeId ? { storeId } : {}),
      store: {
        tenantId,
        ...(user.role !== 'ADMIN'
          ? {
              storeUsers: {
                some: {
                  userId: user.userId,
                },
              },
            }
          : {}),
      },
    };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    return this.prisma.inventoryMovement.findMany({
      where,
      include: {
        storeProduct: {
          include: {
            product: true,
            store: true
          }
        },
        user: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });
  }

  async getDashboardStats(storeId: string | undefined, user: AuthUser) {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    if (storeId) {
      await this.assertStoreAccess(storeId, user);
    }

    // Definir filtros de fecha (mes actual)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const whereStore = storeId ? { storeId } : {};

    // 1. Total entradas y salidas del mes
    const movements = await this.prisma.inventoryMovement.groupBy({
      by: ['type'],
      where: {
        date: {
          gte: startOfMonth,
          lte: endOfMonth
        },
        storeProduct: {
          ...(storeId ? { storeId } : {}),
          store: {
            tenantId,
            ...(user.role !== 'ADMIN'
              ? {
                  storeUsers: {
                    some: {
                      userId: user.userId,
                    },
                  },
                }
              : {}),
          },
        }
      },
      _sum: {
        quantity: true
      }
    });

    // 2. Productos con stock crítico
    const criticalStockProducts = await this.prisma.storeProduct.findMany({
      where: {
        ...whereStore,
        store: {
          tenantId,
          ...(user.role !== 'ADMIN'
            ? {
                storeUsers: {
                  some: {
                    userId: user.userId,
                  },
                },
              }
            : {}),
        },
        stock: {
          lte: this.prisma.storeProduct.fields.stockThreshold // Comparar con columna stockThreshold
          // Nota: Prisma no soporta comparación directa entre columnas en where clause standard fácilmente
          // Se requiere raw query o filtrar en memoria si son pocos, o usar extensión.
          // Para simplificar y evitar raw query complejo ahora:
          // Filtramos donde stock <= 5 (valor por defecto seguro) O traer todos y filtrar JS.
        }
      },
      include: {
        product: true,
        store: true
      }
    });
    
    // Filtrado JS preciso para stock <= threshold
    const trueCriticalProducts = criticalStockProducts.filter(sp => sp.stock <= sp.stockThreshold);

    // Formatear stats
    const stats = {
      incoming: 0,
      outgoing: 0,
      sales: 0,
      adjustments: 0
    };

    movements.forEach(m => {
      const qty = Math.abs(m._sum.quantity || 0);
      if (m.type === 'INCOMING') stats.incoming = qty;
      if (m.type === 'OUTGOING') stats.outgoing = qty;
      if (m.type === 'SALE') stats.sales = qty;
      if (m.type === 'ADJUST') stats.adjustments = qty;
    });

    return {
      period: { start: startOfMonth, end: endOfMonth },
      stats,
      criticalProducts: trueCriticalProducts.map(p => ({
        id: p.id,
        name: p.product.name,
        store: p.store.name,
        stock: p.stock,
        threshold: p.stockThreshold,
        status: 'CRITICAL'
      }))
    };
  }

  async getProductMovements(storeProductId: string, user: AuthUser, limit: number = 5) {
    await this.assertStoreProductAccess(storeProductId, user);

    return this.prisma.inventoryMovement.findMany({
      where: { storeProductId },
      orderBy: { date: 'desc' },
      take: limit,
      include: {
        user: { select: { name: true } }
      }
    });
  }
}
