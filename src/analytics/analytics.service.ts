import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { MovementType, PaymentType, TenantFeature } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
  tenantFeatures?: TenantFeature[];
};

type DateRange = { from: Date; to: Date };

type AnalyticsContext = {
  tenantId: string;
  features: TenantFeature[];
  range: DateRange;
  storeId?: string;
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (!fromRaw || !toRaw) {
      throw new BadRequestException('Los parametros from y to son obligatorios');
    }

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

  private normalizeCompareRange(compareFrom?: string, compareTo?: string, timeZone?: string): DateRange | null {
    if (!compareFrom && !compareTo) return null;
    if (!compareFrom || !compareTo) {
      throw new BadRequestException('Para comparar periodos debe enviar compareFrom y compareTo');
    }
    return this.normalizeRange(compareFrom, compareTo, timeZone);
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

  private async resolveContext(
    user: AuthUser,
    from: string,
    to: string,
    timeZone?: string,
    storeId?: string,
    requiredFeature: TenantFeature = TenantFeature.CASH,
  ): Promise<AnalyticsContext> {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const features = await this.getTenantFeaturesOrThrow(user);
    this.assertFeature(features, requiredFeature);

    await this.assertStoreBelongsToTenant(tenantId, storeId);

    return {
      tenantId,
      features,
      storeId,
      range: this.normalizeRange(from, to, timeZone),
    };
  }

  private buildStoreFilter(tenantId: string, storeId?: string) {
    return storeId ? { id: storeId, tenantId } : { tenantId };
  }

  private safePercentChange(current: number, previous: number): number | null {
    if (previous === 0) return null;
    return Number((((current - previous) / previous) * 100).toFixed(2));
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

  private async computePaymentMethodsSummaryForRange(
    tenantId: string,
    range: DateRange,
    storeId?: string,
  ) {
    const payments = await this.prisma.paymentMethod.findMany({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        order: {
          cashSession: {
            Store: this.buildStoreFilter(tenantId, storeId),
          },
        },
      },
      select: {
        type: true,
        amount: true,
      },
    });

    const byType = new Map<string, { type: string; totalAmount: number; count: number }>();
    let totalAmount = 0;
    let totalCount = 0;

    for (const p of payments) {
      const key = p.type;
      const current = byType.get(key) || { type: key, totalAmount: 0, count: 0 };
      const amount = this.toNumber(p.amount || 0);

      current.totalAmount += amount;
      current.count += 1;
      byType.set(key, current);

      totalAmount += amount;
      totalCount += 1;
    }

    const methods = Array.from(byType.values()).sort((a, b) => b.totalAmount - a.totalAmount);

    return {
      summary: {
        totalAmount,
        totalCount,
        methodsCount: methods.length,
      },
      methods,
    };
  }

  async getPaymentMethodsSummary(
    user: AuthUser,
    from: string,
    to: string,
    timeZone?: string,
    storeId?: string,
  ) {
    const context = await this.resolveContext(user, from, to, timeZone, storeId, TenantFeature.CASH);
    const result = await this.computePaymentMethodsSummaryForRange(
      context.tenantId,
      context.range,
      context.storeId,
    );

    return {
      ...result,
      chart: {
        type: 'pie',
        series: result.methods.map((m) => ({ label: m.type, value: m.totalAmount, count: m.count })),
      },
    };
  }

  private async computeNetProfitForRange(tenantId: string, range: DateRange, storeId?: string) {
    const [incomePaymentMethods, cashMovements] = await Promise.all([
      this.prisma.paymentMethod.findMany({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          order: {
            cashSession: {
              Store: this.buildStoreFilter(tenantId, storeId),
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
          OR: [
            { type: MovementType.EXPENSE }, // Incluir TODOS los egresos (incluyendo extornos por anulación)
            { 
              type: MovementType.INCOME,
              relatedOrderId: null // Solo ingresos manuales (excluir duplicados de pagos de órdenes)
            }
          ],
          CashSession: {
            Store: this.buildStoreFilter(tenantId, storeId),
          },
        },
        select: {
          id: true,
          type: true,
          amount: true,
          payment: true,
          description: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Separate cash movements by type
    const incomeCashMovements = cashMovements.filter(cm => cm.type === MovementType.INCOME);
    const expenseCashMovements = cashMovements.filter(cm => cm.type === MovementType.EXPENSE);

    const totalIncome = incomePaymentMethods.reduce((sum, p) => sum + this.toNumber(p.amount), 0) +
                       incomeCashMovements.reduce((sum, cm) => sum + this.toNumber(cm.amount), 0);
    const totalExpenses = expenseCashMovements.reduce((sum, e) => sum + this.toNumber(e.amount), 0);
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
      ...incomeCashMovements.map((cm) => ({
        date: cm.createdAt,
        type: MovementType.INCOME,
        concept: cm.description || 'Ingreso manual',
        amount: cm.amount,
        source: 'CASH_MOVEMENT' as const,
        sourceId: cm.id,
        paymentMethod: cm.payment ?? PaymentType.EFECTIVO,
      })),
      ...expenseCashMovements.map((cm) => ({
        date: cm.createdAt,
        type: MovementType.EXPENSE,
        concept: cm.description || 'Egreso',
        amount: cm.amount,
        source: 'CASH_MOVEMENT' as const,
        sourceId: cm.id,
        paymentMethod: cm.payment ?? PaymentType.EFECTIVO,
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      totals: {
        totalIncome,
        totalExpenses,
        netProfit,
      },
      timeline,
    };
  }

  async getNetProfit(
    user: AuthUser,
    from: string,
    to: string,
    timeZone?: string,
    storeId?: string,
    compareFrom?: string,
    compareTo?: string,
  ) {
    const context = await this.resolveContext(user, from, to, timeZone, storeId, TenantFeature.CASH);
    const comparisonRange = this.normalizeCompareRange(compareFrom, compareTo, timeZone);

    const current = await this.computeNetProfitForRange(context.tenantId, context.range, context.storeId);

    const comparison = comparisonRange
      ? await this.computeNetProfitForRange(context.tenantId, comparisonRange, context.storeId)
      : null;

    return {
      totals: current.totals,
      timeline: current.timeline.map((t) => ({
        date: t.date,
        type: t.type,
        concept: t.concept,
        amount: t.amount,
        source: t.source,
        sourceId: t.sourceId,
        ...(t.source === 'CASH_MOVEMENT' ? { paymentMethod: (t as any).paymentMethod } : {}),
      })),
      ...(comparison
        ? {
            comparison: {
              current: current.totals,
              previous: comparison.totals,
              delta: {
                totalIncome: current.totals.totalIncome - comparison.totals.totalIncome,
                totalExpenses: current.totals.totalExpenses - comparison.totals.totalExpenses,
                netProfit: current.totals.netProfit - comparison.totals.netProfit,
              },
              deltaPct: {
                totalIncome: this.safePercentChange(current.totals.totalIncome, comparison.totals.totalIncome),
                totalExpenses: this.safePercentChange(
                  current.totals.totalExpenses,
                  comparison.totals.totalExpenses,
                ),
                netProfit: this.safePercentChange(current.totals.netProfit, comparison.totals.netProfit),
              },
            },
          }
        : {}),
    };
  }

  private async computeIncomeForRange(
    user: AuthUser,
    tenantId: string,
    features: TenantFeature[],
    range: DateRange,
    storeId?: string,
  ) {
    const jwtFeatures = user?.tenantFeatures || [];
    const includeNamedServices = jwtFeatures.includes(TenantFeature.NAMEDSERVICES);

    const hasProducts = features.includes(TenantFeature.PRODUCTS);
    const hasServices = features.includes(TenantFeature.SERVICES);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        cashSession: {
          Store: this.buildStoreFilter(tenantId, storeId),
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
        orderProducts: hasProducts ? { select: { id: true, quantity: true, price: true } } : false,
      },
    });

    let incomeServices = 0;
    let incomeProducts = 0;
    let incomeCashMovements = 0;

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

        const servicesTotal = services.reduce((sum, s) => {
          const price = Number(s.price) || 0;
          return sum + price;
        }, 0);

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
            total: currentService.total + (Number(s?.price) || 0),
            name: normalizedName,
          });

          if (includeNamedServices) {
            const rawDescription = (s?.description ?? '').toString();
            const normalizedDescription = rawDescription.trim();
            const descMap = serviceDescriptionsByName.get(normalizedName) || new Map<string, { count: number }>();

            const currentDesc = descMap.get(normalizedDescription) || { count: 0 };
            descMap.set(normalizedDescription, { count: currentDesc.count + 1 });
            serviceDescriptionsByName.set(normalizedName, descMap);

            totalUsersServicesRaw.push({
              userId: o.userId,
              name: rawName.trim(),
              description: normalizedDescription,
              amount: Number(s?.price) || 0,
            });
          }
        }
      }

      if (hasProducts) {
        const ops = (o.orderProducts as any[]) || [];
        const productTotal = ops.reduce((sum, op) => sum + (Number(op.price) || 0) * (op.quantity || 0), 0);
        const items = ops.reduce((sum, op) => sum + (op.quantity || 0), 0);
        incomeProducts += productTotal;

        const current = productsByUser.get(o.userId) || { items: 0, total: 0 };
        productsByUser.set(o.userId, {
          items: current.items + items,
          total: current.total + productTotal,
        });
      }
    }

    // Agregar ingresos de movimientos de caja manuales
    const cashMovementIncomes = await this.prisma.cashMovement.findMany({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        type: MovementType.INCOME,
        relatedOrderId: null,
        CashSession: {
          Store: this.buildStoreFilter(tenantId, storeId),
        },
      },
      select: {
        amount: true,
      },
    });

    incomeCashMovements = cashMovementIncomes.reduce((sum, cm) => sum + this.toNumber(cm.amount), 0);

    const userIds = Array.from(new Set([...Array.from(servicesByUser.keys()), ...Array.from(productsByUser.keys())]));

    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];

    const usersById = new Map(users.map((u) => [u.id, u] as const));

    const topUsersServices = hasServices
      ? includeNamedServices
        ? Array.from(servicesByName.values())
            .map((s) => {
              let description = '';
              const descMap = serviceDescriptionsByName.get(s.name);
              if (descMap && descMap.size) {
                description =
                  Array.from(descMap.entries()).sort((a, b) => b[1].count - a[1].count)[0]?.[0] ?? '';
              }

              return {
                Name: s.name,
                Description: description,
                servicesCount: s.count,
                totalAmount: s.total,
              };
            })
            .sort((a, b) => b.totalAmount - a.totalAmount)
        : Array.from(servicesByUser.entries())
            .map(([userId, data]) => ({
              userId,
              userName: usersById.get(userId)?.name || 'Usuario',
              servicesCount: data.count,
              totalAmount: data.total,
            }))
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .slice(0, 10)
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

    const maxReasonableValue = 10000000000;
    const validatedIncomeServices = incomeServices > maxReasonableValue ? 0 : Number(incomeServices);
    const validatedIncomeProducts = incomeProducts > maxReasonableValue ? 0 : Number(incomeProducts);
    const validatedIncomeCashMovements = incomeCashMovements > maxReasonableValue ? 0 : Number(incomeCashMovements);

    return {
      summary: {
        incomeProducts: hasProducts ? validatedIncomeProducts : 0,
        incomeServices: hasServices ? validatedIncomeServices : 0,
        incomeCashMovements: validatedIncomeCashMovements,
        totalIncome: (hasProducts ? validatedIncomeProducts : 0) + (hasServices ? validatedIncomeServices : 0) + validatedIncomeCashMovements,
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

  async getIncome(
    user: AuthUser,
    from: string,
    to: string,
    timeZone?: string,
    storeId?: string,
    compareFrom?: string,
    compareTo?: string,
  ) {
    const context = await this.resolveContext(user, from, to, timeZone, storeId, TenantFeature.CASH);
    const comparisonRange = this.normalizeCompareRange(compareFrom, compareTo, timeZone);

    const current = await this.computeIncomeForRange(
      user,
      context.tenantId,
      context.features,
      context.range,
      context.storeId,
    );

    const comparison = comparisonRange
      ? await this.computeIncomeForRange(
          user,
          context.tenantId,
          context.features,
          comparisonRange,
          context.storeId,
        )
      : null;

    return {
      ...current,
      ...(comparison
        ? {
            comparison: {
              current: current.summary,
              previous: comparison.summary,
              delta: {
                incomeProducts: current.summary.incomeProducts - comparison.summary.incomeProducts,
                incomeServices: current.summary.incomeServices - comparison.summary.incomeServices,
                totalIncome: current.summary.totalIncome - comparison.summary.totalIncome,
              },
              deltaPct: {
                incomeProducts: this.safePercentChange(
                  current.summary.incomeProducts,
                  comparison.summary.incomeProducts,
                ),
                incomeServices: this.safePercentChange(
                  current.summary.incomeServices,
                  comparison.summary.incomeServices,
                ),
                totalIncome: this.safePercentChange(current.summary.totalIncome, comparison.summary.totalIncome),
              },
            },
          }
        : {}),
    };
  }

  private async computeExpensesForRange(tenantId: string, range: DateRange, storeId?: string) {
    const expenses = await this.prisma.cashMovement.findMany({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        type: MovementType.EXPENSE,
        CashSession: {
          Store: this.buildStoreFilter(tenantId, storeId),
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

    const totalExpenses = expenses.reduce((sum, e) => sum + this.toNumber(e.amount), 0);

    return {
      totals: {
        totalExpenses,
      },
      expenses,
    };
  }

  async getExpenses(
    user: AuthUser,
    from: string,
    to: string,
    timeZone?: string,
    storeId?: string,
    compareFrom?: string,
    compareTo?: string,
  ) {
    const context = await this.resolveContext(user, from, to, timeZone, storeId, TenantFeature.CASH);
    const comparisonRange = this.normalizeCompareRange(compareFrom, compareTo, timeZone);

    const current = await this.computeExpensesForRange(context.tenantId, context.range, context.storeId);
    const comparison = comparisonRange
      ? await this.computeExpensesForRange(context.tenantId, comparisonRange, context.storeId)
      : null;

    return {
      totals: current.totals,
      expenses: current.expenses.map((e) => ({
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
      ...(comparison
        ? {
            comparison: {
              current: current.totals,
              previous: comparison.totals,
              delta: {
                totalExpenses: current.totals.totalExpenses - comparison.totals.totalExpenses,
              },
              deltaPct: {
                totalExpenses: this.safePercentChange(
                  current.totals.totalExpenses,
                  comparison.totals.totalExpenses,
                ),
              },
            },
          }
        : {}),
    };
  }

  async getIncomeTimeSeries(
    user: AuthUser,
    from: string,
    to: string,
    timeZone?: string,
    storeId?: string,
  ) {
    const context = await this.resolveContext(user, from, to, timeZone, storeId, TenantFeature.CASH);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: context.range.from, lte: context.range.to },
        cashSession: {
          Store: this.buildStoreFilter(context.tenantId, context.storeId),
        },
      },
      select: {
        createdAt: true,
        totalAmount: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const seriesMap = new Map<string, { date: string; totalIncome: number; ordersCount: number }>();

    for (const order of orders) {
      const key = this.getDateKey(order.createdAt, timeZone);
      const current = seriesMap.get(key) || { date: key, totalIncome: 0, ordersCount: 0 };

      current.totalIncome += this.toNumber(order.totalAmount);
      current.ordersCount += 1;
      seriesMap.set(key, current);
    }

    const series = Array.from(seriesMap.values()).sort((a, b) => (a.date < b.date ? -1 : 1));

    return {
      summary: {
        totalIncome: Number(series.reduce((acc, s) => acc + s.totalIncome, 0).toFixed(2)),
        totalOrders: series.reduce((acc, s) => acc + s.ordersCount, 0),
        points: series.length,
      },
      series,
      chart: {
        type: 'line',
        xKey: 'date',
        yKeys: ['totalIncome', 'ordersCount'],
      },
    };
  }

  async getOverview(
    user: AuthUser,
    from: string,
    to: string,
    timeZone?: string,
    storeId?: string,
    compareFrom?: string,
    compareTo?: string,
  ) {
    const [income, expenses, netProfit, paymentMethods, incomeSeries] = await Promise.all([
      this.getIncome(user, from, to, timeZone, storeId, compareFrom, compareTo),
      this.getExpenses(user, from, to, timeZone, storeId, compareFrom, compareTo),
      this.getNetProfit(user, from, to, timeZone, storeId, compareFrom, compareTo),
      this.getPaymentMethodsSummary(user, from, to, timeZone, storeId),
      this.getIncomeTimeSeries(user, from, to, timeZone, storeId),
    ]);

    return {
      kpis: {
        totalIncome: income.summary.totalIncome,
        totalExpenses: expenses.totals.totalExpenses,
        netProfit: netProfit.totals.netProfit,
        transactions: paymentMethods.summary.totalCount,
      },
      charts: {
        incomeTrend: incomeSeries,
        paymentMethods,
      },
      blocks: {
        income,
        expenses,
        netProfit,
      },
      filters: {
        from,
        to,
        compareFrom: compareFrom || null,
        compareTo: compareTo || null,
        timeZone: timeZone || null,
        storeId: storeId || null,
      },
    };
  }

  async getUserRankings(
    user: AuthUser,
    from: string,
    to: string,
    timeZone?: string,
    storeId?: string,
  ) {
    const context = await this.resolveContext(user, from, to, timeZone, storeId, TenantFeature.CASH);
    const features = context.features;

    const hasServices = features.includes(TenantFeature.SERVICES);
    const hasProducts = features.includes(TenantFeature.PRODUCTS);

    // Ranking de usuarios por servicios
    const servicesRanking = hasServices ? await this.prisma.order.groupBy({
      by: ['userId'],
      where: {
        createdAt: { gte: context.range.from, lte: context.range.to },
        status: 'COMPLETED',
        cashSession: {
          Store: this.buildStoreFilter(context.tenantId, context.storeId),
        },
        services: {
          some: {
            status: {
              not: 'ANNULLATED', // Excluir servicios anulados
            },
          },
        },
      },
      _sum: {
        totalAmount: true,
      },
      _count: true, // Contar todas las filas del grupo
    }) : [];

    // Ranking de usuarios por productos
    const productsRanking = hasProducts ? await this.prisma.order.groupBy({
      by: ['userId'],
      where: {
        createdAt: { gte: context.range.from, lte: context.range.to },
        status: 'COMPLETED',
        cashSession: {
          Store: this.buildStoreFilter(context.tenantId, context.storeId),
        },
        orderProducts: {
          some: {}, // Tiene al menos un producto
        },
      },
      _sum: {
        totalAmount: true,
      },
      _count: true, // Contar todas las filas del grupo
      orderBy: {
        _sum: {
          totalAmount: 'desc',
        },
      },
      take: 10,
    }) : [];

    // Obtener información de usuarios
    const userIds = Array.from(new Set([
      ...servicesRanking.map(r => r.userId),
      ...productsRanking.map(r => r.userId),
    ]));

    const users = userIds.length ? await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    }) : [];

    const usersById = new Map(users.map(u => [u.id, u]));

    // Formatear rankings
    const formattedServicesRanking = servicesRanking.map(r => ({
      userId: r.userId,
      userName: usersById.get(r.userId)?.name || 'Usuario',
      userEmail: usersById.get(r.userId)?.email || '',
      ordersCount: r._count || 0,
      totalAmount: this.toNumber(r._sum?.totalAmount),
    }));

    const formattedProductsRanking = productsRanking.map(r => ({
      userId: r.userId,
      userName: usersById.get(r.userId)?.name || 'Usuario',
      userEmail: usersById.get(r.userId)?.email || '',
      ordersCount: r._count || 0,
      totalAmount: this.toNumber(r._sum?.totalAmount),
    }));

    return {
      rankings: {
        services: formattedServicesRanking,
        products: formattedProductsRanking,
      },
      charts: {
        servicesRanking: {
          type: 'bar',
          xKey: 'userName',
          yKeys: ['totalAmount'],
          series: formattedServicesRanking,
        },
        productsRanking: {
          type: 'bar',
          xKey: 'userName',
          yKeys: ['totalAmount'],
          series: formattedProductsRanking,
        },
      },
      filters: {
        from,
        to,
        timeZone: timeZone || null,
        storeId: storeId || null,
      },
    };
  }
}
