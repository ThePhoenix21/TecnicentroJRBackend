import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { FilterInventoryMovementDto } from './dto/filter-inventory-movement.dto';
import { InventoryMovementSummaryDto } from './dto/inventory-movement-summary.dto';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { getPaginationParams, buildPaginatedResponse } from '../common/pagination/pagination.helper';
import { ListInventoryMovementsResponseDto } from './dto/list-inventory-movements-response.dto';

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

  async getMovementsSummary(query: InventoryMovementSummaryDto, user: AuthUser) {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const { fromDate, toDate, storeId } = query;

    await this.assertStoreAccess(storeId, user);

    const startDate = fromDate ? new Date(fromDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = toDate ? new Date(toDate) : new Date();

    const where: Prisma.InventoryMovementWhereInput = {
      storeProduct: {
        storeId,
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
      },
      user: {
        tenantId,
      },
    };

    where.date = {
      gte: startDate,
      lte: endDate,
    };

    const grouped = await this.prisma.inventoryMovement.groupBy({
      by: ['type'],
      where,
      _sum: {
        quantity: true,
      },
    });

    const incoming = Math.abs(grouped.find((g) => g.type === InventoryMovementType.INCOMING)?._sum.quantity ?? 0);
    const outgoing = Math.abs(grouped.find((g) => g.type === InventoryMovementType.OUTGOING)?._sum.quantity ?? 0);
    const sales = Math.abs(grouped.find((g) => g.type === InventoryMovementType.SALE)?._sum.quantity ?? 0);

    const adjustAgg = await this.prisma.inventoryMovement.aggregate({
      where: {
        ...where,
        type: InventoryMovementType.ADJUST,
      },
      _sum: {
        quantity: true,
      },
    });

    const adjustmentsNet = Number(adjustAgg._sum.quantity ?? 0);

    return {
      period: {
        from: startDate.toISOString(),
        to: endDate.toISOString(),
      },
      storeId: storeId ?? null,
      totals: {
        incoming,
        outgoing,
        sales,
        adjustmentsNet,
      },
    };
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
    const wouldGoNegative = stockChange < 0 && storeProduct.stock + stockChange < 0;
    if (wouldGoNegative && type !== InventoryMovementType.OUTGOING) {
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

  async findAll(filterDto: FilterInventoryMovementDto, user: AuthUser): Promise<ListInventoryMovementsResponseDto> {
    const { storeId, name, type, userId, userName, fromDate, toDate } = filterDto;

    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    await this.assertStoreAccess(storeId, user);
    
    const { page, pageSize, skip } = getPaginationParams({
      page: filterDto.page,
      pageSize: filterDto.pageSize,
      defaultPage: 1,
      defaultPageSize: 12,
      maxPageSize: 100,
    });

    const where: Prisma.InventoryMovementWhereInput = {};

    if (type) {
      where.type = type;
    }

    if (userId) {
      where.userId = userId;
    }

    where.storeProduct = {
      storeId,
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

    where.user = {
      tenantId,
    };

    if (name) {
      where.storeProduct.product = {
        name: { contains: name, mode: 'insensitive' },
      };
    }

    if (userName) {
      where.user = {
        ...where.user,
        name: { contains: userName, mode: 'insensitive' },
      };
    }

    if (fromDate || toDate) {
      where.date = {};
      if (fromDate) where.date.gte = new Date(fromDate);
      if (toDate) where.date.lte = new Date(toDate);
    }

    const [total, movements] = await Promise.all([
      this.prisma.inventoryMovement.count({ where }),
      this.prisma.inventoryMovement.findMany({
        where,
        include: {
          storeProduct: {
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
        orderBy: {
          date: 'desc',
        },
        skip,
        take: pageSize,
      }),
    ]);

    const items = movements.map((movement) => ({
      id: movement.id,
      date: movement.date,
      name: movement.storeProduct?.product?.name ?? 'Producto sin nombre',
      type: movement.type,
      quantity: movement.quantity,
      userName: movement.user?.name ?? null,
      description: movement.description ?? null,
    }));

    return buildPaginatedResponse(items, total, page, pageSize);
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

    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    return this.prisma.inventoryMovement.findMany({
      where: {
        storeProductId,
        storeProduct: {
          store: {
            tenantId,
          },
        },
        user: {
          tenantId,
        },
      },
      orderBy: { date: 'desc' },
      take: limit,
      include: {
        user: { select: { name: true } }
      }
    });
  }
}
