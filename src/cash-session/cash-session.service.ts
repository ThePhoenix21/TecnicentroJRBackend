import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { CreateCashSessionDto } from './dto/create-cash-session.dto';
import { UpdateCashSessionDto } from './dto/update-cash-session.dto';
import { PrismaService } from '../prisma/prisma.service';
import { User, SessionStatus } from '@prisma/client';

@Injectable()
export class CashSessionService {
  private readonly logger = new Logger(CashSessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(createCashSessionDto: CreateCashSessionDto, user: { userId: string; email: string; role: string }) {
    console.log('Usuario recibido en servicio:', user);
    console.log('ID del usuario:', user?.userId);
    console.log('Email del usuario:', user?.email);
    
    const { storeId, openingAmount = 0.00 } = createCashSessionDto;
    
    this.logger.log(`Iniciando creación de sesión de caja para usuario: ${user.email} en tienda: ${storeId}`);

    try {
      // 1. Verificar que la tienda exista
      const store = await this.prisma.store.findUnique({
        where: { id: storeId }
      });
      
      if (!store) {
        this.logger.error(`Tienda no encontrada con ID: ${storeId}`);
        throw new NotFoundException('La tienda especificada no existe');
      }
      
      this.logger.debug(`Tienda encontrada: ${store.name} (ID: ${storeId})`);

      // 2. Validar que el usuario pertenezca a esa tienda (StoreUsers)
      const storeUser = await this.prisma.storeUsers.findFirst({
        where: {
          storeId: storeId,
          userId: user.userId
        }
      });

      if (!storeUser) {
        this.logger.warn(`Usuario ${user.email} no pertenece a la tienda ${storeId}`);
        throw new ForbiddenException('No tienes permisos para crear sesiones en esta tienda');
      }

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

      // 4. Validar que no haya una sesión abierta para esa tienda
      const existingStoreOpenSession = await this.prisma.cashSession.findFirst({
        where: {
          StoreId: storeId,
          status: SessionStatus.OPEN
        }
      });

      if (existingStoreOpenSession) {
        this.logger.warn(`Ya existe una sesión abierta para la tienda ${storeId}: ${existingStoreOpenSession.id}`);
        throw new ConflictException('Ya hay una sesión de caja abierta para esta tienda');
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

  findAll() {
    return this.prisma.cashSession.findMany({
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

  findOne(id: string) {
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

  update(id: string, updateCashSessionDto: UpdateCashSessionDto) {
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

  remove(id: string) {
    return this.prisma.cashSession.delete({
      where: { id }
    });
  }

  // Método adicional para obtener sesiones por tienda con paginación
  async findByStore(storeId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    // Obtener el total de sesiones para paginación
    const total = await this.prisma.cashSession.count({
      where: { StoreId: storeId }
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
            phone: true
          }
        },
        User: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { openedAt: 'desc' },
      skip,
      take: limit
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: sessions,
      total,
      page,
      limit,
      totalPages
    };
  }

  // Método para obtener la sesión abierta actual de una tienda
  async findOpenSessionByStore(storeId: string) {
    
    const session = await this.prisma.cashSession.findFirst({
      where: {
        StoreId: storeId,
        status: SessionStatus.OPEN
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
    return session;
  }

  // Método para cerrar una sesión de caja
  async close(id: string, closedById: string, closingAmount: number, declaredAmount: number) {
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

  async getClosingReport(sessionId: string) {
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
    const openedByUser = await this.prisma.user.findUnique({
      where: { id: session.openedById },
      select: { name: true },
    });

    const closedByUser = session.closedById
      ? await this.prisma.user.findUnique({
          where: { id: session.closedById },
          select: { name: true },
        })
      : null;

    // 3. Obtener órdenes y sus items
    const orders = await this.prisma.order.findMany({
      where: { cashSessionsId: sessionId },
      include: {
        paymentMethods: true,
        orderProducts: {
          include: {
            product: {
              include: {
                product: true,
              },
            },
          },
        },
        services: {
          include: {
            order: true,
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
      const orderNumberShort = order.orderNumber.slice(-4);

      const orderPayments = paymentsByOrderId.get(order.id) || [];
      const orderPaymentMethods = orderPayments.length > 0
        ? [...new Set(orderPayments.map((p) => p.type))].join(', ')
        : 'SIN PAGO';

      // Procesar Productos
      for (const op of order.orderProducts) {
        const paymentMethods = orderPaymentMethods;

        // Estado orden
        let statusShort = 'PEN';
        if (order.status === 'COMPLETED') statusShort = 'COM';
        if (order.status === 'CANCELLED') statusShort = 'ANU';

        items.push({
          orderNumber: orderNumberShort,
          quantity: op.quantity,
          description: op.product.product.name,
          paymentMethod: paymentMethods,
          price: op.price * op.quantity,
          status: statusShort,
        });
      }

      // Procesar Servicios
      for (const svc of order.services) {
        const paymentMethods = orderPaymentMethods;

        // En nuevo esquema, el pago está a nivel de orden: mostramos el precio del servicio
        const price = svc.price;

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
          price: price,
          status: statusShort,
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
        paymentSummary[type] = (paymentSummary[type] || 0) + amount;
      });
    }

    // 7. Obtener Gastos (Expenses)
    const expenses = await this.prisma.cashMovement.findMany({
      where: {
        CashSessionId: sessionId, // Nota: Schema usa CashSessionId
        type: 'EXPENSE',
      },
      select: {
        id: true,
        amount: true,
        description: true,
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
      difference: (session.declaredAmount || 0) - (session.closingAmount || 0),
      storeName: session.Store.name,
      storeAddress: session.Store.address,
      storePhone: session.Store.phone,
      printedAt: new Date(),
      orders: items,
      paymentSummary,
      expenses: expenses.map((e) => ({
        description: e.description,
        amount: e.amount,
        time: e.createdAt,
      })),
    };
  }
}
