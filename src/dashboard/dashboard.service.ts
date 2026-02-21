import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
};

type DateRange = { from: Date; to: Date };

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  private toNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value) || 0;
    return Number(value.toNumber?.() ?? 0);
  }

  private assertValidTimeZone(timeZone: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    } catch {
      throw new BadRequestException('timeZone invalido (debe ser IANA, ej: America/Lima)');
    }
  }

  private getPartsInTimeZone(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);

    const map = new Map(parts.map((p) => [p.type, p.value] as const));

    return {
      year: Number(map.get('year')),
      month: Number(map.get('month')),
      day: Number(map.get('day')),
      hour: Number(map.get('hour')),
      minute: Number(map.get('minute')),
      second: Number(map.get('second')),
    };
  }

  private zonedDateTimeToUtc(
    input: { year: number; month: number; day: number; hour: number; minute: number; second: number; ms: number },
    timeZone: string,
  ) {
    let guess = new Date(
      Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second, input.ms),
    );

    for (let i = 0; i < 2; i++) {
      const actual = this.getPartsInTimeZone(guess, timeZone);
      const desiredAsUtcMs = Date.UTC(
        input.year,
        input.month - 1,
        input.day,
        input.hour,
        input.minute,
        input.second,
        input.ms,
      );
      const actualAsUtcMs = Date.UTC(
        actual.year,
        actual.month - 1,
        actual.day,
        actual.hour,
        actual.minute,
        actual.second,
        0,
      );

      const diffMs = desiredAsUtcMs - actualAsUtcMs;
      if (diffMs === 0) break;
      guess = new Date(guess.getTime() + diffMs);
    }

    return guess;
  }

  private normalizeRange(fromRaw: string, toRaw: string, timeZone?: string): DateRange {
    if (timeZone) {
      this.assertValidTimeZone(timeZone);

      const parseDateOnly = (raw: string) => {
        const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(raw.trim());
        if (!m) {
          throw new BadRequestException('Formato de fecha invalido. Use YYYY-MM-DD');
        }
        return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
      };

      const fromDate = parseDateOnly(fromRaw);
      const toDate = parseDateOnly(toRaw);

      const from = this.zonedDateTimeToUtc(
        {
          ...fromDate,
          hour: 0,
          minute: 0,
          second: 0,
          ms: 0,
        },
        timeZone,
      );

      const inclusiveTo = this.zonedDateTimeToUtc(
        {
          ...toDate,
          hour: 23,
          minute: 59,
          second: 59,
          ms: 999,
        },
        timeZone,
      );

      if (from.getTime() > inclusiveTo.getTime()) {
        throw new BadRequestException('El parametro from no puede ser mayor que to');
      }

      return { from, to: inclusiveTo };
    }

    const from = new Date(fromRaw);
    const to = new Date(toRaw);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Rango de fechas invalido');
    }

    const inclusiveTo = new Date(to);
    inclusiveTo.setUTCHours(23, 59, 59, 999);

    if (from.getTime() > inclusiveTo.getTime()) {
      throw new BadRequestException('El parametro from no puede ser mayor que to');
    }

    return { from, to: inclusiveTo };
  }

  private normalizeOptionalRange(from?: string, to?: string, timeZone?: string): DateRange | null {
    if (!from && !to) return null;
    if (!from || !to) {
      throw new BadRequestException('Para filtrar por rango debe enviar from y to');
    }
    return this.normalizeRange(from, to, timeZone);
  }

  private normalizeCompareRange(compareFrom?: string, compareTo?: string, timeZone?: string): DateRange | null {
    if (!compareFrom && !compareTo) return null;
    if (!compareFrom || !compareTo) {
      throw new BadRequestException('Para comparar periodos debe enviar compareFrom y compareTo');
    }
    return this.normalizeRange(compareFrom, compareTo, timeZone);
  }

  private async assertStoreBelongsToTenant(tenantId: string, storeId?: string) {
    if (!storeId) return;

    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId },
      select: { id: true },
    });

    if (!store) {
      throw new ForbiddenException('La tienda no pertenece al tenant autenticado');
    }
  }

  private getDateKey(date: Date, timeZone?: string): string {
    if (timeZone) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(date);
      const map = new Map(parts.map((p) => [p.type, p.value] as const));
      return `${map.get('year')}-${map.get('month')}-${map.get('day')}`;
    }

    const y = date.getUTCFullYear();
    const m = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const d = `${date.getUTCDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private buildOrderWhere(tenantId: string, storeId?: string, range?: DateRange) {
    return {
      status: SaleStatus.COMPLETED,
      client: {
        tenantId,
      },
      ...(storeId
        ? {
            cashSession: {
              Store: {
                id: storeId,
                tenantId,
              },
            },
          }
        : {}),
      ...(range
        ? {
            createdAt: {
              gte: range.from,
              lte: range.to,
            },
          }
        : {}),
    };
  }

  private safePercentChange(current: number, previous: number): number | null {
    if (previous === 0) return null;
    return Number((((current - previous) / previous) * 100).toFixed(2));
  }

  async getSalesBootstrap(user: AuthUser, storeId?: string) {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    await this.assertStoreBelongsToTenant(tenantId, storeId);

    const orderWhere = this.buildOrderWhere(tenantId, storeId);

    const salesAgg = await this.prisma.order.aggregate({
      where: orderWhere,
      _sum: { totalAmount: true },
      _count: { _all: true },
      _avg: { totalAmount: true },
    });

    const recentOrders = await this.prisma.order.findMany({
      where: orderWhere,
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
      take: 15,
    });

    const salesTotal = Number(salesAgg._sum.totalAmount || 0);
    const salesCount = Number(salesAgg._count._all || 0);
    const salesAverage = Number(salesAgg._avg.totalAmount || 0);

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
      recentSales,
    };
  }

  private async computeSummaryData(
    tenantId: string,
    storeId?: string,
    range?: DateRange,
    timeZone?: string,
  ) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const orderWhere = this.buildOrderWhere(tenantId, storeId, range);

    const [
      salesAgg,
      clientsTotal,
      clientsNewThisMonth,
      storeProductsTotal,
      servicesTotal,
      recentOrders,
      topProductsGrouped,
      trendOrders,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: orderWhere,
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
            ...(storeId ? { id: storeId } : {}),
          },
        },
      }),
      this.prisma.service.count({
        where: {
          order: orderWhere,
        },
      }),
      this.prisma.order.findMany({
        where: orderWhere,
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
          order: orderWhere,
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
      this.prisma.order.findMany({
        where: {
          ...orderWhere,
          ...(range
            ? {}
            : {
                createdAt: {
                  gte: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30),
                  lte: now,
                },
              }),
        },
        select: {
          createdAt: true,
          totalAmount: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      }),
    ]);

    const servicesMostPopularRows = await this.prisma.service.groupBy({
      by: ['name'],
      where: {
        order: orderWhere,
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          name: 'desc',
        },
      },
      take: 1,
    });

    const mostPopularServiceName = servicesMostPopularRows?.[0]?.name || null;

    const lowStockRows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint as count
      FROM "StoreProduct" sp
      JOIN "Store" s ON s.id = sp."storeId"
      WHERE s."tenantId" = ${tenantId}
        ${storeId ? Prisma.sql`AND s.id = ${storeId}` : Prisma.empty}
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
              ...(storeId ? { id: storeId } : {}),
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

    const trendMap = new Map<string, { date: string; total: number; count: number }>();
    for (const row of trendOrders) {
      const key = this.getDateKey(row.createdAt, timeZone);
      const current = trendMap.get(key) || { date: key, total: 0, count: 0 };
      current.total += this.toNumber(row.totalAmount);
      current.count += 1;
      trendMap.set(key, current);
    }
    const salesTrend = Array.from(trendMap.values()).sort((a, b) => (a.date < b.date ? -1 : 1));

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
      charts: {
        salesTrend,
        topProducts,
      },
    };
  }

  async getSummary(
    user: AuthUser,
    from?: string,
    to?: string,
    timeZone?: string,
    storeId?: string,
    compareFrom?: string,
    compareTo?: string,
  ) {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    await this.assertStoreBelongsToTenant(tenantId, storeId);

    const range = this.normalizeOptionalRange(from, to, timeZone);
    const compareRange = this.normalizeCompareRange(compareFrom, compareTo, timeZone);

    const summary = await this.computeSummaryData(tenantId, storeId, range || undefined, timeZone);

    const comparison = compareRange
      ? await this.computeSummaryData(tenantId, storeId, compareRange, timeZone)
      : null;

    return {
      ...summary,
      kpis: {
        salesTotal: summary.salesSummary.total,
        salesCount: summary.salesSummary.count,
        salesAverage: summary.salesSummary.average,
        clientsTotal: summary.clientsSummary.total,
        newClientsThisMonth: summary.clientsSummary.newThisMonth,
        productsLowStock: summary.productsSummary.lowStock,
      },
      ...(comparison
        ? {
            comparison: {
              current: summary.salesSummary,
              previous: comparison.salesSummary,
              delta: {
                total: summary.salesSummary.total - comparison.salesSummary.total,
                count: summary.salesSummary.count - comparison.salesSummary.count,
                average: summary.salesSummary.average - comparison.salesSummary.average,
              },
              deltaPct: {
                total: this.safePercentChange(summary.salesSummary.total, comparison.salesSummary.total),
                count: this.safePercentChange(summary.salesSummary.count, comparison.salesSummary.count),
                average: this.safePercentChange(summary.salesSummary.average, comparison.salesSummary.average),
              },
            },
          }
        : {}),
      filters: {
        from: from || null,
        to: to || null,
        compareFrom: compareFrom || null,
        compareTo: compareTo || null,
        timeZone: timeZone || null,
        storeId: storeId || null,
      },
    };
  }

  async getCharts(user: AuthUser, from: string, to: string, timeZone?: string, storeId?: string) {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    await this.assertStoreBelongsToTenant(tenantId, storeId);

    const range = this.normalizeRange(from, to, timeZone);
    const orderWhere = this.buildOrderWhere(tenantId, storeId, range);

    const [incomeTimeSeries, paymentMethodsSummary, topProductsGrouped] = await Promise.all([
      this.analyticsService.getIncomeTimeSeries(user, from, to, timeZone, storeId),
      this.analyticsService.getPaymentMethodsSummary(user, from, to, timeZone, storeId),
      this.prisma.orderProduct.groupBy({
        by: ['productId'],
        where: {
          order: orderWhere,
        },
        _sum: {
          quantity: true,
        },
        orderBy: {
          _sum: {
            quantity: 'desc',
          },
        },
        take: 10,
      }),
    ]);

    const topProductIds = topProductsGrouped.map((x) => x.productId);
    const topProductsMeta = topProductIds.length
      ? await this.prisma.storeProduct.findMany({
          where: {
            id: { in: topProductIds },
            store: {
              tenantId,
              ...(storeId ? { id: storeId } : {}),
            },
          },
          select: {
            id: true,
            product: {
              select: {
                name: true,
              },
            },
          },
        })
      : [];

    const topProducts = topProductsGrouped.map((g) => ({
      productId: g.productId,
      name: topProductsMeta.find((m) => m.id === g.productId)?.product?.name || 'Producto',
      quantity: Number(g._sum.quantity || 0),
    }));

    return {
      range: {
        from,
        to,
        timeZone: timeZone || null,
        storeId: storeId || null,
      },
      charts: {
        salesTrend: {
          type: 'line',
          xKey: 'date',
          yKeys: ['total', 'count'],
          series: incomeTimeSeries.series.map((s) => ({
            date: s.date,
            total: s.totalIncome,
            count: s.ordersCount,
          })),
        },
        paymentMethods: {
          type: 'pie',
          series: paymentMethodsSummary.chart.series.map((s) => ({
            type: s.label,
            total: s.value,
            count: s.count,
          })),
        },
        topProducts: {
          type: 'bar',
          xKey: 'name',
          yKeys: ['quantity'],
          series: topProducts,
        },
      },
    };
  }
}
