import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { CreateCashSessionDto } from './dto/create-cash-session.dto';
import { UpdateCashSessionDto } from './dto/update-cash-session.dto';
import { PrismaService } from '../prisma/prisma.service';
import { MovementType, PaymentType, User, SessionStatus } from '@prisma/client';
import { buildPaginatedResponse, getPaginationParams } from '../common/pagination/pagination.helper';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
  stores?: string[];
};

@Injectable()
export class CashSessionService {
  private readonly logger = new Logger(CashSessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  private toNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    return value.toNumber();
  }

  async listClosedSessionsByStore(
    storeId: string,
    filters: { from?: string; to?: string; openedByName?: string; page?: number; pageSize?: number; userId?: string },
    user: AuthUser,
  ) {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    await this.assertStoreAccess(storeId, user);

    const { page, pageSize, skip } = getPaginationParams({
      page: filters.page,
      pageSize: filters.pageSize,
      defaultPage: 1,
      defaultPageSize: 12,
      maxPageSize: 50,
    });

    const where: any = {
      StoreId: storeId,
      status: SessionStatus.CLOSED,
    };

    if (filters?.from || filters?.to) {
      where.closedAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }

    if (filters?.openedByName && filters.openedByName.trim().length > 0) {
      where.User = {
        name: {
          contains: filters.openedByName.trim(),
          mode: 'insensitive',
        },
      };
    } else if (filters?.userId) {
      where.UserId = filters.userId;
    }

    // Get total count for pagination
    const total = await this.prisma.cashSession.count({
      where,
    });

    const sessions = await this.prisma.cashSession.findMany({
      where,
      select: {
        id: true,
        openedAt: true,
        closedAt: true,
        status: true,
        closingAmount: true,
        declaredAmount: true,
        User: { select: { name: true } },
        closedById: true,
      },
      orderBy: { closedAt: 'desc' },
      skip,
      take: pageSize,
    });

    const closerIds = Array.from(
      new Set(
        (sessions || [])
          .map((s) => s.closedById)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );

    const closers = closerIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: closerIds },
            tenantId,
          },
          select: { id: true, name: true },
        })
      : [];

    const closerById = new Map(closers.map((u) => [u.id, u.name] as const));

    const data = (sessions || []).map((s) => ({
      id: s.id,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openedByName: s.User?.name ?? null,
      closedByName: s.closedById ? (closerById.get(s.closedById) ?? null) : null,
      status: s.status,
      closingAmount: s.closingAmount,
      declaredAmount: s.declaredAmount,
    }));

    return buildPaginatedResponse(data, total, page, pageSize);
  }

  async findOneForClose(id: string, user: AuthUser) {
    await this.assertCashSessionAccessWithOptions(id, user, { allowAdmin: user.role === 'ADMIN' });

    return this.prisma.cashSession.findUnique({
      where: { id },
      include: {
        Store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        User: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
          },
        },
        cashMovements: {
          include: {
            User: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });
  }

  private async assertStoreAccess(storeId: string, user: AuthUser) {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        tenantId: true,
      },
    });

    if (!store) {
      throw new NotFoundException('La tienda especificada no existe');
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

  private async assertCashSessionAccess(cashSessionId: string, user: AuthUser) {
    return this.assertCashSessionAccessWithOptions(cashSessionId, user);
  }

  private async assertCashSessionAccessWithOptions(
    cashSessionId: string,
    user: AuthUser,
    options?: { allowAdmin?: boolean; requireOpen?: boolean },
  ) {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const cashSession = await this.prisma.cashSession.findUnique({
      where: { id: cashSessionId },
      include: {
        Store: {
          select: {
            id: true,
            tenantId: true,
          },
        },
      },
    });

    if (!cashSession) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }

    if (!cashSession.Store?.tenantId || cashSession.Store.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para acceder a esta sesión de caja');
    }

    const requireOpen = options?.requireOpen ?? false;
    if (requireOpen && cashSession.status !== SessionStatus.OPEN) {
      throw new BadRequestException('La sesión de caja está cerrada');
    }

    const allowAdmin = options?.allowAdmin ?? false;
    if (!(allowAdmin && user.role === 'ADMIN')) {
      if (cashSession.UserId !== user.userId) {
        throw new ForbiddenException('No tienes permisos para acceder a esta sesión de caja');
      }
    }

    return cashSession;
  }

  async create(createCashSessionDto: CreateCashSessionDto, user: AuthUser) {
    const { storeId, openingAmount = 0.00 } = createCashSessionDto;
    
    this.logger.log(`Iniciando creación de sesión de caja para usuario: ${user.email} en tienda: ${storeId}`);

    try {
      // 1. Verificar que la tienda exista
      const store = await this.assertStoreAccess(storeId, user);
      
      this.logger.debug(`Tienda encontrada: ${store.name} (ID: ${storeId})`);

      this.logger.debug(`Usuario ${user.email} verificado como miembro de la tienda ${storeId}`);

      // 3. Validar que el usuario no tenga otra sesión abierta
      const existingUserOpenSession = await this.prisma.cashSession.findFirst({
        where: {
          UserId: user.userId,
          status: SessionStatus.OPEN
        }
      });

      if (existingUserOpenSession) {
        this.logger.warn(`Usuario ${user.email} ya tiene una sesión abierta: ${existingUserOpenSession.id}`);
        throw new ConflictException('Ya tienes una sesión de caja abierta. Ciérrala antes de abrir otra.');
      }

      // 5. Crear la sesión de caja
      const newCashSession = await this.prisma.cashSession.create({
        data: {
          StoreId: storeId,
          UserId: user.userId,
          openedById: user.userId,
          openingAmount: openingAmount,
          status: SessionStatus.OPEN,
          openedAt: new Date()
        },
        include: {
          Store: {
            select: {
              id: true,
              name: true,
              address: true,
              phone: true
            }
          },
          User: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true
            }
          }
        }
      });

      this.logger.log(`Sesión de caja creada exitosamente: ${newCashSession.id} - Usuario: ${user.email} - Tienda: ${store.name}`);

      return {
        message: 'Sesión de caja creada exitosamente',
        cashSession: newCashSession
      };

    } catch (error) {
      this.logger.error(`Error al crear sesión de caja: ${error.message}`, error.stack);
      
      if (error instanceof NotFoundException || 
          error instanceof ForbiddenException || 
          error instanceof ConflictException) {
        throw error;
      }
      
      throw new BadRequestException('Error al crear la sesión de caja');
    }
  }

  findAll(user: AuthUser) {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    return this.prisma.cashSession.findMany({
      where: {
        Store: {
          tenantId,
        },
      },
      include: {
        Store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true
          }
        },
        User: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true
          }
        }
      },
      orderBy: {
        openedAt: 'desc'
      }
    });
  }

  async findOne(id: string, user: AuthUser) {
    await this.assertCashSessionAccessWithOptions(id, user);

    return this.prisma.cashSession.findUnique({
      where: { id },
      include: {
        Store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true
          }
        },
        User: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true
          }
        },
        cashMovements: {
          include: {
            User: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });
  }

  async update(id: string, updateCashSessionDto: UpdateCashSessionDto, user: AuthUser) {
    await this.assertCashSessionAccessWithOptions(id, user);

    return this.prisma.cashSession.update({
      where: { id },
      data: updateCashSessionDto,
      include: {
        Store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true
          }
        },
        User: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true
          }
        }
      }
    });
  }

  async remove(id: string, user: AuthUser) {
    await this.assertCashSessionAccessWithOptions(id, user);

    return this.prisma.cashSession.delete({
      where: { id }
    });
  }

  // Método adicional para obtener sesiones por tienda con paginación
  async findByStore(storeId: string, page: number = 1, limit: number = 20, user: AuthUser) {
    const skip = (page - 1) * limit;

    await this.assertStoreAccess(storeId, user);

    // Obtener el total de sesiones para paginación
    const total = await this.prisma.cashSession.count({
      where: { StoreId: storeId },
    });

    // Obtener las sesiones con paginación
    const sessions = await this.prisma.cashSession.findMany({
      where: { StoreId: storeId },
      include: {
        Store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        User: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
          },
        },
      },
      orderBy: { openedAt: 'desc' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: sessions,
      total,
      page,
      limit,
      totalPages,
    };
  }

  // Método para obtener la sesión abierta actual de una tienda
  async findOpenSessionByStore(storeId: string, user: AuthUser) {
    await this.assertStoreAccess(storeId, user);

    const session = await this.prisma.cashSession.findFirst({
      where: {
        StoreId: storeId,
        UserId: user.userId,
        status: SessionStatus.OPEN,
      },
      include: {
        Store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        User: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
          },
        },
      },
    });

    return session;
  }

  // Método para cerrar una sesión de caja
  async close(id: string, closedById: string, closingAmount: number, declaredAmount: number, user: AuthUser) {
    await this.assertCashSessionAccessWithOptions(id, user, { allowAdmin: user.role === 'ADMIN', requireOpen: true });

    this.logger.log(`Iniciando cierre de sesión de caja: ${id} - Usuario: ${closedById} - Monto de cierre: ${closingAmount} - Monto declarado: ${declaredAmount}`);

    try {
      // Actualizar la sesión de caja con los datos de cierre
      const updatedSession = await this.prisma.cashSession.update({
        where: { id },
        data: {
          status: SessionStatus.CLOSED,
          closedAt: new Date(),
          closedById: closedById,
          closingAmount: closingAmount,
          declaredAmount: declaredAmount,
        },
        include: {
          Store: {
            select: {
              id: true,
              name: true,
              address: true,
              phone: true
            }
          },
          User: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true
            }
          }
        }
      });

      this.logger.log(`Sesión de caja cerrada exitosamente: ${updatedSession.id} - Cerrada por: ${closedById}`);

      return updatedSession;

    } catch (error) {
      this.logger.error(`Error al cerrar sesión de caja: ${error.message}`, error.stack);
      throw new BadRequestException('Error al cerrar la sesión de caja');
    }
  }

  async getClosingReport(sessionId: string, user: AuthUser) {
    await this.assertCashSessionAccessWithOptions(sessionId, user, { allowAdmin: user.role === 'ADMIN' });

    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    // 1. Obtener sesión con datos básicos
    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
      include: {
        Store: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }

    // 2. Obtener usuarios (abrió y cerró)
    const openedByUser = await this.prisma.user.findFirst({
      where: { id: session.openedById, tenantId },
      select: { name: true },
    });

    const closedByUser = session.closedById
      ? await this.prisma.user.findFirst({
          where: { id: session.closedById, tenantId },
          select: { name: true },
        })
      : null;

    // 3. Obtener órdenes y sus items
    const orders = await this.prisma.order.findMany({
      where: {
        cashSessionsId: sessionId,
        cashSession: {
          Store: {
            tenantId,
          },
        },
      },
      include: {
        paymentMethods: {
          select: {
            id: true,
            type: true,
            amount: true,
            createdAt: true,
          },
        },
        orderProducts: {
          select: {
            quantity: true,
            price: true,
            product: {
              select: {
                product: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        services: {
          select: {
            id: true,
            name: true,
            price: true,
            status: true,
          },
        },
      },
    });

    // 4. Agrupar métodos de pago por orden
    const paymentsByOrderId = new Map<string, any[]>();
    for (const o of orders) {
      paymentsByOrderId.set(o.id, o.paymentMethods || []);
    }

    // 5. Construir lista de items
    const items: any[] = [];

    for (const order of orders) {
      const isOrderCanceled = order.status === 'CANCELLED';
      const orderNumberShort = order.orderNumber.slice(-4);

      const orderPayments = paymentsByOrderId.get(order.id) || [];
      const orderPaymentMethods = orderPayments.length > 0
        ? [...new Set(orderPayments.map((p) => p.type))].join(', ')
        : 'SIN PAGO';

      const orderTotalLineAmount = [...order.orderProducts, ...order.services].reduce((sum, item: any) => {
        const amount = 'quantity' in item
          ? this.toNumber(item.price) * item.quantity
          : this.toNumber(item.price);
        return sum + amount;
      }, 0);

      const totalPaymentAmount = orderPayments.reduce((sum, payment) => sum + this.toNumber(payment.amount), 0);

      const buildPaymentBreakdown = (lineAmount: number) => {
        if (!totalPaymentAmount || totalPaymentAmount <= 0) {
          return [];
        }
        return orderPayments.map((payment) => ({
          method: payment.type,
          amount: (this.toNumber(payment.amount) * lineAmount) / totalPaymentAmount,
        }));
      };

      // Procesar Productos
      for (const op of order.orderProducts) {
        const paymentMethods = orderPaymentMethods;

        // Estado orden
        let statusShort = 'PEN';
        if (order.status === 'COMPLETED') statusShort = 'COM';
        if (order.status === 'CANCELLED') statusShort = 'ANU';

        const lineAmount = this.toNumber(op.price) * op.quantity;
        const paymentBreakdown = buildPaymentBreakdown(lineAmount);

        items.push({
          orderNumber: orderNumberShort,
          quantity: op.quantity,
          description: op.product.product.name,
          paymentMethod: paymentMethods,
          paymentBreakdown,
          price: lineAmount,
          status: statusShort,
          isCanceled: isOrderCanceled,
        });
      }

      // Procesar Servicios
      for (const svc of order.services) {
        const paymentMethods = orderPaymentMethods;

        // En nuevo esquema, el pago está a nivel de orden: mostramos el precio del servicio
        const lineAmount = this.toNumber(svc.price);
        const paymentBreakdown = buildPaymentBreakdown(lineAmount);

        let statusShort = 'PEN';
        if (
          svc.status === 'COMPLETED' ||
          svc.status === 'DELIVERED' ||
          svc.status === 'PAID'
        ) {
          statusShort = 'COM';
        } else if (svc.status === 'ANNULLATED') {
          statusShort = 'ANU';
        }

        items.push({
          orderNumber: orderNumberShort,
          quantity: 1, // Servicios siempre 1
          description: svc.name,
          paymentMethod: paymentMethods,
          paymentBreakdown,
          price: lineAmount,
          status: statusShort,
          isCanceled: isOrderCanceled || svc.status === 'ANNULLATED',
        });
      }
    }

    // 6. Calcular Resumen por Método de Pago
    const paymentSummary: Record<string, number> = {};
    for (const order of orders) {
      const methods = order.paymentMethods || [];
      methods.forEach((p) => {
        const type = p.type;
        const amount = p.amount;
        paymentSummary[type] = (paymentSummary[type] || 0) + this.toNumber(amount);
      });
    }

    // 7. Obtener Gastos (Expenses)
    const expenses = await this.prisma.cashMovement.findMany({
      where: {
        CashSessionId: sessionId, // Nota: Schema usa CashSessionId
        type: 'EXPENSE',
        CashSession: {
          Store: {
            tenantId,
          },
        },
      },
      select: {
        id: true,
        amount: true,
        description: true,
        payment: true,
        createdAt: true,
      },
    });

    return {
      openedAt: session.openedAt,
      closedAt: session.closedAt || new Date(),
      openedBy: openedByUser?.name || 'Desconocido',
      closedBy: closedByUser?.name || 'Desconocido',
      openingAmount: session.openingAmount,
      closingAmount: session.closingAmount,
      declaredAmount: session.declaredAmount,
      difference: this.toNumber(session.declaredAmount || 0) - this.toNumber(session.closingAmount || 0),
      storeName: session.Store.name,
      storeAddress: session.Store.address,
      storePhone: session.Store.phone,
      printedAt: new Date(),
      orders: items,
      paymentSummary,
      expenses: expenses.map((e) => ({
        description: e.description,
        amount: e.amount,
        paymentMethod: e.payment ?? PaymentType.EFECTIVO,
        time: e.createdAt,
      })),
    };
  }

  async getClosingPrintData(
    sessionId: string,
    user: AuthUser,
  ) {
    await this.assertCashSessionAccessWithOptions(sessionId, user, { allowAdmin: user.role === 'ADMIN' });

    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        openingAmount: true,
        Store: {
          select: {
            tenantId: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }

    if (!session.Store?.tenantId || session.Store.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para acceder a esta sesión de caja');
    }

    if (session.status !== SessionStatus.CLOSED) {
      throw new BadRequestException('La sesión de caja debe estar cerrada para imprimir el reporte');
    }

    const cashMovements = await this.prisma.cashMovement.findMany({
      where: {
        CashSessionId: sessionId,
        CashSession: {
          Store: {
            tenantId,
          },
        },
      },
      select: {
        id: true,
        sessionId: true,
        type: true,
        amount: true,
        payment: true,
        description: true,
        createdAt: true,
        relatedOrderId: true,
        CashSessionId: true,
        UserId: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const manualMovements = cashMovements
      .filter((movement) => !movement.relatedOrderId)
      .map((movement) => ({
        type: movement.type === MovementType.INCOME ? 'IN' : 'OUT',
        description:
          movement.description ||
          (movement.type === MovementType.INCOME ? 'Ingreso manual' : 'Salida manual'),
        amount: this.toNumber(movement.amount),
      }));

    const incomeMovements = cashMovements.filter((m) => m.type === MovementType.INCOME);
    const expenseMovements = cashMovements.filter((m) => m.type === MovementType.EXPENSE);

    const totalIngresosAll = incomeMovements.reduce((sum, m) => sum + this.toNumber(m.amount), 0);
    const totalSalidasAll = expenseMovements.reduce((sum, m) => sum + this.toNumber(m.amount), 0);

    const cashOnlyMovements = cashMovements.filter(
      (m) => (m.payment ?? PaymentType.EFECTIVO) === PaymentType.EFECTIVO,
    );

    const totalIngresosCash = cashOnlyMovements
      .filter((m) => m.type === MovementType.INCOME)
      .reduce((sum, m) => sum + this.toNumber(m.amount), 0);

    const totalSalidasCash = cashOnlyMovements
      .filter((m) => m.type === MovementType.EXPENSE)
      .reduce((sum, m) => sum + this.toNumber(m.amount), 0);

    const openingAmount = this.toNumber(session.openingAmount);
    const balanceActual = openingAmount + totalIngresosCash - totalSalidasCash;

    const cashBalance = {
      openingAmount: session.openingAmount,
      totalIngresos: totalIngresosCash,
      totalSalidas: totalSalidasCash,
      balanceActual,
    };

    const closingReport = await this.getClosingReport(sessionId, user);

    const printedByUser = user?.userId
      ? await this.prisma.user.findUnique({
          where: { id: user.userId },
          select: { name: true },
        })
      : null;

    const store = {
      name: closingReport.storeName ?? null,
      address: closingReport.storeAddress ?? null,
      phone: closingReport.storePhone ?? null,
    };

    const sessionInfo = {
      openedAt: closingReport.openedAt,
      closedAt: closingReport.closedAt,
      openedBy: closingReport.openedBy,
      closedBy: closingReport.closedBy,
    };

    const balance = {
      openingAmount: this.toNumber(closingReport.openingAmount ?? cashBalance.openingAmount ?? 0),
      totalIngresos: totalIngresosAll,
      totalSalidas: totalSalidasAll,
      closingAmount: this.toNumber(closingReport.closingAmount ?? 0),
      declaredAmount: this.toNumber(closingReport.declaredAmount ?? 0),
      difference: this.toNumber(closingReport.difference ?? 0),
    };

    const paymentSummary = { ...(closingReport.paymentSummary ?? {}) };

    const orders: Array<{
      orderNumber: string;
      description: string;
      amount: number;
      paymentMethod: string | null;
      isCanceled: boolean;
    }> = [];

    for (const order of closingReport.orders ?? []) {
      const baseAmount = this.toNumber(order.price ?? order.amount ?? 0);
      const baseEntry = {
        orderNumber: order.orderNumber,
        description: order.description,
        isCanceled: !!order.isCanceled,
      };

      if (Array.isArray(order.paymentBreakdown) && order.paymentBreakdown.length > 0) {
        order.paymentBreakdown.forEach((part) => {
          orders.push({
            ...baseEntry,
            amount: this.toNumber(part.amount),
            paymentMethod: part.method,
          });
        });
      } else {
        const hasPayment = order.paymentMethod && order.paymentMethod !== 'SIN PAGO';
        orders.push({
          ...baseEntry,
          amount: hasPayment ? baseAmount : 0,
          paymentMethod: hasPayment ? order.paymentMethod : 'NINGUNO',
        });
      }
    }

    const manualIncomeMovements = cashMovements.filter(
      (movement) => !movement.relatedOrderId && movement.type === MovementType.INCOME,
    );

    manualIncomeMovements.forEach((movement) => {
        orders.push({
          orderNumber: 'MANUAL',
          description: movement.description || 'Ingreso manual',
          amount: this.toNumber(movement.amount),
          paymentMethod: movement.payment ?? PaymentType.EFECTIVO,
          isCanceled: false,
        });
      });

    const ordersFiltered = orders.filter((o) => this.toNumber(o.amount) > 0);

    const expenses = (closingReport.expenses ?? []).map((expense) => ({
      description: expense.description,
      amount: this.toNumber(expense.amount ?? 0),
      paymentMethod: expense.paymentMethod ?? PaymentType.EFECTIVO,
    }));

    manualIncomeMovements.forEach((movement) => {
      const paymentType = movement.payment ?? PaymentType.EFECTIVO;
      const amount = this.toNumber(movement.amount);
      paymentSummary[paymentType] = (paymentSummary[paymentType] || 0) + amount;
    });

    const expenseSummary: Record<string, number> = {};
    cashMovements
      .filter((movement) => movement.type === MovementType.EXPENSE)
      .forEach((movement) => {
        const paymentType = movement.payment ?? PaymentType.EFECTIVO;
        const amount = this.toNumber(movement.amount);
        expenseSummary[paymentType] = (expenseSummary[paymentType] || 0) + amount;
      });

    return {
      store,
      session: sessionInfo,
      balance,
      paymentSummary,
      expenseSummary,
      orders: ordersFiltered,
      expenses,
      printedBy: printedByUser?.name ?? null,
      printedAt: closingReport.printedAt,
    };
  }
}
