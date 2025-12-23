import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MovementType, PaymentType, TenantFeature } from '@prisma/client';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
  tenantFeatures?: TenantFeature[];
};

type DateRange = { from: Date; to: Date };

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertValidTimeZone(timeZone: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    } catch {
      throw new BadRequestException('timeZone inválido (debe ser IANA, ej: America/Lima)');
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
    // Aproximación robusta: partimos de un Date UTC y corregimos con la diferencia entre
    // lo que ese instante representa en la TZ y lo que queremos representar.
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
          throw new BadRequestException('Formato de fecha inválido. Use YYYY-MM-DD');
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
        throw new BadRequestException('El parámetro from no puede ser mayor que to');
      }

      return { from, to: inclusiveTo };
    }

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

  async getNetProfit(user: AuthUser, from: string, to: string, timeZone?: string) {
    const tenantId = user?.tenantId;
    const range = this.normalizeRange(from, to, timeZone);

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

  async getIncome(user: AuthUser, from: string, to: string, timeZone?: string) {
    const tenantId = user?.tenantId;
    const range = this.normalizeRange(from, to, timeZone);

    const features = await this.getTenantFeaturesOrThrow(user);
    this.assertFeature(features, TenantFeature.CASH);

    const jwtFeatures = user?.tenantFeatures || [];
    const includeNamedServices = jwtFeatures.includes(TenantFeature.NAMEDSERVICES);

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
          ? {
              select: includeNamedServices
                ? { id: true, price: true, status: true, name: true, description: true }
                : { id: true, price: true, status: true, name: true },
            }
          : false,
        orderProducts: hasProducts
          ? { select: { id: true, quantity: true, price: true } }
          : false,
      },
    });

    let incomeServices = 0;
    let incomeProducts = 0;

    const servicesByUser = new Map<string, { count: number; total: number }>();
    const servicesByName = new Map<string, { count: number; total: number; name: string }>();
    const serviceDescriptionsByName = new Map<string, Map<string, { count: number }>>();
    const totalUsersServicesRaw: Array<{
      userId: string;
      name: string;
      description: string;
      amount: number;
    }> = [];
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

        for (const s of services) {
          const rawName = (s?.name ?? '').toString();
          const normalizedName = rawName.trim().toLowerCase();
          if (!normalizedName) continue;

          const currentService = servicesByName.get(normalizedName) || {
            count: 0,
            total: 0,
            name: normalizedName,
          };

          servicesByName.set(normalizedName, {
            count: currentService.count + 1,
            total: currentService.total + (s?.price || 0),
            name: normalizedName,
          });

          if (includeNamedServices) {
            const rawDescription = (s?.description ?? '').toString();
            const normalizedDescription = rawDescription.trim();
            const descMap = serviceDescriptionsByName.get(normalizedName) ||
              new Map<string, { count: number }>();

            const currentDesc = descMap.get(normalizedDescription) || { count: 0 };
            descMap.set(normalizedDescription, { count: currentDesc.count + 1 });
            serviceDescriptionsByName.set(normalizedName, descMap);

            totalUsersServicesRaw.push({
              userId: o.userId,
              name: rawName.trim(),
              description: normalizedDescription,
              amount: s?.price || 0,
            });
          }
        }
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
      ? Array.from(servicesByName.values())
          .map((s) => {
            let description = '';

            if (includeNamedServices) {
              const descMap = serviceDescriptionsByName.get(s.name);
              if (descMap && descMap.size) {
                description = Array.from(descMap.entries())
                  .sort((a, b) => b[1].count - a[1].count)[0]?.[0] ?? '';
              }
            }

            return {
              Name: s.name,
              ...(includeNamedServices ? { Description: description } : {}),
              servicesCount: s.count,
              totalAmount: s.total,
            };
          })
          .sort((a, b) => b.totalAmount - a.totalAmount)
      : [];

    const totalUsersServices = includeNamedServices
      ? totalUsersServicesRaw
          .map((s) => ({
            userId: s.userId,
            userName: usersById.get(s.userId)?.name || 'Usuario',
            Name: s.name,
            Description: s.description,
            Amount: s.amount,
          }))
          .sort((a, b) => b.Amount - a.Amount)
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
        ...(includeNamedServices ? { TotalUsersServices: totalUsersServices } : { topUsersServices }),
        topUsersProducts,
      },
      meta: {
        hasProducts,
        hasServices,
      },
    };
  }

  async getExpenses(user: AuthUser, from: string, to: string, timeZone?: string) {
    const tenantId = user?.tenantId;
    const range = this.normalizeRange(from, to, timeZone);

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
