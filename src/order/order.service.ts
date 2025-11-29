import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order } from './entities/order.entity';
import { Prisma, SaleStatus, PrismaClient, SessionStatus, PaymentType, MovementType, PaymentSourceType } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { CashMovementService } from '../cash-movement/cash-movement.service';
import { PaymentService } from '../payment/payment.service';

@Injectable()
export class OrderService {
  constructor(
    private prisma: PrismaService,
    private cashMovementService: CashMovementService,
    private paymentService: PaymentService
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

    // Determinar si es ADMIN
    const isAdmin = user?.role === 'ADMIN';

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
          clientIdToUse = existingClient.id; // Usar el ID del cliente existente
        } else {
          // Crear nuevo cliente
          const newClient = await prisma.client.create({
            data: {
              ...clientInfo,
              userId: userId!
            }
          });
          clientIdToUse = newClient.id;
        }
      } else {
        throw new BadRequestException('Se requiere información del cliente');
      }

      // 2. Verificar productos y calcular totales
      const productIds = products?.map(p => p.productId) || [];
      console.log('🔍 Buscando StoreProducts con IDs:', productIds);
      console.log('🔍 Para el userId:', userId);
      console.log('🔍 Es ADMIN:', isAdmin);
      
      // Si es ADMIN, puede ver todos los productos, sino solo los suyos
      const productWhere = isAdmin 
        ? { id: { in: productIds } }  // ADMIN: busca todos los productos con esos IDs
        : { id: { in: productIds }, userId }; // USER: solo busca sus productos
      
      const existingStoreProducts = await prisma.storeProduct.findMany({
        where: productWhere,
        include: {
          product: true
        }
      });

      console.log('🔍 StoreProducts encontrados:', existingStoreProducts.length);
      console.log('🔍 IDs encontrados:', existingStoreProducts.map(sp => sp.id));

      if (existingStoreProducts.length !== productIds.length) {
        const foundIds = existingStoreProducts.map(sp => sp.id);
        const missingIds = productIds.filter(id => !foundIds.includes(id));
        console.log('❌ IDs no encontrados:', missingIds);
        throw new NotFoundException(`Productos no encontrados: ${missingIds.join(', ')}`);
      }

      // 3. Procesar productos
      console.log('Products recibidos en service:', JSON.stringify(products, null, 2));
      let productMap = new Map();
      if (products && products.length > 0) {
        productMap = new Map(products.map(p => [p.productId, { 
          quantity: p.quantity, 
          // Si hay customPrice, lo usamos, de lo contrario usamos el precio del StoreProduct
          price: ('customPrice' in p && p.customPrice !== undefined) ? Number(p.customPrice) : undefined
        }]));
      }
      
      console.log('ProductMap:', Array.from(productMap.entries()));
      
      let totalAmount = 0;
      const orderProductsData: Array<{
        productId: string;
        quantity: number;
        price: number;
      }> = [];

      // Verificar stock y calcular total
      let isPriceModified = false;
      
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
        
        // Verificar si el precio fue modificado
        if (price !== undefined && price !== storeProduct.price) {
          console.log(`⚠️ Precio modificado para producto ${storeProduct.id}: ${storeProduct.price} -> ${price}`);
          isPriceModified = true;
        }
        
        totalAmount += finalPrice * quantity;
        
        orderProductsData.push({
          productId: storeProduct.id, // Usar el ID del StoreProduct
          quantity,
          price: finalPrice
        });
      }

      // Sumar el costo de los servicios
      let servicesData: any[] = [];
      if (services && services.length > 0) {
        servicesData = services.map(service => ({
          name: service.name,
          description: service.description || 'Sin descripción',
          price: service.price,
          type: service.type,
          photoUrls: service.photoUrls || [],
          status: 'IN_PROGRESS' as const,
        }));
        
        totalAmount += servicesData.reduce((sum, service) => sum + service.price, 0);
      }

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
        isPriceModified,
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

      // 7. Actualizar el stock de los productos en tienda
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

      // Retornar la orden para procesar pagos fuera de la transacción
      return {
        order: order as unknown as Order,
        orderProductsData: order.orderProducts,
        servicesData: order.services,
        productsDto: products,
        servicesDto: services,
        clientIdToUse
      };
    }).then(async (result) => {
      // 8. Crear pagos y movimientos de caja FUERA de la transacción
      const { order, orderProductsData, servicesData, productsDto, servicesDto, clientIdToUse } = result;
      
      console.log('💰 Creando pagos y movimientos de caja para la orden:', order.id);
      
      // Crear pagos de productos
      if (productsDto && productsDto.length > 0) {
        for (let i = 0; i < orderProductsData.length; i++) {
          const orderProduct = orderProductsData[i];
          const productDto = productsDto[i];
          
          if (productDto.payments && productDto.payments.length > 0) {
            console.log('📦 Creando pagos para producto:', orderProduct.id);
            
            // Crear pagos
            const paymentData = productDto.payments.map(payment => ({
              type: payment.type as any, // Convertir a tipo de Prisma
              amount: payment.amount,
              sourceType: 'ORDERPRODUCT' as PaymentSourceType,
              sourceId: orderProduct.id
            }));
            
            const createdPayments = await this.paymentService.createPayments(paymentData);
            console.log('✅ Pagos de producto creados:', createdPayments.length);
            
            // Crear movimientos de caja para pagos en efectivo
            const cashPayments = createdPayments.filter(p => p.type === PaymentType.EFECTIVO);
            if (cashPayments.length > 0) {
              console.log('💰 Creando movimientos de caja para pagos en efectivo');
              
              for (const cashPayment of cashPayments) {
                try {
                  await this.cashMovementService.createFromOrder({
                    cashSessionId: cashSessionId,
                    amount: cashPayment.amount,
                    orderId: order.id,
                    clientId: clientIdToUse,
                    clientName: clientInfo?.name,
                    clientEmail: clientInfo?.email
                  }, false, userId); // isRefund: false para ingresos, pasar userId
                  
                  console.log('✅ Movimiento de caja creado:', cashPayment.amount);
                } catch (error) {
                  console.error('❌ Error al crear movimiento de caja:', error.message);
                  // No fallar la creación de la orden si falla el movimiento
                }
              }
            }
          }
        }
      }
      
      // Crear pagos de servicios
      if (servicesDto && servicesDto.length > 0) {
        for (let i = 0; i < servicesData.length; i++) {
          const service = servicesData[i];
          const serviceDto = servicesDto[i];
          
          if (serviceDto.payments && serviceDto.payments.length > 0) {
            console.log('🔧 Creando pagos para servicio:', service.id);
            
            // Crear pagos
            const paymentData = serviceDto.payments.map(payment => ({
              type: payment.type as any, // Convertir a tipo de Prisma
              amount: payment.amount,
              sourceType: 'SERVICE' as PaymentSourceType,
              sourceId: service.id
            }));
            
            const createdPayments = await this.paymentService.createPayments(paymentData);
            console.log('✅ Pagos de servicio creados:', createdPayments.length);
            
            // Crear movimientos de caja para pagos en efectivo
            const cashPayments = createdPayments.filter(p => p.type === PaymentType.EFECTIVO);
            if (cashPayments.length > 0) {
              console.log('💰 Creando movimientos de caja para pagos en efectivo de servicios');
              
              for (const cashPayment of cashPayments) {
                try {
                  await this.cashMovementService.createFromOrder({
                    cashSessionId: cashSessionId,
                    amount: cashPayment.amount,
                    orderId: order.id,
                    clientId: clientIdToUse,
                    clientName: clientInfo?.name,
                    clientEmail: clientInfo?.email
                  }, false, userId); // isRefund: false para ingresos, pasar userId
                  
                  console.log('✅ Movimiento de caja creado para servicio:', cashPayment.amount);
                } catch (error) {
                  console.error('❌ Error al crear movimiento de caja para servicio:', error.message);
                  // No fallar la creación de la orden si falla el movimiento
                }
              }
            }
          }
        }
      }

      return order;
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
