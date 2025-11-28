import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order } from './entities/order.entity';
import { Prisma, SaleStatus, PrismaClient, SessionStatus, PaymentType, MovementType } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { CashMovementService } from '../cash-movement/cash-movement.service';

@Injectable()
export class OrderService {
  constructor(
    private prisma: PrismaService,
    private cashMovementService: CashMovementService
  ) {}

  // Función para generar el número de orden secuencial
  private async generateOrderNumber(): Promise<string> {
  const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);
  const uniqueId = nanoid(); // algo como: 9G7T1KQ2

  const now = new Date();
  const datePart = now.toISOString().slice(0,10).replace(/-/g, ''); // YYYYMMDD

  return `001-${datePart}-${uniqueId}`;
}

  async create(createOrderDto: CreateOrderDto, user?: { userId: string; email: string; role: string }): Promise<Order> {
    const { clientInfo, clientId, products, services, userId, cashSessionId } = createOrderDto;

    // Validar que cashSessionId esté presente
    if (!cashSessionId) {
      throw new BadRequestException('El ID de la sesión de caja es obligatorio');
    }

    return this.prisma.$transaction(async (prisma) => {
      // 0. Validar la sesión de caja
      const cashSession = await prisma.cashSession.findUnique({
        where: { id: cashSessionId },
        include: {
          User: {
            select: {
              id: true,
              email: true,
              name: true
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
        throw new NotFoundException('La sesión de caja especificada no existe');
      }

      // Validar que la sesión esté abierta
      if (cashSession.status !== SessionStatus.OPEN) {
        throw new ConflictException('La sesión de caja está cerrada. No se pueden crear órdenes en sesiones cerradas.');
      }

      // Validar que el usuario que crea la orden pertenezca a la sesión
      if (user && cashSession.UserId !== user.userId) {
        throw new ForbiddenException('No tienes permisos para crear órdenes en esta sesión de caja');
      }

      // 1. Verificar o crear el cliente
      let clientIdToUse = clientId;
      
      if (!clientId && clientInfo) {
        if (!userId) {
          throw new BadRequestException('Se requiere el ID de usuario para crear un cliente');
        }
        
        // Verificar si ya existe un cliente con el mismo DNI, RUC o email
        const existingClient = await prisma.client.findFirst({
          where: {
            OR: [
              { dni: clientInfo.dni },
              { ruc: clientInfo.ruc },
              ...(clientInfo.email ? [{ email: clientInfo.email }] : [])
            ].filter(condition => Object.values(condition)[0] !== undefined), // Solo incluir condiciones definidas
            userId: userId
          },
          select: { 
            id: true,
            dni: true,
            email: true 
          }
        });

        if (existingClient) {
          // Si el email existe pero el DNI es diferente, lanzar un error específico
          if (clientInfo.email && existingClient.email === clientInfo.email && 
              existingClient.dni !== clientInfo.dni) {
            throw new BadRequestException({
              statusCode: 400,
              message: 'El correo electrónico ya está registrado con un DNI diferente',
              error: 'Bad Request',
              code: 'EMAIL_ALREADY_EXISTS'
            });
          }
          
          // Usar el cliente existente
          clientIdToUse = existingClient.id;
        } else {
          try {
            // Crear un nuevo cliente solo si no existe
            const newClient = await prisma.client.create({
              data: {
                ...clientInfo,
                userId: userId,
              },
              select: { id: true }
            });
            clientIdToUse = newClient.id;
          } catch (error) {
            // Capturar error de violación de restricción única
            if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
              throw new BadRequestException({
                statusCode: 400,
                message: 'El correo electrónico ya está registrado',
                error: 'Bad Request',
                code: 'EMAIL_ALREADY_EXISTS'
              });
            }
            throw error; // Relanzar otros errores
          }
        }
      } else if (!clientId) {
        throw new BadRequestException('Se requiere el ID del cliente o la información del cliente');
      }

      if (!clientIdToUse) {
        throw new BadRequestException('No se pudo determinar el ID del cliente');
      }

      if (!userId) {
        throw new BadRequestException('Se requiere el ID de usuario para crear la orden');
      }

      // 2. Verificar que los productos existan y tengan suficiente stock
      const productIds = products.map(p => p.productId);
      const existingStoreProducts = await prisma.storeProduct.findMany({
        where: {
          id: { in: productIds },
        },
        include: {
          product: true,
        },
      });

      if (existingStoreProducts.length !== products.length) {
        const foundIds = new Set(existingStoreProducts.map(p => p.id));
        const missingIds = productIds.filter(id => !foundIds.has(id));
        throw new NotFoundException(`Los siguientes productos en tienda no existen: ${missingIds.join(', ')}`);
      }

      // 3. Calcular el monto total y verificar stock
      console.log('Products recibidos en service:', JSON.stringify(products, null, 2));
      const productMap = new Map(products.map(p => [p.productId, { 
        quantity: p.quantity, 
        // Si hay customPrice, lo usamos, de lo contrario usamos el precio del StoreProduct
        price: ('customPrice' in p && p.customPrice !== undefined) ? Number(p.customPrice) : undefined
      }]));
      
      console.log('ProductMap:', Array.from(productMap.entries()));
      
      let totalAmount = 0;
      const orderProductsData: Array<{
        productId: string;
        quantity: number;
        price: number;
      }> = [];

      // Verificar stock y calcular total
      for (const storeProduct of existingStoreProducts) {
        const productData = productMap.get(storeProduct.id);
        if (!productData) continue;
        
        const { quantity, price } = productData;
        console.log(`Procesando producto ${storeProduct.id}:`, { quantity, price, storeProductPrice: storeProduct.price });
        
        if (storeProduct.stock < quantity) {
          throw new BadRequestException(`No hay suficiente stock para el producto: ${storeProduct.product?.name || storeProduct.id}`);
        }
        
        // Si no se proporcionó un precio personalizado, usar el precio del StoreProduct
        const finalPrice: number = price !== undefined ? price : (storeProduct.price || 0);
        console.log(`Precio final para producto ${storeProduct.id}:`, finalPrice);
        
        totalAmount += finalPrice * quantity;
        
        orderProductsData.push({
          productId: storeProduct.id, // Usar el ID del StoreProduct
          quantity,
          price: finalPrice
        });
      }

      // Sumar el costo de los servicios
      const servicesData = services.map(service => ({
        name: service.name,
        description: service.description || 'Sin descripción',
        price: service.price,
        type: service.type,
        photoUrls: service.photoUrls || [],
        status: 'IN_PROGRESS' as const,
      }));
      
      totalAmount += servicesData.reduce((sum, service) => sum + service.price, 0);

      // 4. Determinar el estado de la orden
      // Si hay servicios, el estado es PENDING, de lo contrario es COMPLETED
      const orderStatus = createOrderDto.services && createOrderDto.services.length > 0 
        ? SaleStatus.PENDING 
        : SaleStatus.COMPLETED;

          // 5. Generar número de orden
      const orderNumber = await this.generateOrderNumber();

      // 6. Crear la orden
      const orderData: Prisma.OrderCreateInput = {
        orderNumber,
        totalAmount,
        status: orderStatus,
        cashSession: {
          connect: { id: cashSessionId }
        },
        user: {
          connect: { id: userId }
        },
        client: {
          connect: { id: clientIdToUse }
        },
        orderProducts: {
          create: orderProductsData
        },
        services: {
          create: servicesData
        }
      };

      const order = await prisma.order.create({
        data: orderData,
        include: {
          orderProducts: true,
          services: true,
        },
      });

      // 5. Actualizar el stock de los productos en tienda
      await Promise.all(
        existingStoreProducts.map(storeProduct => {
          const productData = productMap.get(storeProduct.id);
          if (!productData) return null;
          
          return prisma.storeProduct.update({
            where: { id: storeProduct.id },
            data: { 
              stock: storeProduct.stock - productData.quantity
            },
          });
        }).filter(Boolean) // Filtrar posibles valores nulos
      );

      return order as unknown as Order;
    });
  }

  async findMe(userId: string): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { userId },
      include: {
        orderProducts: true,
        services: true,
        client: true,
      },
      orderBy: { createdAt: 'desc' },
    }) as unknown as Promise<Order[]>;
  }

  async findAll(): Promise<Order[]> {
    return this.prisma.order.findMany({
      include: {
        orderProducts: true,
        services: true,
        client: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }) as unknown as Promise<Order[]>;
  }

  async findOne(id: string, userId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        orderProducts: {
          include: {
            product: {
              include: {
                product: true, // Incluir el producto del catálogo
              },
            },
          },
        },
        services: true,
        client: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Orden con ID ${id} no encontrada`);
    }

    if (order.userId !== userId) {
      throw new NotFoundException(`Orden no encontrada`);
    }

    return order as unknown as Order;
  }

  async cancelOrder(id: string, userId: string, userRole: string, authenticatedUser?: { userId: string; email: string; role: string }): Promise<Order> {
    return this.prisma.$transaction(async (prisma) => {
      // 1. Verificar que la orden existe
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              role: true
            }
          },
          services: true,
          orderProducts: true,
          client: true,
          cashSession: true
        }
      });

      if (!order) {
        throw new NotFoundException(`Orden con ID ${id} no encontrada`);
      }

      // 2. Verificar permisos: Admin puede anular cualquier orden, otros solo sus propias órdenes
      const isAdmin = userRole === 'ADMIN';
      const isOwner = order.userId === userId;
      
      if (!isAdmin && !isOwner) {
        throw new ForbiddenException(`No tiene permisos para anular esta orden`);
      }

      // 3. Verificar si la orden ya está anulada
      if (order.status === 'CANCELLED') {
        throw new BadRequestException('La orden ya está anulada');
      }

      // 4. Obtener todos los pagos en EFECTIVO de la orden
      const allPayments: any[] = [];
      
      // Obtener pagos de orderProducts
      if (order.orderProducts && order.orderProducts.length > 0) {
        console.log('🔍 [OrderService] Buscando pagos en orderProducts:', order.orderProducts.length);
        const orderProductIds = order.orderProducts.map(op => op.id);
        console.log('🔍 [OrderService] OrderProduct IDs:', orderProductIds);
        
        const orderProductPayments = await prisma.payment.findMany({
          where: {
            sourceType: 'ORDERPRODUCT',
            sourceId: { in: orderProductIds }
          }
        });
        
        console.log('🔍 [OrderService] Pagos de orderProducts encontrados:', orderProductPayments.length);
        orderProductPayments.forEach(payment => {
          allPayments.push({
            ...payment,
            sourceType: 'ORDERPRODUCT',
            sourceId: payment.sourceId
          });
        });
      }

      // Obtener pagos de servicios
      if (order.services && order.services.length > 0) {
        console.log('🔍 [OrderService] Buscando pagos en servicios:', order.services.length);
        const serviceIds = order.services.map(s => s.id);
        console.log('🔍 [OrderService] Service IDs:', serviceIds);
        
        const servicePayments = await prisma.payment.findMany({
          where: {
            sourceType: 'SERVICE',
            sourceId: { in: serviceIds }
          }
        });
        
        console.log('🔍 [OrderService] Pagos de servicios encontrados:', servicePayments.length);
        servicePayments.forEach(payment => {
          allPayments.push({
            ...payment,
            sourceType: 'SERVICE',
            sourceId: payment.sourceId
          });
        });
      }

      console.log('🔄 [OrderService] Pagos encontrados para anulación:', allPayments.map(p => ({ type: p.type, amount: p.amount })));

      // 5. Filtrar pagos en EFECTIVO y crear movimientos de caja
      const cashPayments = allPayments.filter(payment => payment.type === PaymentType.EFECTIVO);
      console.log('💰 [OrderService] Pagos en efectivo a reembolsar:', cashPayments.length, cashPayments.map(p => ({ amount: p.amount })));

      console.log('🔍 [OrderService] Información de sesión de caja:', {
        exists: !!order.cashSession,
        sessionId: order.cashSession?.id,
        status: order.cashSession?.status
      });

      if (cashPayments.length > 0 && order.cashSession) {
        // Verificar que la sesión de caja esté abierta
        if (order.cashSession.status !== SessionStatus.OPEN) {
          console.warn('⚠️ [OrderService] La sesión de caja está cerrada, no se pueden crear movimientos de reembolso');
        } else {
          console.log('✅ [OrderService] Sesión abierta, creando movimientos de reembolso...');
          // Crear movimientos de caja de tipo EXPENSE por cada pago en efectivo
          for (const cashPayment of cashPayments) {
            try {
              console.log('🔄 [OrderService] Creando movimiento de reembolso:', {
                cashSessionId: order.cashSession.id,
                amount: cashPayment.amount,
                orderId: order.id,
                clientId: order.client?.id,
                clientName: order.client?.name
              });

              // Usar createFromOrder para obtener datos directamente de la orden
              await this.cashMovementService.createFromOrder({
                cashSessionId: order.cashSession.id,
                amount: cashPayment.amount,
                orderId: order.id,
                clientId: order.client?.id || undefined,
                clientName: order.client?.name || undefined,
                clientEmail: order.client?.email || undefined
              }, true); // isRefund: true para reembolsos

              console.log('✅ [OrderService] Movimiento de reembolso creado:', cashPayment.amount);
            } catch (error) {
              console.error('❌ [OrderService] Error al crear movimiento de reembolso:', error.message);
              console.error('❌ [OrderService] Stack trace:', error.stack);
              // No fallar la cancelación si falla el movimiento
            }
          }
        }
      } else if (cashPayments.length > 0 && !order.cashSession) {
        console.warn('⚠️ [OrderService] La orden no tiene sesión de caja asociada, no se pueden crear movimientos de reembolso');
      } else if (cashPayments.length === 0) {
        console.warn('⚠️ [OrderService] No se encontraron pagos en efectivo para reembolsar');
      }

      // 6. Actualizar el estado de la orden a CANCELLED y registrar auditoría
      const updatedOrder = await prisma.order.update({
        where: { id },
        data: { 
          status: 'CANCELLED',
          // Auditoría de anulación
          canceledAt: new Date(),
          canceledById: userId, // ID del usuario que está anulando
          // Actualizar también la fecha de actualización
          updatedAt: new Date()
        },
        include: {
          orderProducts: true,
          services: true,
          client: true,
          cashSession: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          },
          canceledBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        }
      });

      // 7. Actualizar el estado de los servicios a ANNULLATED si existen
      if (order.services && order.services.length > 0) {
        await Promise.all(
          order.services.map(service => 
            prisma.service.update({
              where: { id: service.id },
              data: { 
                status: 'ANNULLATED',
                updatedAt: new Date()
              }
            })
          )
        );
      }

      // 8. Devolver la orden actualizada
      return updatedOrder as unknown as Order;
    });
  }

  async updateStatus(
    id: string, 
    userId: string,
    updateOrderStatusDto: { status: SaleStatus }
  ): Promise<Order> {
    const { status } = updateOrderStatusDto;

    return this.prisma.$transaction(async (prisma: Prisma.TransactionClient) => {
      // 1. Verificar que la orden existe y pertenece al usuario
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              role: true
            }
          }
        }
      });

      if (!order) {
        throw new NotFoundException(`Orden con ID ${id} no encontrada`);
      }

      // Solo el propietario o un administrador pueden actualizar el estado
      if (order.userId !== userId && order.user.role !== 'ADMIN') {
        throw new NotFoundException(`No tiene permisos para actualizar esta orden`);
      }

      // 2. Actualizar el estado de la orden
      const updatedOrder = await prisma.order.update({
        where: { id },
        data: { 
          status
        },
        include: { orderProducts: true, services: true, client: true }
      });

      return updatedOrder as unknown as Order;
    });
  }
}
