import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CreateCashMovementDto, CreateOrderCashMovementDto } from './dto/create-cash-movement.dto';
import { UpdateCashMovementDto } from './dto/update-cash-movement.dto';
import { PrismaService } from '../prisma/prisma.service';
import { MovementType, SessionStatus, PaymentType } from '@prisma/client';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
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

  private async assertCashSessionAccess(cashSessionId: string, user: AuthUser) {
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

    if (user.role !== 'ADMIN') {
      const storeUser = await this.prisma.storeUsers.findFirst({
        where: {
          storeId: cashSession.StoreId,
          userId: user.userId,
        },
        select: { id: true },
      });

      if (!storeUser) {
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
      const cashSession = await this.assertCashSessionAccess(cashSessionId, user);

      if (cashSession.status !== SessionStatus.OPEN) {
        this.logger.warn(`Sesión de caja cerrada: session=${this.mask(cashSessionId)} status=${cashSession.status}`);
        throw new BadRequestException('La sesión de caja está cerrada. No se pueden realizar movimientos.');
      }

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
  async createFromOrder(createOrderCashMovementDto: CreateOrderCashMovementDto, isRefund: boolean = false, userId?: string) {
    const { cashSessionId, amount, orderId, clientId, clientName, clientEmail } = createOrderCashMovementDto;

    this.logger.log(
      `Creando movimiento desde orden: session=${this.mask(cashSessionId)} order=${this.mask(orderId)} amount=${amount} refund=${isRefund}`,
    );

    try {
      // Validar que la sesión exista y esté abierta
      const cashSession = await this.prisma.cashSession.findUnique({
        where: { id: cashSessionId },
        include: {
          User: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      if (!cashSession) {
        this.logger.warn(`Sesión de caja no existe: session=${this.mask(cashSessionId)}`);
        throw new NotFoundException('La sesión de caja especificada no existe');
      }

      if (cashSession.status !== SessionStatus.OPEN) {
        this.logger.warn(`Sesión de caja cerrada: session=${this.mask(cashSessionId)} status=${cashSession.status}`);
        throw new BadRequestException('La sesión de caja está cerrada. No se pueden realizar movimientos.');
      }

      // Determinar el tipo y descripción según si es reembolso o pago
      const movementType = isRefund ? MovementType.EXPENSE : MovementType.INCOME;
      const description = isRefund 
        ? `Reembolso por anulación - Orden ${orderId}`
        : `Pago en efectivo - Orden ${orderId}`;

      // Crear el movimiento
      const finalUserId = userId || cashSession.openedById;
      
      // Verificar que la orden exista antes de crear el movimiento
      if (orderId) {
        const orderExists = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: { id: true }
        });
        if (!orderExists) {
          this.logger.warn(`Orden no existe: order=${this.mask(orderId)}`);
          throw new NotFoundException(`La orden ${orderId} no existe`);
        }
      }
      
      const cashMovement = await this.prisma.cashMovement.create({
        data: {
          sessionId: cashSessionId,        // Campo sessionId
          type: movementType,              // INCOME para pagos, EXPENSE para reembolsos
          amount: amount,
          payment: PaymentType.EFECTIVO,
          description: description,
          relatedOrderId: orderId,         // Campo relacionado con orden
          CashSessionId: cashSessionId,    // FK para CashSession
          UserId: finalUserId   // FK para User - usar userId proporcionado o el que abrió la sesión
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
  async getCashBalance(cashSessionId: string, user?: AuthUser) {
    this.logger.log(`Obteniendo cuadre de caja: session=${this.mask(cashSessionId)}`);

    try {
      if (user) {
        await this.assertCashSessionAccess(cashSessionId, user);
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
        where: { sessionId: cashSessionId },
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
        .reduce((sum, m) => sum + m.amount, 0);

      const totalSalidas = cashOnlyMovements
        .filter(m => m.type === MovementType.EXPENSE)
        .reduce((sum, m) => sum + m.amount, 0);

      const balanceActual = cashSession.openingAmount + totalIngresos - totalSalidas;

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

              if (order && order.client) {
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

  // Método adicional: Obtener movimientos por sesión con paginación
  async findBySession(sessionId: string, page: number = 1, limit: number = 50, user?: AuthUser) {
    const skip = (page - 1) * limit;

    if (user) {
      await this.assertCashSessionAccess(sessionId, user);
    }
    
    // Obtener el total de movimientos para paginación
    const total = await this.prisma.cashMovement.count({
      where: { sessionId }
    });

    // Obtener los movimientos con paginación
    const movements = await this.prisma.cashMovement.findMany({
      where: { sessionId },
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
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: movements,
      total,
      page,
      limit,
      totalPages
    };
  }
}
