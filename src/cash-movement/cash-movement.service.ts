import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CreateCashMovementDto, CreateOrderCashMovementDto } from './dto/create-cash-movement.dto';
import { UpdateCashMovementDto } from './dto/update-cash-movement.dto';
import { ListCashMovementsDto, CashMovementOperationFilter } from './dto/list-cash-movements.dto';
import { ListCashMovementsResponseDto } from './dto/list-cash-movements-response.dto';
import { PrismaService } from '../prisma/prisma.service';
import { MovementType, SessionStatus, PaymentType, TenantFeature } from '@prisma/client';
import { buildPaginatedResponse, getPaginationParams } from '../common/pagination/pagination.helper';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  permissions?: string[];
  tenantId?: string;
  tenantFeatures?: TenantFeature[];
};

type MovementListItem = {
  id: string;
  type: MovementType;
  amount: string;
  payment: string | null;
  description: string | null;
  createdAt: Date;
  operation: CashMovementOperationFilter;
  clientName: string | null;
};

@Injectable()
export class CashMovementService {
  private readonly logger = new Logger(CashMovementService.name);

  constructor(private readonly prisma: PrismaService) {}

  private mask(value?: string | null) {
    if (!value) return '';
    const s = String(value);
    if (s.length <= 8) return '***';
    return `${s.slice(0, 4)}***${s.slice(-4)}`;
  }

  private toNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    return value.toNumber();
  }

  private formatDecimal(value: any): string {
    if (value === null || value === undefined) {
      return '0';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value === 'object' && typeof value.toString === 'function') {
      return value.toString();
    }

    return String(value);
  }

  private buildOrderMovementDetails(order: any, movementType: MovementType) {
    if (!order) {
      const fallbackDescription =
        movementType === MovementType.EXPENSE
          ? 'extorno por anulación'
          : 'Movimiento automático';

      return {
        description: fallbackDescription,
        operation:
          movementType === MovementType.EXPENSE
            ? CashMovementOperationFilter.ANULACION
            : CashMovementOperationFilter.SERVICIO,
      };
    }

    const firstProductName =
      (order.orderProducts || [])
        .map((op) => op.product?.product?.name)
        .find((n) => typeof n === 'string' && n.trim().length > 0) ?? null;

    const firstServiceName =
      (order.services || [])
        .map((s) => s?.name)
        .find((n) => typeof n === 'string' && n.trim().length > 0) ?? null;

    const hasProducts = !!firstProductName;
    const hasServices = !!firstServiceName;

    const serviceTotal = (order.services || []).reduce((sum, s) => sum + this.toNumber(s.price), 0);
    const paidTotal = (order.paymentMethods || []).reduce((sum, pm) => sum + this.toNumber(pm.amount), 0);
    const isServicePartialPayment = hasServices && paidTotal + 0.00001 < serviceTotal;

    const subjectType = hasProducts ? 'producto' : hasServices ? 'servicio' : 'orden';
    const subjectName = (hasProducts ? firstProductName : hasServices ? firstServiceName : null) ?? `Orden ${order.orderNumber ?? order.id}`;

    const description = movementType === MovementType.EXPENSE
      ? `extorno por anulación de "${subjectType}" - "${subjectName}"`
      : hasProducts
        ? `venta de "${subjectName}"`
        : isServicePartialPayment
          ? `pago parcial de "${subjectName}"`
          : `"${subjectName}"`;

    const operation = movementType === MovementType.EXPENSE
      ? CashMovementOperationFilter.ANULACION
      : hasProducts
        ? CashMovementOperationFilter.VENTA
        : CashMovementOperationFilter.SERVICIO;

    return { description, operation };
  }

  private mapCashMovementToListItem(movement: any): MovementListItem {
    const hasRelatedOrder = !!movement.relatedOrderId && !!movement.order;

    if (hasRelatedOrder) {
      const { description, operation } = this.buildOrderMovementDetails(movement.order, movement.type);
      return {
        id: movement.id,
        type: movement.type,
        amount: this.formatDecimal(movement.amount),
        payment: (movement.payment ?? PaymentType.EFECTIVO).toString(),
        description: movement.description ?? description,
        createdAt: movement.createdAt,
        operation,
        clientName: movement.order?.client?.name ?? null,
      };
    }

    return {
      id: movement.id,
      type: movement.type,
      amount: this.formatDecimal(movement.amount),
      payment: (movement.payment ?? PaymentType.EFECTIVO).toString(),
      description: movement.description ?? null,
      createdAt: movement.createdAt,
      operation: CashMovementOperationFilter.MANUAL,
      clientName: null,
    };
  }

  private mapPaymentMethodToListItem(paymentMethod: any): MovementListItem {
    const { description, operation } = this.buildOrderMovementDetails(paymentMethod.order, MovementType.INCOME);

    return {
      id: paymentMethod.id,
      type: MovementType.INCOME,
      amount: this.formatDecimal(paymentMethod.amount),
      payment: paymentMethod.type,
      description,
      createdAt: paymentMethod.createdAt,
      operation,
      clientName: paymentMethod.order?.client?.name ?? null,
    };
  }

  private async assertCashSessionAccess(
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
      throw new NotFoundException('La sesión de caja especificada no existe');
    }

    if (!cashSession.Store?.tenantId || cashSession.Store.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para acceder a esta sesión de caja');
    }

    const requireOpen = options?.requireOpen ?? false;
    if (requireOpen && cashSession.status !== SessionStatus.OPEN) {
      throw new BadRequestException('La sesión de caja está cerrada. No se pueden realizar movimientos.');
    }

    // Si tiene VIEW_ALL_CASH_HISTORY, permitir acceso a cualquier sesión
    if (user.permissions?.includes('VIEW_ALL_CASH_HISTORY')) {
      console.log('DEBUG SERVICE: Usuario tiene VIEW_ALL_CASH_HISTORY, omitiendo validación de ownership');
      return cashSession;
    }

    const allowAdmin = options?.allowAdmin ?? false;
    if (!(allowAdmin && user.role === 'ADMIN')) {
      if (cashSession.UserId !== user.userId) {
        throw new ForbiddenException('No tienes permisos para acceder a esta sesión de caja');
      }
    }

    return cashSession;
  }

  // 1. Crear movimiento manual (fuera de órdenes)
  async createManual(createCashMovementDto: CreateCashMovementDto, user: AuthUser) {
    const { cashSessionId, amount, type, description, orderId, clientId, payment } = createCashMovementDto;

    this.logger.log(
      `Creando movimiento manual: session=${this.mask(cashSessionId)} type=${type} amount=${amount} payment=${payment ?? PaymentType.EFECTIVO}`,
    );

    try {
      // Validar que la sesión de caja exista y esté abierta
      await this.assertCashSessionAccess(cashSessionId, user, { requireOpen: true });

      // Crear el movimiento
      const cashMovement = await this.prisma.cashMovement.create({
        data: {
          sessionId: cashSessionId,
          type: type,
          amount: amount,
          payment: payment ?? PaymentType.EFECTIVO,
          description: description || 'Movimiento manual',
          relatedOrderId: orderId || null,
          CashSessionId: cashSessionId,
          UserId: user.userId
        },
        include: {
          CashSession: {
            select: {
              id: true,
              openedAt: true,
              User: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      });

      this.logger.log(
        `Movimiento manual creado: id=${this.mask(cashMovement.id)} session=${this.mask(cashMovement.sessionId)} type=${cashMovement.type} amount=${cashMovement.amount}`,
      );

      return cashMovement;

    } catch (error) {
      this.logger.error(`Error al crear movimiento manual: ${error.message}`, error.stack);
      
      if (error instanceof NotFoundException || 
          error instanceof BadRequestException || 
          error instanceof ForbiddenException) {
        throw error;
      }
      
      throw new BadRequestException('Error al crear el movimiento de caja');
    }
  }

  // 2. Crear movimiento desde orden (uso interno)
  async createFromOrder(createOrderCashMovementDto: CreateOrderCashMovementDto, isRefund: boolean = false, user?: AuthUser) {
    const { cashSessionId, amount, orderId, clientId, clientName, clientEmail, payment } = createOrderCashMovementDto;

    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    this.logger.log(
      `Creando movimiento desde orden: session=${this.mask(cashSessionId)} order=${this.mask(orderId)} amount=${amount} refund=${isRefund}`,
    );

    try {
      // Validar que la sesión exista y esté abierta
      await this.assertCashSessionAccess(cashSessionId, user, { requireOpen: true });

      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderProducts: {
            select: {
              id: true,
              product: {
                select: {
                  id: true,
                  product: {
                    select: {
                      id: true,
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
            },
          },
          paymentMethods: {
            select: {
              type: true,
              amount: true,
            },
          },
        },
      });

      if (!order) {
        this.logger.warn(`Orden no existe: order=${this.mask(orderId)}`);
        throw new NotFoundException(`La orden ${orderId} no existe`);
      }

      const firstProductName =
        (order.orderProducts || [])
          .map((op) => op.product?.product?.name)
          .find((n) => typeof n === 'string' && n.trim().length > 0) ?? null;

      const firstServiceName =
        (order.services || [])
          .map((s) => s?.name)
          .find((n) => typeof n === 'string' && n.trim().length > 0) ?? null;

      const hasProducts = !!firstProductName;
      const hasServices = !!firstServiceName;

      const serviceTotal = (order.services || []).reduce(
        (sum, s) => sum + this.toNumber(s.price),
        0,
      );

      const paidTotal = (order.paymentMethods || []).reduce(
        (sum, pm) => sum + this.toNumber(pm.amount),
        0,
      );

      const isServicePartialPayment = hasServices && paidTotal + 0.00001 < serviceTotal;

      const subjectType = hasProducts ? 'producto' : hasServices ? 'servicio' : 'orden';
      const subjectName = (hasProducts ? firstProductName : hasServices ? firstServiceName : null) ?? `Orden ${orderId}`;

      // Determinar el tipo y descripción según si es reembolso o pago
      const movementType = isRefund ? MovementType.EXPENSE : MovementType.INCOME;
      const description = isRefund
        ? `extorno por anulación de "${subjectType}" - "${subjectName}"`
        : hasProducts
          ? `venta de "${subjectName}"`
          : isServicePartialPayment
            ? `pago parcial de "${subjectName}"`
            : `"${subjectName}"`;

      // Crear el movimiento
      const cashMovement = await this.prisma.cashMovement.create({
        data: {
          sessionId: cashSessionId,        // Campo sessionId
          type: movementType,              // INCOME para pagos, EXPENSE para reembolsos
          amount: amount,
          payment: payment ?? PaymentType.EFECTIVO,
          description: description,
          relatedOrderId: orderId,         // Campo relacionado con orden
          CashSessionId: cashSessionId,    // FK para CashSession
          UserId: user.userId   // FK para User - siempre el dueño de la sesión
        },
        include: {
          CashSession: {
            select: {
              id: true,
              openedAt: true
            }
          }
        }
      });

      this.logger.log(
        `Movimiento desde orden creado: id=${this.mask(cashMovement.id)} session=${this.mask(cashMovement.sessionId)} type=${cashMovement.type} amount=${cashMovement.amount}`,
      );

      return cashMovement;

    } catch (error) {
      this.logger.error(`Error al crear movimiento desde orden: ${error.message}`, error.stack);
      
      if (error instanceof NotFoundException || 
          error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException('Error al crear el movimiento de caja desde orden');
    }
  }

  // 3. Obtener cuadre de caja
  async getCashBalance(cashSessionId: string, user?: AuthUser, options?: { allowAdmin?: boolean }) {
    this.logger.log(`Obteniendo cuadre de caja: session=${this.mask(cashSessionId)}`);

    const tenantId = user?.tenantId;

    try {
      if (user) {
        await this.assertCashSessionAccess(cashSessionId, user, { allowAdmin: options?.allowAdmin ?? false });
      }

      const cashSession = await this.prisma.cashSession.findUnique({
        where: { id: cashSessionId },
        include: {
          User: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          Store: {
            select: {
              id: true,
              name: true,
              tenantId: true
            }
          }
        }
      });

      if (!cashSession) {
        this.logger.warn(`Sesión de caja no existe: session=${this.mask(cashSessionId)}`);
        throw new NotFoundException('La sesión de caja especificada no existe');
      }

      // Obtener todos los movimientos de la sesión
      const cashMovements = await this.prisma.cashMovement.findMany({
        where: {
          sessionId: cashSessionId,
          ...(tenantId
            ? {
                CashSession: {
                  Store: {
                    tenantId,
                  },
                },
              }
            : {}),
        },
        include: {
          CashSession: {
            select: {
              id: true,
              openedAt: true,
              openingAmount: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      // Obtener todos los paymentMethods NO EFECTIVO de órdenes ligadas a la sesión
      const nonCashPaymentMethods = await this.prisma.paymentMethod.findMany({
        where: {
          type: { not: PaymentType.EFECTIVO },
          order: {
            cashSessionsId: cashSessionId,
            ...(tenantId
              ? {
                  cashSession: {
                    Store: {
                      tenantId,
                    },
                  },
                }
              : {}),
          },
        },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              client: {
                select: {
                  name: true,
                  email: true,
                },
              },
              services: {
                select: {
                  name: true,
                  description: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      this.logger.log(`Detalles de movimientos: session=${this.mask(cashSessionId)}`);

      // Calcular totales SOLO de EFECTIVO
      // Nota: movimientos antiguos podrían tener payment null; se tratan como EFECTIVO.
      const cashOnlyMovements = cashMovements.filter(
        (m) => (m.payment ?? PaymentType.EFECTIVO) === PaymentType.EFECTIVO,
      );

      const totalIngresos = cashOnlyMovements
        .filter(m => m.type === MovementType.INCOME)
        .reduce((sum, m) => sum + this.toNumber(m.amount), 0);

      const totalSalidas = cashOnlyMovements
        .filter(m => m.type === MovementType.EXPENSE)
        .reduce((sum, m) => sum + this.toNumber(m.amount), 0);

      const balanceActual = this.toNumber(cashSession.openingAmount) + totalIngresos - totalSalidas;

      this.logger.log(
        `Balance calculado: session=${this.mask(cashSessionId)} opening=${cashSession.openingAmount} income=${totalIngresos} expense=${totalSalidas} balance=${balanceActual}`,
      );

      // Formatear movimientos para el cuadre
      const formattedMovements = await Promise.all(
        cashMovements.map(async (movement) => {
          let clientInfo = {
            name: 'Movimiento interno',
            email: '',
            description: movement.description
          };

          // Si tiene relatedOrderId, obtener información del cliente
          if (movement.relatedOrderId) {
            try {
              const order = await this.prisma.order.findUnique({
                where: { id: movement.relatedOrderId },
                include: {
                  client: {
                    select: {
                      name: true,
                      email: true
                    }
                  }
                }
              });

              let orderAllowedInTenant = true;
              if (tenantId && order) {
                const orderInTenant = await this.prisma.order.findFirst({
                  where: {
                    id: order.id,
                    cashSession: {
                      Store: {
                        tenantId,
                      },
                    },
                  },
                  select: { id: true },
                });
                if (!orderInTenant) {
                  // No exponer datos de una orden que no corresponde al tenant del usuario
                  orderAllowedInTenant = false;
                }
              }

              if (orderAllowedInTenant && order && order.client) {
                clientInfo = {
                  name: order.client.name || 'Cliente sin nombre',
                  email: order.client.email || '',
                  description: `Orden ${order.orderNumber} - ${movement.description || ''}`
                };
              }
            } catch (error) {
              // Si no se puede obtener la orden, mantener como movimiento interno
              this.logger.warn(`No se pudo obtener información de la orden ${movement.relatedOrderId}`);
            }
          }

          return {
            id: movement.id,
            type: movement.type,
            amount: movement.amount,
            paymentMethod: movement.payment ?? PaymentType.EFECTIVO,
            description: clientInfo.description,
            clientName: clientInfo.name,
            clientEmail: clientInfo.email,
            createdAt: movement.createdAt
          };
        })
      );

      const formattedPaymentMethodMovements = nonCashPaymentMethods.map((pm) => {
        const order = pm.order;

        const serviceDescriptions = (order?.services || [])
          .map((s) => (s.description || s.name || '').trim())
          .filter(Boolean);

        const description = serviceDescriptions.length > 0
          ? serviceDescriptions.join(', ')
          : 'orden de venta';

        return {
          id: pm.id,
          type: MovementType.INCOME,
          amount: pm.amount,
          paymentMethod: pm.type,
          description,
          clientName: order?.client?.name || 'Cliente sin nombre',
          clientEmail: order?.client?.email || '',
          createdAt: pm.createdAt,
        };
      });

      const mergedMovements = [...formattedMovements, ...formattedPaymentMethodMovements]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      return {
        sessionInfo: {
          id: cashSession.id,
          openedAt: cashSession.openedAt,
          openingAmount: cashSession.openingAmount,
          user: cashSession.User,
          store: cashSession.Store,
          status: cashSession.status
        },
        balance: {
          openingAmount: cashSession.openingAmount,
          totalIngresos,
          totalSalidas,
          balanceActual
        },
        movements: mergedMovements
      };

    } catch (error) {
      this.logger.error(`Error al obtener cuadre de caja: ${error.message}`, error.stack);
      
      if (error instanceof NotFoundException || 
          error instanceof ForbiddenException) {
        throw error;
      }
      
      throw new BadRequestException('Error al obtener el cuadre de caja');
    }
  }

  // Métodos existentes actualizados
  findAll(user: AuthUser) {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    return this.prisma.cashMovement.findMany({
      where: {
        CashSession: {
          Store: {
            tenantId,
          },
        },
      },
      include: {
        CashSession: {
          select: {
            id: true,
            openedAt: true,
            User: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async findOne(id: string, user: AuthUser) {
    const movement = await this.prisma.cashMovement.findUnique({
      where: { id },
      include: {
        CashSession: {
          select: {
            id: true,
            openedAt: true,
            User: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            Store: {
              select: {
                tenantId: true,
              },
            },
          }
        },
      },
    });

    if (!movement) {
      throw new NotFoundException('Movimiento no encontrado');
    }

    await this.assertCashSessionAccess(movement.sessionId, user);
    return movement;
  }

  async update(id: string, updateCashMovementDto: UpdateCashMovementDto, user: AuthUser) {
    const movement = await this.prisma.cashMovement.findUnique({
      where: { id },
      select: { sessionId: true },
    });

    if (!movement) {
      throw new NotFoundException('Movimiento no encontrado');
    }

    await this.assertCashSessionAccess(movement.sessionId, user);

    return this.prisma.cashMovement.update({
      where: { id },
      data: updateCashMovementDto,
      include: {
        CashSession: {
          select: {
            id: true,
            openedAt: true,
            User: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });
  }

  async remove(id: string, user: AuthUser) {
    const movement = await this.prisma.cashMovement.findUnique({
      where: { id },
      select: { sessionId: true },
    });

    if (!movement) {
      throw new NotFoundException('Movimiento no encontrado');
    }

    await this.assertCashSessionAccess(movement.sessionId, user);

    return this.prisma.cashMovement.delete({
      where: { id }
    });
  }

  // Método para obtener el propietario de una sesión de caja
  async getSessionOwner(sessionId: string) {
    const cashSession = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
      select: { id: true, UserId: true }
    });
    
    if (!cashSession) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }
    
    return cashSession;
  }

  // Método para obtener movimientos por sesión con paginación
  async findBySession(
    sessionId: string,
    query: ListCashMovementsDto,
    user?: AuthUser,
  ): Promise<ListCashMovementsResponseDto> {
    const { page, pageSize, skip } = getPaginationParams({
      page: query.page,
      pageSize: query.pageSize,
      defaultPage: 1,
      defaultPageSize: 50,
      maxPageSize: 200,
    });

    if (user) {
      console.log('DEBUG SERVICE: User permissions:', user.permissions);
      console.log('DEBUG SERVICE: User role:', user.role);
      console.log('DEBUG SERVICE: User ID:', user.userId);
      
      // Para usuarios con VIEW_ALL_CASH_HISTORY, permitir acceso a cualquier sesión
      if (user.role !== 'ADMIN') {
        const hasAllHistory = user.permissions?.includes('VIEW_ALL_CASH_HISTORY') || false;
        const hasOwnHistory = user.permissions?.includes('VIEW_OWN_CASH_HISTORY') || false;
        
        console.log('DEBUG SERVICE: hasAllHistory:', hasAllHistory);
        console.log('DEBUG SERVICE: hasOwnHistory:', hasOwnHistory);
        
        // Si tiene VIEW_ALL_CASH_HISTORY, no validar ownership
        if (hasAllHistory) {
          console.log('DEBUG SERVICE: Usando VIEW_ALL_CASH_HISTORY - allowAdmin: true');
          // Solo validar tenant y store, no ownership
          await this.assertCashSessionAccess(sessionId, user, { allowAdmin: true, requireOpen: false });
        } 
        // Si tiene VIEW_OWN_CASH_HISTORY, validar ownership
        else if (hasOwnHistory) {
          console.log('DEBUG SERVICE: Usando VIEW_OWN_CASH_HISTORY - allowAdmin: false');
          await this.assertCashSessionAccess(sessionId, user, { allowAdmin: false, requireOpen: false });
        }
        // Si no tiene permisos de historial, validar ownership normal
        else {
          console.log('DEBUG SERVICE: Sin permisos de historial - allowAdmin: false');
          await this.assertCashSessionAccess(sessionId, user, { allowAdmin: false, requireOpen: false });
        }
      } else {
        console.log('DEBUG SERVICE: Usuario ADMIN - allowAdmin: true');
        // Admin siempre tiene acceso
        await this.assertCashSessionAccess(sessionId, user, { allowAdmin: true, requireOpen: false });
      }
    }

    const cashMovementWhere: any = {
      sessionId,
      ...(query.clientName && query.clientName.trim()
        ? {
            order: {
              client: {
                name: { contains: query.clientName.trim(), mode: 'insensitive' },
              },
            },
          }
        : {}),
    };

    if (query.payment) {
      if (query.payment === PaymentType.EFECTIVO) {
        cashMovementWhere.OR = [{ payment: PaymentType.EFECTIVO }, { payment: null }];
      } else {
        cashMovementWhere.payment = query.payment;
      }
    }

    const cashMovements = await this.prisma.cashMovement.findMany({
      where: cashMovementWhere,
      select: {
        id: true,
        type: true,
        amount: true,
        payment: true,
        description: true,
        createdAt: true,
        relatedOrderId: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            client: {
              select: { name: true },
            },
            orderProducts: {
              select: {
                product: {
                  select: {
                    product: {
                      select: { name: true },
                    },
                  },
                },
              },
            },
            services: {
              select: {
                name: true,
                price: true,
              },
            },
            paymentMethods: {
              select: {
                amount: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Nota: antes se mezclaban paymentMethods como pseudo-movimientos para métodos NO EFECTIVO.
    // Ahora que los CashMovement guardan `payment` para todos los métodos, eso genera duplicados.
    // Este endpoint debe devolver únicamente movimientos reales (CashMovement).
    let combinedItems: MovementListItem[] = cashMovements.map((movement) =>
      this.mapCashMovementToListItem(movement),
    );

    if (query.operation) {
      combinedItems = combinedItems.filter((item) => item.operation === query.operation);
    }

    combinedItems = combinedItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = combinedItems.length;
    const paginatedItems = combinedItems.slice(skip, skip + pageSize).map(({ operation, ...rest }) => rest);

    return buildPaginatedResponse(paginatedItems, total, page, pageSize) as ListCashMovementsResponseDto;
  }
}
