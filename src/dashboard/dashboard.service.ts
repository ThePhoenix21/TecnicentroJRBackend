import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, SaleStatus } from '@prisma/client';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(user: AuthUser) {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      salesAgg,
      clientsTotal,
      clientsNewThisMonth,
      storeProductsTotal,
      servicesTotal,
      recentOrders,
      topProductsGrouped,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          status: SaleStatus.COMPLETED,
          client: {
            tenantId,
          },
        },
        _sum: { totalAmount: true },
        _count: { _all: true },
        _avg: { totalAmount: true },
      }),
      this.prisma.client.count({
        where: {
          tenantId,
        },
      }),
      this.prisma.client.count({
        where: {
          tenantId,
          createdAt: {
            gte: startOfMonth,
            lte: now,
          },
        },
      }),
      this.prisma.storeProduct.count({
        where: {
          store: {
            tenantId,
          },
        },
      }),
      this.prisma.service.count({
        where: {
          order: {
            status: SaleStatus.COMPLETED,
            client: {
              tenantId,
            },
          },
        },
      }),
      this.prisma.order.findMany({
        where: {
          status: SaleStatus.COMPLETED,
          client: {
            tenantId,
          },
        },
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          status: true,
          createdAt: true,
          client: {
            select: {
              name: true,
            },
          },
          user: {
            select: {
              name: true,
            },
          },
          _count: {
            select: {
              orderProducts: true,
              services: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
      }),
      this.prisma.orderProduct.groupBy({
        by: ['productId'],
        where: {
          order: {
            status: SaleStatus.COMPLETED,
            client: {
              tenantId,
            },
          },
        },
        _sum: {
          quantity: true,
        },
        orderBy: {
          _sum: {
            quantity: 'desc',
          },
        },
        take: 5,
      }),
    ]);

    const servicesMostPopularRows = await this.prisma.$queryRaw<{ name: string }[]>(Prisma.sql`
      SELECT s.name
      FROM "Service" s
      JOIN "Order" o ON o.id = s."orderId"
      JOIN "Client" c ON c.id = o."clientId"
      WHERE o.status = 'COMPLETED'::"SaleStatus"
        AND c."tenantId" = ${tenantId}
      GROUP BY s.name
      ORDER BY COUNT(*) DESC
      LIMIT 1
    `);

    const mostPopularServiceName = servicesMostPopularRows?.[0]?.name || null;

    const lowStockRows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint as count
      FROM "StoreProduct" sp
      JOIN "Store" s ON s.id = sp."storeId"
      WHERE s."tenantId" = ${tenantId}
        AND sp.stock <= sp."stockThreshold"
    `);

    const storeProductsLowStock = Number(lowStockRows?.[0]?.count ?? 0);

    const salesTotal = Number(salesAgg._sum.totalAmount || 0);
    const salesCount = Number(salesAgg._count._all || 0);
    const salesAverage = Number(salesAgg._avg.totalAmount || 0);

    const topStoreProductIds = topProductsGrouped.map((g) => g.productId);

    const topStoreProducts = topStoreProductIds.length
      ? await this.prisma.storeProduct.findMany({
          where: {
            id: {
              in: topStoreProductIds,
            },
            store: {
              tenantId,
            },
          },
          select: {
            id: true,
            price: true,
            product: {
              select: {
                name: true,
                description: true,
              },
            },
          },
        })
      : [];

    const topProducts = topProductsGrouped.map((g) => {
      const sp = topStoreProducts.find((p) => p.id === g.productId);

      return {
        id: g.productId,
        name: sp?.product?.name || 'Producto',
        value: Number(g._sum.quantity || 0),
        price: Number(sp?.price || 0),
        description: sp?.product?.description || '',
      };
    });

    const recentSales = recentOrders.map((o) => ({
      id: o.id,
      type: 'sale',
      amount: o.totalAmount,
      status: o.status,
      description: `Venta #${o.orderNumber}`,
      customerName: o.client?.name || 'Cliente',
      userName: o.user?.name || 'Usuario',
      itemsCount: (o._count?.orderProducts || 0) + (o._count?.services || 0),
      createdAt: o.createdAt,
      orderNumber: o.orderNumber,
    }));

    return {
      salesSummary: {
        total: salesTotal,
        count: salesCount,
        average: salesAverage,
      },
      productsSummary: {
        total: storeProductsTotal,
        lowStock: storeProductsLowStock,
      },
      servicesSummary: {
        total: servicesTotal,
        mostPopular: mostPopularServiceName,
      },
      clientsSummary: {
        total: clientsTotal,
        newThisMonth: clientsNewThisMonth,
      },
      recentSales,
      topProducts,
    };
  }
}
