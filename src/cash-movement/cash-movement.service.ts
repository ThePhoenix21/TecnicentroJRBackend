import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CreateCashMovementDto, CreateOrderCashMovementDto } from './dto/create-cash-movement.dto';
import { UpdateCashMovementDto } from './dto/update-cash-movement.dto';
import { PrismaService } from '../prisma/prisma.service';
import { MovementType, SessionStatus } from '@prisma/client';
import { User } from '@prisma/client';

@Injectable()
export class CashMovementService {
  private readonly logger = new Logger(CashMovementService.name);

  constructor(private readonly prisma: PrismaService) {}

  // 1. Crear movimiento manual (fuera de órdenes)
  async createManual(createCashMovementDto: CreateCashMovementDto, user: { userId: string; email: string; role: string }) {
    const { cashSessionId, amount, type, description, orderId, clientId } = createCashMovementDto;
    
    console.log(' [CashMovementService] Creando movimiento manual:', {
      user: user.email,
      cashSessionId,
      amount,
      type,
      description,
      orderId,
      clientId
    });
    
    this.logger.log(`Creando movimiento manual para usuario: ${user.email} - Sesión: ${cashSessionId} - Monto: ${amount}`);

    try {
      // Validar que la sesión de caja exista y esté abierta
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

      console.log(' [CashMovementService] Sesión encontrada:', {
        exists: !!cashSession,
        status: cashSession?.status,
        openedById: cashSession?.openedById
      });

      if (!cashSession) {
        console.error(' [CashMovementService] La sesión de caja no existe:', cashSessionId);
        throw new NotFoundException('La sesión de caja especificada no existe');
      }

      if (cashSession.status !== SessionStatus.OPEN) {
        console.error(' [CashMovementService] La sesión de caja está cerrada:', cashSessionId, cashSession.status);
        throw new BadRequestException('La sesión de caja está cerrada. No se pueden realizar movimientos.');
      }

      console.log(' [CashMovementService] Sesión validada, creando movimiento...');

      // Crear el movimiento
      const cashMovement = await this.prisma.cashMovement.create({
        data: {
          sessionId: cashSessionId,
          type: type,
          amount: amount,
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

      console.log('✅ [CashMovementService] Movimiento creado exitosamente:', {
        id: cashMovement.id,
        amount: cashMovement.amount,
        type: cashMovement.type,
        sessionId: cashMovement.sessionId,
        relatedOrderId: cashMovement.relatedOrderId,
        UserId: cashMovement.UserId
      });

      this.logger.log(`Movimiento manual creado exitosamente: ${cashMovement.id}`);

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
    
    console.log('🔄 [CashMovementService] Creando movimiento desde orden:', {
      cashSessionId,
      amount,
      orderId,
      clientId,
      clientName,
      clientEmail,
      isRefund,
      userId
    });

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
        console.error('❌ [CashMovementService] La sesión de caja no existe:', cashSessionId);
        throw new NotFoundException('La sesión de caja especificada no existe');
      }

      if (cashSession.status !== SessionStatus.OPEN) {
        console.error('❌ [CashMovementService] La sesión de caja está cerrada:', cashSessionId, cashSession.status);
        throw new BadRequestException('La sesión de caja está cerrada. No se pueden realizar movimientos.');
      }

      console.log('✅ [CashMovementService] Sesión validada, usuario de sesión:', cashSession.User?.id);
      console.log('🔍 [CashMovementService] UserId a usar:', userId || cashSession.openedById);

      // Determinar el tipo y descripción según si es reembolso o pago
      const movementType = isRefund ? MovementType.EXPENSE : MovementType.INCOME;
      const description = isRefund 
        ? `Reembolso por anulación - Orden ${orderId}`
        : `Pago en efectivo - Orden ${orderId}`;

      // Crear el movimiento
      const finalUserId = userId || cashSession.openedById;
      console.log('🔍 [CashMovementService] UserId final para CashMovement:', finalUserId);
      
      // Verificar que la orden exista antes de crear el movimiento
      if (orderId) {
        console.log('🔍 [CashMovementService] Verificando existencia de orden:', orderId);
        const orderExists = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: { id: true }
        });
        console.log('🔍 [CashMovementService] Orden existe:', !!orderExists);
        if (!orderExists) {
          console.error('❌ [CashMovementService] La orden no existe:', orderId);
          throw new NotFoundException(`La orden ${orderId} no existe`);
        }
      }
      
      const cashMovement = await this.prisma.cashMovement.create({
        data: {
          sessionId: cashSessionId,        // Campo sessionId
          type: movementType,              // INCOME para pagos, EXPENSE para reembolsos
          amount: amount,
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

      console.log('✅ [CashMovementService] Movimiento creado exitosamente:', {
        id: cashMovement.id,
        amount: cashMovement.amount,
        type: cashMovement.type,
        sessionId: cashMovement.sessionId,
        relatedOrderId: cashMovement.relatedOrderId,
        UserId: cashMovement.UserId
      });

      this.logger.log(`Movimiento desde orden creado exitosamente: ${cashMovement.id}`);

      return cashMovement;

    } catch (error) {
      console.error('❌ [CashMovementService] Error al crear movimiento:', error.message);
      this.logger.error(`Error al crear movimiento desde orden: ${error.message}`, error.stack);
      
      if (error instanceof NotFoundException || 
          error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException('Error al crear el movimiento de caja desde orden');
    }
  }

  // 3. Obtener cuadre de caja
  async getCashBalance(cashSessionId: string, user?: { userId: string; email: string; role: string }) {
    console.log('🔄 [CashMovementService] Obteniendo cuadre de caja para sesión:', cashSessionId);
    this.logger.log(`Obteniendo cuadre de caja para sesión: ${cashSessionId}`);

    try {
      // Validar que la sesión exista
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
              name: true
            }
          }
        }
      });

      if (!cashSession) {
        console.error('❌ [CashMovementService] La sesión de caja no existe:', cashSessionId);
        throw new NotFoundException('La sesión de caja especificada no existe');
      }

      console.log('✅ [CashMovementService] Sesión encontrada:', {
        id: cashSession.id,
        status: cashSession.status,
        openingAmount: cashSession.openingAmount
      });

      // Si se proporciona usuario, validar que tenga acceso
      if (user && cashSession.UserId !== user.userId && user.role !== 'ADMIN') {
        console.error('❌ [CashMovementService] Usuario sin permisos:', user.userId, 'para sesión:', cashSessionId);
        throw new ForbiddenException('No tienes permisos para ver esta sesión de caja');
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

      console.log('📊 [CashMovementService] Movimientos encontrados:', cashMovements.length);
      console.log('📊 [CashMovementService] Detalle de movimientos:', cashMovements.map(m => ({
        id: m.id,
        type: m.type,
        amount: m.amount,
        description: m.description,
        relatedOrderId: m.relatedOrderId,
        createdAt: m.createdAt
      })));

      // Calcular totales
      const totalIngresos = cashMovements
        .filter(m => m.type === MovementType.INCOME)
        .reduce((sum, m) => sum + m.amount, 0);

      const totalSalidas = cashMovements
        .filter(m => m.type === MovementType.EXPENSE)
        .reduce((sum, m) => sum + m.amount, 0);

      const balanceActual = cashSession.openingAmount + totalIngresos - totalSalidas;

      console.log('💰 [CashMovementService] Balance calculado:', {
        openingAmount: cashSession.openingAmount,
        totalIngresos,
        totalSalidas,
        balanceActual
      });

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
            description: clientInfo.description,
            clientName: clientInfo.name,
            clientEmail: clientInfo.email,
            createdAt: movement.createdAt
          };
        })
      );

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
        movements: formattedMovements
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
  findAll() {
    return this.prisma.cashMovement.findMany({
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

  findOne(id: string) {
    return this.prisma.cashMovement.findUnique({
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
                email: true
              }
            }
          }
        }
      }
    });
  }

  update(id: string, updateCashMovementDto: UpdateCashMovementDto) {
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

  remove(id: string) {
    return this.prisma.cashMovement.delete({
      where: { id }
    });
  }

  // Método adicional: Obtener movimientos por sesión con paginación
  async findBySession(sessionId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    
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
