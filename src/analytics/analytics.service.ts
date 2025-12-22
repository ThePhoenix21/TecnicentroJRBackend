import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MovementType, PaymentType, TenantFeature } from '@prisma/client';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
};

type DateRange = { from: Date; to: Date };

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeRange(fromRaw: string, toRaw: string): DateRange {
    const from = new Date(fromRaw);
    const to = new Date(toRaw);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Rango de fechas inválido');
    }

    // Si viene solo fecha (YYYY-MM-DD), Date() lo interpreta como UTC midnight.
    // Para hacerlo inclusivo, llevamos "to" al final del día.
    const inclusiveTo = new Date(to);
    inclusiveTo.setUTCHours(23, 59, 59, 999);

    if (from.getTime() > inclusiveTo.getTime()) {
      throw new BadRequestException('El parámetro from no puede ser mayor que to');
    }

    return { from, to: inclusiveTo };
  }

  private async getTenantFeaturesOrThrow(user: AuthUser): Promise<TenantFeature[]> {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true, features: true },
    });

    if (!tenant) {
      throw new ForbiddenException('Tenant no encontrado');
    }

    return tenant.features || [];
  }

  private assertFeature(features: TenantFeature[], required: TenantFeature) {
    if (!features.includes(required)) {
      throw new ForbiddenException(`Funcionalidad no habilitada para este tenant: ${required}`);
    }
  }

  async getNetProfit(user: AuthUser, from: string, to: string) {
    const tenantId = user?.tenantId;
    const range = this.normalizeRange(from, to);

    const features = await this.getTenantFeaturesOrThrow(user);
    this.assertFeature(features, TenantFeature.CASH);

    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const [incomePaymentMethods, expenseCashMovements] = await Promise.all([
      this.prisma.paymentMethod.findMany({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          order: {
            cashSession: {
              Store: {
                tenantId,
              },
            },
          },
        },
        select: {
          id: true,
          type: true,
          amount: true,
          createdAt: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.cashMovement.findMany({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          type: MovementType.EXPENSE,
          CashSession: {
            Store: {
              tenantId,
            },
          },
        },
        select: {
          id: true,
          amount: true,
          payment: true,
          description: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const totalIncome = incomePaymentMethods.reduce((sum, p) => sum + p.amount, 0);
    const totalExpenses = expenseCashMovements.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = totalIncome - totalExpenses;

    const timeline = [
      ...incomePaymentMethods.map((p) => ({
        date: p.createdAt,
        type: MovementType.INCOME,
        concept: `Orden ${p.order?.orderNumber || ''} - Pago ${p.type}`.trim(),
        amount: p.amount,
        source: 'PAYMENT_METHOD' as const,
        sourceId: p.id,
      })),
      ...expenseCashMovements.map((e) => ({
        date: e.createdAt,
        type: MovementType.EXPENSE,
        concept: e.description || 'Egreso',
        amount: e.amount,
        source: 'CASH_MOVEMENT' as const,
        sourceId: e.id,
        paymentMethod: e.payment ?? PaymentType.EFECTIVO,
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      totals: {
        totalIncome,
        totalExpenses,
        netProfit,
      },
      timeline: timeline.map((t) => ({
        date: t.date,
        type: t.type,
        concept: t.concept,
        amount: t.amount,
        source: t.source,
        sourceId: t.sourceId,
        ...(t.source === 'CASH_MOVEMENT' ? { paymentMethod: (t as any).paymentMethod } : {}),
      })),
    };
  }

  async getIncome(user: AuthUser, from: string, to: string) {
    const tenantId = user?.tenantId;
    const range = this.normalizeRange(from, to);

    const features = await this.getTenantFeaturesOrThrow(user);
    this.assertFeature(features, TenantFeature.CASH);

    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const hasProducts = features.includes(TenantFeature.PRODUCTS);
    const hasServices = features.includes(TenantFeature.SERVICES);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        cashSession: {
          Store: {
            tenantId,
          },
        },
      },
      select: {
        id: true,
        createdAt: true,
        userId: true,
        services: hasServices
          ? { select: { id: true, price: true, status: true } }
          : false,
        orderProducts: hasProducts
          ? { select: { id: true, quantity: true, price: true } }
          : false,
      },
    });

    let incomeServices = 0;
    let incomeProducts = 0;

    const servicesByUser = new Map<string, { count: number; total: number }>();
    const productsByUser = new Map<string, { items: number; total: number }>();

    for (const o of orders) {
      if (hasServices) {
        const services = (o.services as any[]) || [];
        const servicesTotal = services.reduce((sum, s) => sum + (s.price || 0), 0);
        incomeServices += servicesTotal;

        const current = servicesByUser.get(o.userId) || { count: 0, total: 0 };
        servicesByUser.set(o.userId, {
          count: current.count + services.length,
          total: current.total + servicesTotal,
        });
      }

      if (hasProducts) {
        const ops = (o.orderProducts as any[]) || [];
        const productTotal = ops.reduce((sum, op) => sum + (op.price || 0) * (op.quantity || 0), 0);
        const items = ops.reduce((sum, op) => sum + (op.quantity || 0), 0);
        incomeProducts += productTotal;

        const current = productsByUser.get(o.userId) || { items: 0, total: 0 };
        productsByUser.set(o.userId, {
          items: current.items + items,
          total: current.total + productTotal,
        });
      }
    }

    const userIds = Array.from(
      new Set([
        ...Array.from(servicesByUser.keys()),
        ...Array.from(productsByUser.keys()),
      ]),
    );

    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];

    const usersById = new Map(users.map((u) => [u.id, u] as const));

    const topUsersServices = hasServices
      ? Array.from(servicesByUser.entries())
          .map(([userId, data]) => ({
            userId,
            userName: usersById.get(userId)?.name || 'Usuario',
            userEmail: usersById.get(userId)?.email || '',
            servicesCount: data.count,
            totalAmount: data.total,
          }))
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, 10)
      : [];

    const topUsersProducts = hasProducts
      ? Array.from(productsByUser.entries())
          .map(([userId, data]) => ({
            userId,
            userName: usersById.get(userId)?.name || 'Usuario',
            userEmail: usersById.get(userId)?.email || '',
            itemsSold: data.items,
            totalAmount: data.total,
          }))
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, 10)
      : [];

    return {
      summary: {
        incomeProducts: hasProducts ? incomeProducts : 0,
        incomeServices: hasServices ? incomeServices : 0,
        totalIncome: (hasProducts ? incomeProducts : 0) + (hasServices ? incomeServices : 0),
      },
      rankings: {
        topUsersServices,
        topUsersProducts,
      },
      meta: {
        hasProducts,
        hasServices,
      },
    };
  }

  async getExpenses(user: AuthUser, from: string, to: string) {
    const tenantId = user?.tenantId;
    const range = this.normalizeRange(from, to);

    const features = await this.getTenantFeaturesOrThrow(user);
    this.assertFeature(features, TenantFeature.CASH);

    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const expenses = await this.prisma.cashMovement.findMany({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        type: MovementType.EXPENSE,
        CashSession: {
          Store: {
            tenantId,
          },
        },
      },
      include: {
        User: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    return {
      totals: {
        totalExpenses,
      },
      expenses: expenses.map((e) => ({
        date: e.createdAt,
        user: {
          id: e.User?.id,
          name: e.User?.name,
          email: e.User?.email,
        },
        description: e.description || 'Egreso',
        amount: e.amount,
        expenseType: e.payment ?? PaymentType.EFECTIVO,
        source: 'CASH_MOVEMENT',
        sourceId: e.id,
      })),
    };
  }
}
