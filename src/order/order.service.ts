import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CompleteOrderDto } from './dto/complete-order.dto';
import { Order } from './entities/order.entity';
import { Prisma, SaleStatus, SessionStatus, PaymentType, ServiceStatus, InventoryMovementType } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { CashMovementService } from '../cash-movement/cash-movement.service';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
};

@Injectable()
export class OrderService {
  constructor(
    private prisma: PrismaService,
    private cashMovementService: CashMovementService,
  ) {}

  private async assertStoreAccess(storeId: string, user: AuthUser) {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        tenantId: true,
      },
    });

    if (!store) {
      throw new NotFoundException('Tienda no encontrada');
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

  private async assertOrderAccess(orderId: string, user: AuthUser) {
    const tenantId = user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        cashSession: {
          include: {
            Store: {
              select: {
                id: true,
                tenantId: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    const storeTenantId = order.cashSession?.Store?.tenantId;
    if (!storeTenantId || storeTenantId !== tenantId) {
      throw new ForbiddenException('No tienes permisos para acceder a esta orden');
    }

    if (user.role !== 'ADMIN') {
      const storeId = order.cashSession?.StoreId;
      if (!storeId) {
        throw new ForbiddenException('No tienes permisos para acceder a esta orden');
      }

      const storeUser = await this.prisma.storeUsers.findFirst({
        where: {
          storeId,
          userId: user.userId,
        },
        select: { id: true },
      });

      if (!storeUser) {
        throw new ForbiddenException('No tienes permisos para acceder a esta orden');
      }
    }

    return order;
  }

  // Función para generar el número de orden secuencial
  private async generateOrderNumber(storeCode: number): Promise<string> {
  const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);
  const uniqueId = nanoid(); // algo como: 9G7T1KQ2

  const now = new Date();
  const datePart = now.toISOString().slice(0,10).replace(/-/g, ''); // YYYYMMDD

  // Usar el código de la tienda formateado a 3 dígitos
  const prefix = storeCode.toString().padStart(3, '0');

  return `${prefix}-${datePart}-${uniqueId}`;
}

  async create(createOrderDto: CreateOrderDto, user?: AuthUser): Promise<Order> {
    const { clientInfo, clientId, products, services, userId, cashSessionId, paymentMethods } = createOrderDto;

    // Validar que cashSessionId esté presente
    if (!cashSessionId) {
      throw new BadRequestException('El ID de la sesión de caja es obligatorio');
    }

    // Determinar si es ADMIN
    const isAdmin = user?.role === 'ADMIN';

    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    return this.prisma.$transaction(async (prisma) => {
      // 0. Validar la sesión de caja
      const cashSession = await prisma.cashSession.findUnique({
        where: { id: cashSessionId },
        include: {
          Store: {
            select: {
              id: true,
              tenantId: true,
            },
          },
          User: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        }
      });

      if (!cashSession) {
        throw new NotFoundException('La sesión de caja especificada no existe');
      }

      if (!cashSession.Store?.tenantId || cashSession.Store.tenantId !== user.tenantId) {
        throw new ForbiddenException('No tienes permisos para crear órdenes en esta sesión de caja');
      }


      // Validar que la sesión esté abierta
      if (cashSession.status !== SessionStatus.OPEN) {
        throw new ConflictException('La sesión de caja está cerrada. No se pueden crear órdenes en sesiones cerradas.');
      }

      // Regla de acceso a la sesión de caja:
      // - ADMIN: puede crear órdenes en cualquier sesión abierta dentro de su tenant.
      // - USER: solo puede crear órdenes si pertenece a la tienda de la sesión.
      if (!isAdmin) {
        const storeUser = await prisma.storeUsers.findFirst({
          where: {
            storeId: cashSession.StoreId,
            userId: user.userId,
          },
          select: { id: true },
        });

        if (!storeUser) {
          throw new ForbiddenException('No tienes permisos para crear órdenes en esta sesión de caja');
        }
      }

      // 1. Verificar o crear el cliente
      let clientIdToUse = clientId;
      
      if (!clientId && clientInfo) {
        if (!userId) {
          throw new BadRequestException('Se requiere el ID de usuario para crear un cliente');
        }

        // 1) Si hay email, buscar primero por email SIN filtrar por userId
        //    para evitar violar la restricción única en email.
        let existingClientByEmail: { id: string; dni: string | null; email: string | null; user: { tenantId: string | null } } | null = null;
        if (clientInfo.email) {
          existingClientByEmail = await prisma.client.findFirst({
            where: { email: clientInfo.email },
            select: {
              id: true,
              dni: true,
              email: true,
              user: {
                select: {
                  tenantId: true,
                },
              },
            },
          });
        }

        if (existingClientByEmail) {
          if (!existingClientByEmail.user?.tenantId || existingClientByEmail.user.tenantId !== user.tenantId) {
            throw new BadRequestException({
              statusCode: 400,
              message: 'El correo electrónico ya está registrado en otra empresa',
              error: 'Bad Request',
              code: 'EMAIL_ALREADY_EXISTS_OTHER_TENANT',
            });
          }

          // Si el email ya existe pero el DNI es diferente, lanzar error claro
          if (
            clientInfo.dni &&
            existingClientByEmail.dni &&
            existingClientByEmail.dni !== clientInfo.dni
          ) {
            throw new BadRequestException({
              statusCode: 400,
              message: 'El correo electrónico ya está registrado con un DNI diferente',
              error: 'Bad Request',
              code: 'EMAIL_ALREADY_EXISTS',
            });
          }

          // Reutilizar cliente existente por email
          clientIdToUse = existingClientByEmail.id;
        } else {
          // 2) Si no hay cliente por email, buscar por DNI/RUC para este usuario
          const existingClient = await prisma.client.findFirst({
            where: {
              OR: [
                { dni: clientInfo.dni },
                { ruc: clientInfo.ruc },
              ].filter((condition) => Object.values(condition)[0] !== undefined), // Solo incluir condiciones definidas
              userId: userId,
            },
            select: {
              id: true,
              dni: true,
              email: true,
            },
          });

          if (existingClient) {
            clientIdToUse = existingClient.id; // Usar el ID del cliente existente por DNI/RUC
          } else {
            // 3) Crear nuevo cliente (email garantizado único a este punto)
            const newClient = await prisma.client.create({
              data: {
                ...clientInfo,
                userId: userId!,
              },
            });
            clientIdToUse = newClient.id;
          }
        }
      } else {
        throw new BadRequestException('Se requiere información del cliente');
      }

      // 2. Verificar productos y calcular totales
      const productIds = products?.map(p => p.productId) || [];
      console.log('🔍 Buscando StoreProducts con IDs:', productIds);
      console.log('🔍 Para el userId:', userId);
      console.log('🔍 Es ADMIN:', isAdmin);
      console.log('🔍 StoreId de la sesión de caja:', cashSession.StoreId);
      
      // Regla de acceso a productos en tienda:
      // - ADMIN: puede usar cualquier StoreProduct por ID.
      // - USER: ya se validó que pertenece a la tienda de la sesión,
      //         así que puede usar cualquier StoreProduct de ESA tienda,
      //         independientemente de su userId (propietario).
      const productWhere = isAdmin
        ? {
            id: { in: productIds },
            store: {
              tenantId: user.tenantId,
            },
          }
        : { id: { in: productIds }, storeId: cashSession.StoreId };
      
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
          description: service.description || '',
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

      // 5. Calcular número de tienda según orden de creación
      // Se obtienen todas las tiendas ordenadas por createdAt y se busca el índice de la tienda de la sesión
      const stores = await prisma.store.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true }
      });

      const storeIndex = stores.findIndex((s) => s.id === cashSession.StoreId);
      const storeNumber = storeIndex >= 0 ? storeIndex + 1 : 1; // 1 para primera tienda, 2 para segunda, etc.

      // 6. Generar número de orden con prefijo 001/002/... usando storeNumber
      const orderNumber = await this.generateOrderNumber(storeNumber);

      // 7. Crear la orden
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
        },
        paymentMethods: {
          create: (paymentMethods || []).map((pm) => ({
            type: pm.type as any,
            amount: pm.amount,
          })),
        },
      };

      const order = await prisma.order.create({
        data: orderData,
        include: {
          orderProducts: true,
          services: true,
          paymentMethods: true,
        },
      });

      // 7. Actualizar el stock de los productos en tienda y registrar movimientos
      await Promise.all(
        existingStoreProducts.map(storeProduct => {
          const productData = productMap.get(storeProduct.id);
          if (!productData) return null;
          
          // Actualizar stock
          const updateStock = prisma.storeProduct.update({
            where: { id: storeProduct.id },
            data: { 
              stock: storeProduct.stock - productData.quantity
            },
          });

          // Crear movimiento de inventario
          const createMovement = prisma.inventoryMovement.create({
            data: {
              type: InventoryMovementType.SALE,
              quantity: -productData.quantity, // Cantidad negativa para salida
              description: "Movimiento por venta automática",
              storeProductId: storeProduct.id,
              userId: userId,
              orderId: order.id
            }
          });

          return Promise.all([updateStock, createMovement]);
        }).filter(Boolean) // Filtrar posibles valores nulos
      );

      // Retornar la orden para procesar pagos fuera de la transacción
      return {
        order: order as unknown as Order,
        orderProductsData: order.orderProducts,
        servicesData: order.services,
        productsDto: products,
        servicesDto: services,
        clientIdToUse,
        paymentMethodsDto: paymentMethods,
      };
    }).then(async (result) => {
      // 8. Crear pagos y movimientos de caja FUERA de la transacción
      const { order, clientIdToUse, paymentMethodsDto } = result;
      
      console.log('💰 Creando pagos y movimientos de caja para la orden:', order.id);

      const cashPayments = (paymentMethodsDto || []).filter((pm) => pm.type === PaymentType.EFECTIVO && (pm.amount || 0) > 0);
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
            }, false, userId);

            console.log('✅ Movimiento de caja creado:', cashPayment.amount);
          } catch (error) {
            console.error('❌ Error al crear movimiento de caja:', error.message);
          }
        }
      }

      // Usar el método reutilizable para obtener la orden completa con detalles
      return this.getOrderWithDetails(order.id, user);
    });
  }

  async findMe(userId: string, user: AuthUser): Promise<Order[]> {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    // Si es ADMIN puede consultar cualquier usuario dentro de su tenant.
    // Si es USER solo puede consultar su propio historial.
    if (user.role !== 'ADMIN' && user.userId !== userId) {
      throw new ForbiddenException('No tienes permisos para ver órdenes de otro usuario');
    }

    return this.prisma.order.findMany({
      where: {
        userId,
        cashSession: {
          Store: {
            tenantId,
          },
        },
      },
      include: {
        orderProducts: true,
        services: true,
        client: true,
      },
      orderBy: { createdAt: 'desc' },
    }) as unknown as Promise<Order[]>;
  }

  async findAll(user: AuthUser): Promise<Order[]> {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    return this.prisma.order.findMany({
      where: {
        cashSession: {
          Store: {
            tenantId,
          },
        },
      },
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

  async findByStore(storeId: string, user: AuthUser): Promise<Order[]> {
    await this.assertStoreAccess(storeId, user);

    return this.prisma.order.findMany({
      where: {
        cashSession: {
          StoreId: storeId
        }
      },
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
        cashSession: {
          include: {
            Store: true
          }
        },
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

  async findOne(id: string, user: AuthUser): Promise<Order> {
    await this.assertOrderAccess(id, user);

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
        cashSession: {
          include: {
            Store: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Orden con ID ${id} no encontrada`);
    }

    return order as unknown as Order;
  }

  async cancelOrder(id: string, userId: string, userRole: string, authenticatedUser?: AuthUser): Promise<Order> {
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
          paymentMethods: true,
          client: true,
          cashSession: {
            include: {
              Store: {
                select: {
                  tenantId: true,
                },
              },
            },
          }
        }
      });

      if (!order) {
        throw new NotFoundException(`Orden con ID ${id} no encontrada`);
      }

      if (authenticatedUser) {
        const tenantId = authenticatedUser?.tenantId;

        if (!tenantId) {
          throw new ForbiddenException('Tenant no encontrado en el token');
        }

        const orderTenantId = order.cashSession?.Store?.tenantId;
        if (!orderTenantId || orderTenantId !== tenantId) {
          throw new ForbiddenException('No tienes permisos para anular esta orden');
        }

        if (authenticatedUser.role !== 'ADMIN') {
          const storeId = order.cashSession?.StoreId;
          if (!storeId) {
            throw new ForbiddenException('No tienes permisos para anular esta orden');
          }

          const storeUser = await prisma.storeUsers.findFirst({
            where: {
              storeId,
              userId: authenticatedUser.userId,
            },
            select: { id: true },
          });

          if (!storeUser) {
            throw new ForbiddenException('No tienes permisos para anular esta orden');
          }
        }
      }

      // 2. Verificar permisos: Admin puede anular cualquier orden, otros solo sus propias órdenes
      const isAdmin = userRole === 'ADMIN';
      const isOwner = order.userId === userId;
      
      if (!isAdmin && !isOwner) {
        throw new ForbiddenException(`No tiene permisos para anular esta orden`);
      }

      // 3. Verificar si la orden ya está anulada
      if (order.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('La orden ya está anulada');
      }

      // 4. Filtrar pagos en EFECTIVO (PaymentMethod) y crear movimientos de caja
      const cashPayments = (order.paymentMethods || []).filter((pm) => pm.type === PaymentType.EFECTIVO && (pm.amount || 0) > 0);
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

      // 5. Devolver stock de productos y registrar movimientos de inventario
      if (order.orderProducts && order.orderProducts.length > 0) {
        await Promise.all(
          order.orderProducts.map((op) =>
            Promise.all([
              prisma.storeProduct.update({
                where: { id: op.productId },
                data: {
                  stock: { increment: op.quantity },
                },
              }),
              prisma.inventoryMovement.create({
                data: {
                  type: InventoryMovementType.RETURN,
                  quantity: op.quantity, // Cantidad positiva para devolver al stock
                  description: 'Devolución por anulación de orden',
                  storeProductId: op.productId,
                  userId: userId,
                  orderId: order.id,
                },
              }),
            ]),
          ),
        );
      }

      // 6. Actualizar el estado de la orden a CANCELLED y registrar auditoría
      const updatedOrder = await prisma.order.update({
        where: { id },
        data: { 
          status: SaleStatus.CANCELLED,
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
                status: ServiceStatus.ANNULLATED,
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

  // Método auxiliar para obtener la orden con todos los detalles necesarios para la respuesta (PDF, pagos, etc.)
  async getOrderWithDetails(orderId: string, user: AuthUser): Promise<Order> {
    await this.assertOrderAccess(orderId, user);

    // Obtener la orden completa
    const completeOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderProducts: {
          include: {
            product: {
              include: {
                product: true
              }
            }
          }
        },
        services: true,
        paymentMethods: true,
        client: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        cashSession: {
          include: {
            Store: true
          }
        }
      }
    });

    // Validar que la orden exista
    if (!completeOrder) {
      throw new NotFoundException('Orden no encontrada');
    }

    const orderWithPayments = completeOrder;

    // Agregar información adicional para PDF
    const pdfInfo = {
      businessName: 'Tecnicentro JR',
      address: completeOrder.cashSession?.Store?.address || 'Dirección no disponible',
      phone: completeOrder.cashSession?.Store?.phone || 'Teléfono no disponible',
      currentDate: new Date(completeOrder.createdAt).toLocaleDateString('es-PE'),
      currentTime: new Date(completeOrder.createdAt).toLocaleTimeString('es-PE'),
      orderNumber: completeOrder.orderNumber,
      sellerName: completeOrder.user?.name || 'Vendedor no identificado',
      clientName: completeOrder.client?.name || 'Cliente no identificado',
      clientDni: completeOrder.client?.dni || 'N/A',
      clientPhone: completeOrder.client?.phone || 'N/A',
      paidAmount: (completeOrder.paymentMethods || []).reduce((sum, pm) => sum + pm.amount, 0)
    };

    return {
      ...orderWithPayments,
      pdfInfo
    } as unknown as Order;
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

  async completeOrder(completeOrderDto: CompleteOrderDto, user?: AuthUser): Promise<Order> {
    const { orderId, services } = completeOrderDto;

    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    await this.assertOrderAccess(orderId, user);

    return this.prisma.$transaction(async (prisma) => {
      // 1. Obtener la orden con todos sus datos
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          services: true,
          orderProducts: true,
          client: true,
          cashSession: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        }
      });

      if (!order) {
        throw new NotFoundException('La orden especificada no existe');
      }

      // 2. Validar que la orden esté en estado PENDING
      if (order.status !== SaleStatus.PENDING) {
        throw new BadRequestException('La orden ya está completada o cancelada');
      }

      // 3. Validar que los servicios existan en la orden
      const servicesMap = new Map(order.services.map(s => [s.id, s]));
      
      for (const servicePayment of services) {
        const service = servicesMap.get(servicePayment.serviceId);
        if (!service) {
          throw new NotFoundException(`El servicio ${servicePayment.serviceId} no existe en la orden`);
        }
      }

      // 4. Procesar pagos (permite pagos parciales sin validar estado de servicios)
      console.log('💰 Procesando pagos para servicios:', services.length);

      const newPaymentMethods: Array<{ type: PaymentType; amount: number }> = [];
      for (const servicePayment of services) {
        for (const payment of (servicePayment.payments || [])) {
          newPaymentMethods.push({
            type: payment.type as unknown as PaymentType,
            amount: payment.amount,
          });
        }
      }

      if (newPaymentMethods.length > 0) {
        await prisma.paymentMethod.createMany({
          data: newPaymentMethods.map((pm) => ({
            orderId,
            type: pm.type,
            amount: pm.amount,
          })),
        });
      }

      const cashPayments = newPaymentMethods.filter((pm) => pm.type === PaymentType.EFECTIVO && (pm.amount || 0) > 0);
      if (cashPayments.length > 0) {
        console.log('💰 Creando movimientos de caja para pagos en efectivo');

        for (const cashPayment of cashPayments) {
          try {
            await this.cashMovementService.createFromOrder({
              cashSessionId: order.cashSession?.id || '',
              amount: cashPayment.amount,
              orderId: order.id,
              clientId: order.clientId,
              clientName: order.client?.name || undefined,
              clientEmail: order.client?.email || undefined
            }, false, user?.userId);

            console.log('✅ Movimiento de caja creado para servicio:', cashPayment.amount);
          } catch (error) {
            console.error('❌ Error al crear movimiento de caja para servicio:', error.message);
          }
        }
      }

      // 5. Calcular totales para determinar si la orden puede completarse
      const totalOwed = order.services.reduce((sum, s) => sum + (s.price || 0), 0)
        + order.orderProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0);

      const existingPaymentMethods = await prisma.paymentMethod.findMany({
        where: { orderId },
        select: { amount: true }
      });

      const totalPaid = existingPaymentMethods.reduce((sum, pm) => sum + pm.amount, 0);
      
      console.log('💰 Estado financiero:', { totalOwed, totalPaid, balance: totalPaid - totalOwed });

      // 6. Evaluar estados de servicios para determinar estado final de la orden
      const allServicesCompleted = order.services.every(s => s.status === ServiceStatus.COMPLETED);
      const allServicesAnnulled = order.services.every(s => s.status === ServiceStatus.ANNULLATED);
      const hasSomeCompletedServices = order.services.some(s => s.status === ServiceStatus.COMPLETED);
      
      let newStatus: SaleStatus = SaleStatus.PENDING; // Valor por defecto
      let shouldUpdateStatus = false;

      // 7. Lógica de estados combinada (pagos + servicios)
      if (allServicesAnnulled) {
        // Si todos los servicios están anulados, cancelar la orden
        newStatus = SaleStatus.CANCELLED;
        shouldUpdateStatus = true;
        console.log('🚫 Todos los servicios anulados → Orden CANCELLED');
      } else if (totalPaid >= totalOwed && allServicesCompleted) {
        // Si está todo pagado Y todos los servicios completados, completar la orden
        newStatus = SaleStatus.COMPLETED;
        shouldUpdateStatus = true;
        console.log('✅ Todo pagado y servicios completados → Orden COMPLETED');
      } else if (totalPaid >= totalOwed && hasSomeCompletedServices) {
        // Si está todo pagado pero hay servicios mixtos, completar de todos modos
        newStatus = SaleStatus.COMPLETED;
        shouldUpdateStatus = true;
        console.log('✅ Todo pagado con servicios mixtos → Orden COMPLETED');
      } else {
        // Mantener en PENDING si aún falta pago o hay servicios en progreso
        console.log('⏳ Aún faltan pagos o servicios → Orden mantiene PENDING');
      }

      // 8. Actualizar estado de la orden si es necesario
      let updatedOrder = order;
      if (shouldUpdateStatus) {
        updatedOrder = await prisma.order.update({
          where: { id: orderId },
          data: {
            status: newStatus,
            ...(newStatus === SaleStatus.CANCELLED && {
              canceledAt: new Date(),
              canceledById: user?.userId || null
            }),
            updatedAt: new Date()
          },
          include: {
            orderProducts: {
              include: {
                product: {
                  include: {
                    product: true,
                  },
                },
              },
            },
            services: true,
            client: true,
            cashSession: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        });
        
        console.log(`📈 Orden actualizada a estado: ${newStatus}`);
      }

      return updatedOrder as unknown as Order;
    });
  }

  // Método auxiliar para calcular el total adeudado de una orden
  private async calculateTotalOwed(orderId: string): Promise<number> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        services: true,
        orderProducts: true
      }
    });

    if (!order) return 0;

    const servicesTotal = order.services.reduce((sum, service) => sum + service.price, 0);
    const productsTotal = order.orderProducts.reduce((sum, product) => sum + (product.price * product.quantity), 0);
    
    return servicesTotal + productsTotal;
  }

  // Método auxiliar para calcular el total pagado de una orden
  private async calculateTotalPaid(orderId: string): Promise<number> {
    const paymentMethods = await this.prisma.paymentMethod.findMany({
      where: { orderId },
      select: { amount: true }
    });

    return paymentMethods.reduce((sum, pm) => sum + pm.amount, 0);
  }
}
