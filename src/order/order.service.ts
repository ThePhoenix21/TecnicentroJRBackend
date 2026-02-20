import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CompleteOrderDto } from './dto/complete-order.dto';
import { PayOrderPaymentsDto } from './dto/pay-order-payments.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { Order } from './entities/order.entity';
import { Prisma, SaleStatus, SessionStatus, PaymentType, ServiceStatus, InventoryMovementType, MovementType, ServiceType as PrismaServiceType, TenantFeature } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { CashMovementService } from '../cash-movement/cash-movement.service';
import { getPaginationParams, buildPaginatedResponse } from '../common/pagination/pagination.helper';
import { ListOrdersDto } from './dto/list-orders.dto';
import { ListOrdersResponseDto } from './dto/list-orders-response.dto';
import { BasePaginationDto } from '../common/dto/base-pagination.dto';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
  tenantFeatures?: TenantFeature[];
};

type HardDeleteOrdersByDateRangeInput = {
  fromDate: string;
  toDate: string;
  reason?: string;
};

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private prisma: PrismaService,
    private cashMovementService: CashMovementService,
  ) {}

  private mask(value?: string | null) {
    if (!value) return '';
    const s = String(value);
    if (s.length <= 8) return '***';
    return `${s.slice(0, 4)}***${s.slice(-4)}`;
  }

  private toNumber(value: Prisma.Decimal | number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    return value.toNumber();
  }

  private normalizeServiceType(type: unknown): PrismaServiceType {
    // Siempre forzar MISELANEOUS independientemente de lo que se envíe
    return PrismaServiceType.MISELANEOUS;
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

    if (!userId) {
      throw new BadRequestException('Se requiere el ID del usuario para crear la orden');
    }

    const userIdToUse = userId;

    // Determinar si es ADMIN
    const isAdmin = user?.role === 'ADMIN';

    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const hasProductsInRequest = Array.isArray(products) && products.length > 0;
    const hasServicesInRequest = Array.isArray(services) && services.length > 0;
    const isServicesOnlyOrder = !hasProductsInRequest && hasServicesInRequest;
    const isFastServiceTenant = (user.tenantFeatures || []).includes(TenantFeature.FASTSERVICE);

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
            userId: userIdToUse,
          },
          select: { id: true },
        });

        if (!storeUser) {
          throw new ForbiddenException('No tienes permisos para crear órdenes en esta sesión de caja');
        }
      }

      // 1. Verificar o crear el cliente
      let clientIdToUse = clientId;

      const isFilledString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

      if (clientIdToUse) {
        const existingClientById = (await prisma.client.findUnique({
          where: { id: clientIdToUse },
          select: {
            id: true,
            tenantId: true,
            deletedAt: true,
          } as any,
        })) as any;

        if (!existingClientById) {
          throw new NotFoundException('Cliente no encontrado');
        }

        if (existingClientById.deletedAt) {
          throw new BadRequestException('El cliente está eliminado. Use DNI para reactivarlo o seleccione otro cliente.');
        }

        if (existingClientById.tenantId !== user.tenantId) {
          throw new ForbiddenException('No tienes permisos para usar este cliente');
        }
      } else if (clientInfo) {
        const dni = clientInfo.dni;

        if (dni === '00000000') {
          const existingGenericClient = await prisma.client.findFirst({
            where: {
              tenantId: user.tenantId,
              dni: '00000000',
            },
            select: { id: true },
          });

          if (existingGenericClient) {
            clientIdToUse = existingGenericClient.id;
          } else {
            const newGenericClient = await prisma.client.create({
              data: {
                dni: '00000000',
                name: 'Cliente Genérico',
                tenant: {
                  connect: { id: user.tenantId },
                },
                user: {
                  connect: { id: userIdToUse },
                },
              },
              select: { id: true },
            });

            clientIdToUse = newGenericClient.id;
          }
        } else {

        let existingClientByEmail:
          | { id: string; dni: string; email: string | null }
          | null = null;
        if (isFilledString(clientInfo.email)) {
          existingClientByEmail = await prisma.client.findFirst({
            where: {
              tenantId: user.tenantId,
              email: clientInfo.email.trim(),
            },
            select: {
              id: true,
              dni: true,
              email: true,
            },
          });
        }

        if (existingClientByEmail) {
          if (existingClientByEmail.dni !== dni) {
            throw new BadRequestException({
              statusCode: 400,
              message: 'El correo electrónico ya está registrado con un DNI diferente',
              error: 'Bad Request',
              code: 'EMAIL_ALREADY_EXISTS',
            });
          }
        }

        const existingClientByDni = (await prisma.client.findFirst({
          where: {
            tenantId: user.tenantId,
            dni,
          },
          select: {
            id: true,
            deletedAt: true,
          } as any,
        })) as any;

        if (existingClientByDni) {
          if (existingClientByDni.deletedAt) {
            await prisma.client.update({
              where: { id: existingClientByDni.id },
              data: { deletedAt: null } as any,
            });
          }

          const updateData: Prisma.ClientUpdateInput = {};
          if (isFilledString(clientInfo.name)) updateData.name = clientInfo.name.trim();
          if (isFilledString(clientInfo.email)) updateData.email = clientInfo.email.trim();
          if (isFilledString(clientInfo.phone)) updateData.phone = clientInfo.phone.trim();
          if (isFilledString(clientInfo.address)) updateData.address = clientInfo.address.trim();
          if (isFilledString(clientInfo.ruc)) updateData.ruc = clientInfo.ruc.trim();

          if (Object.keys(updateData).length > 0) {
            await prisma.client.update({
              where: { id: existingClientByDni.id },
              data: updateData,
            });
          }

          clientIdToUse = existingClientByDni.id;
        } else {
          const createData: Prisma.ClientCreateInput = {
            dni,
            tenant: {
              connect: { id: user.tenantId },
            },
            user: {
              connect: { id: userIdToUse },
            },
          };

          if (isFilledString(clientInfo.name)) {
            createData.name = clientInfo.name.trim();
          }

          if (isFilledString(clientInfo.email)) createData.email = clientInfo.email.trim();
          if (isFilledString(clientInfo.phone)) createData.phone = clientInfo.phone.trim();
          if (isFilledString(clientInfo.address)) createData.address = clientInfo.address.trim();
          if (isFilledString(clientInfo.ruc)) createData.ruc = clientInfo.ruc.trim();

          const newClient = await prisma.client.create({
            data: createData,
          });
          clientIdToUse = newClient.id;
        }
        }
      } else {
        throw new BadRequestException('Se requiere información del cliente');
      }

      // 2. Verificar productos y calcular totales
      const productIds = products?.map(p => p.productId) || [];

      this.logger.debug(
        `Validando productos: count=${productIds.length} admin=${isAdmin} store=${this.mask(cashSession.StoreId)}`,
      );
      
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

      if (existingStoreProducts.length !== productIds.length) {
        const foundIds = existingStoreProducts.map(sp => sp.id);
        const missingIds = productIds.filter(id => !foundIds.includes(id));
        throw new NotFoundException(`Productos no encontrados: ${missingIds.join(', ')}`);
      }

      // 3. Procesar productos
      let productMap = new Map();
      if (products && products.length > 0) {
        productMap = new Map(products.map(p => [p.productId, { 
          quantity: p.quantity, 
          // Si hay customPrice, lo usamos, de lo contrario usamos el precio del StoreProduct
          price: ('customPrice' in p && p.customPrice !== undefined) ? Number(p.customPrice) : undefined
        }]));
      }
      
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
        
        // Permitir stock negativo (vender incluso con stock 0)
        // if (storeProduct.stock < quantity) {
        //   throw new BadRequestException(`No hay suficiente stock para el producto: ${storeProduct.product?.name || storeProduct.id}`);
        // }
        
        // Si no se proporcionó un precio personalizado, usar el precio del StoreProduct
        const finalPrice: number = price !== undefined ? price : (storeProduct.price || 0);
        
        // Verificar si el precio fue modificado
        if (price !== undefined && price !== storeProduct.price) {
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
          type: this.normalizeServiceType(service.type),
          photoUrls: service.photoUrls || [],
          status: (isServicesOnlyOrder && isFastServiceTenant) ? ServiceStatus.COMPLETED : ServiceStatus.IN_PROGRESS,
        }));
        
        totalAmount += servicesData.reduce((sum, service) => sum + service.price, 0);
      }

      // 4. Calcular total de pagos para determinar estado
      let totalPayments = 0;
      
      // Sumar pagos a nivel de orden
      totalPayments += (paymentMethods || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      
      // Sumar pagos específicos de productos
      if (products) {
        totalPayments += products.reduce((sum, p) => {
          if (p.payments && Array.isArray(p.payments)) {
            return sum + p.payments.reduce((productSum, payment) => productSum + (Number(payment.amount) || 0), 0);
          }
          return sum;
        }, 0);
      }
      
      // Sumar adelantos de servicios
      if (services) {
        totalPayments += services.reduce((sum, s) => {
          if (s.payments && Array.isArray(s.payments)) {
            return sum + s.payments.reduce((serviceSum, payment) => serviceSum + (Number(payment.amount) || 0), 0);
          }
          return sum;
        }, 0);
      }

      // 5. Determinar el estado de la orden basado en pagos
      let orderStatus: SaleStatus;
      if (totalPayments >= totalAmount) {
        // Si es solo servicios y está pagado completamente → PAID
        // Si tiene productos y está pagado completamente → COMPLETED
        orderStatus = isServicesOnlyOrder ? SaleStatus.PAID : SaleStatus.COMPLETED;
      } else {
        orderStatus = SaleStatus.PENDING;
      }

      // Para FASTSERVICE: si es solo servicios y está pagado completamente, se marca como COMPLETED
      if (isServicesOnlyOrder && isFastServiceTenant && orderStatus === SaleStatus.PAID) {
        orderStatus = SaleStatus.COMPLETED;
      }

      // 6. Calcular número de tienda según orden de creación
      // Se obtienen todas las tiendas ordenadas por createdAt y se busca el índice de la tienda de la sesión
      const stores = await prisma.store.findMany({
        where: {
          tenantId: user.tenantId,
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true }
      });

      const storeIndex = stores.findIndex((s) => s.id === cashSession.StoreId);
      const storeNumber = storeIndex >= 0 ? storeIndex + 1 : 1; // 1 para primera tienda, 2 para segunda, etc.

      // 7. Generar número de orden con prefijo 001/002/... usando storeNumber
      const orderNumber = await this.generateOrderNumber(storeNumber);

      const paymentMethodsFiltered = (paymentMethods || []).filter((pm) => this.toNumber(pm.amount as any) > 0);

      // 8. Crear la orden
      const orderData: Prisma.OrderCreateInput = {
        orderNumber,
        totalAmount,
        status: orderStatus,
        isPriceModified,
        cashSession: {
          connect: { id: cashSessionId }
        },
        user: {
          connect: { id: userIdToUse }
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
          create: paymentMethodsFiltered.map((pm) => ({
            type: pm.type as PaymentType,
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

      // 8. Actualizar el stock de los productos en tienda y registrar movimientos
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
              userId: userIdToUse,
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
        paymentMethodsDto: paymentMethodsFiltered,
        clientInfo: clientInfo,
      };
    }).then(async (result) => {
      // 8. Crear pagos y movimientos de caja FUERA de la transacción
      const { order, clientIdToUse, paymentMethodsDto, clientInfo } = result;

      this.logger.log(`Procesando pagos de orden: order=${this.mask(order.id)}`);

      const movementsToCreate = (paymentMethodsDto || []).filter((pm) => this.toNumber(pm.amount as any) > 0);
      if (movementsToCreate.length > 0) {
        this.logger.log(`Creando movimientos de caja (pagos): order=${this.mask(order.id)} count=${movementsToCreate.length}`);

        for (const payment of movementsToCreate) {
          try {
            await this.cashMovementService.createFromOrder({
              cashSessionId: cashSessionId,
              amount: payment.amount,
              payment: payment.type as PaymentType,
              orderId: order.id,
              clientId: clientIdToUse,
              clientName: order.client?.name || undefined,
              clientEmail: order.client?.email || undefined
            }, false, user);
          } catch (error) {
            this.logger.error(`Error al crear movimiento de caja: order=${this.mask(order.id)} amount=${payment.amount} msg=${error.message}`);
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
      select: {
        id: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        orderProducts: {
          select: {
            id: true,
            quantity: true,
            price: true,
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
            status: true,
          },
        },
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }) as unknown as Promise<Order[]>;
  }

  async list(query: ListOrdersDto, user: AuthUser): Promise<ListOrdersResponseDto> {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    if (!query.storeId) {
      throw new BadRequestException('storeId es requerido');
    }

    const { page, pageSize, skip } = getPaginationParams({
      page: query.page,
      pageSize: query.pageSize,
      defaultPage: 1,
      defaultPageSize: 12,
      maxPageSize: 100,
    });

    if (query.onlyProducts && query.onlyServices) {
      throw new BadRequestException('No se puede filtrar por onlyProducts y onlyServices al mismo tiempo');
    }

    let currentOpenCashSessionId: string | undefined;

    await this.assertStoreAccess(query.storeId, user);
    const currentSession = await this.prisma.cashSession.findFirst({
      where: {
        StoreId: query.storeId,
        UserId: user.userId,
        status: SessionStatus.OPEN,
      },
      select: { id: true },
    });
    currentOpenCashSessionId = currentSession?.id;

    const where: Prisma.OrderWhereInput = {
      cashSession: {
        Store: {
          tenantId,
        },
      },
    };

    where.cashSession = {
      ...(where.cashSession as any),
      StoreId: query.storeId,
    } as any;

    const queryUserId = (query as any)?.userId as string | undefined;
    if (queryUserId) {
      where.userId = queryUserId;
    }

    if (query.openCashOnly) {
      if (!currentOpenCashSessionId) {
        throw new NotFoundException('No hay una sesión de caja abierta para el usuario en la tienda indicada');
      }

      where.cashSessionsId = currentOpenCashSessionId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.fromDate || query.toDate) {
      where.createdAt = {
        ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
        ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
      };
    }

    if (query.clientName) {
      where.client = {
        ...(where.client as any),
        name: {
          contains: query.clientName,
          mode: 'insensitive',
        },
      };
    }

    if (query.sellerName) {
      where.user = {
        ...(where.user as any),
        name: {
          contains: query.sellerName,
          mode: 'insensitive',
        },
      };
    }

    if (query.onlyProducts) {
      where.orderProducts = { some: {} };
    }

    if (query.onlyServices) {
      where.services = { some: {} };
    }

    if (query.orderNumber) {
      where.orderNumber = {
        contains: query.orderNumber,
        mode: 'insensitive',
      };
    }

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          cashSessionsId: true,
          totalAmount: true,
          createdAt: true,
          status: true,
          client: {
            select: {
              name: true,
            },
          },
          user: {
            select: {
              name: true,
            },
          },
          orderProducts: {
            select: {
              quantity: true,
              price: true,
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
              type: true,
              amount: true,
              createdAt: true,
            },
          },
          cashMovements: {
            where: { type: MovementType.EXPENSE },
            select: {
              payment: true,
              amount: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return buildPaginatedResponse(
      orders.map((order) => ({
        total: (order.totalAmount as any)?.toNumber ? (order.totalAmount as any).toNumber() : Number(order.totalAmount ?? 0),
        id: order.id,
        createdAt: order.createdAt,
        clientName: order.client?.name ?? '',
        sellerName: order.user?.name ?? '',
        isFromCurrentCashSession: !!(currentOpenCashSessionId && order.cashSessionsId === currentOpenCashSessionId),
        products: (order.orderProducts || []).map((op) => ({
          name: op.product?.product?.name ?? '',
          quantity: op.quantity,
          price: (op.price as any)?.toNumber ? (op.price as any).toNumber().toString() : String(op.price ?? 0),
        })),
        services: (order.services || []).map((s) => ({
          name: s.name ?? '',
          price: (s.price as any)?.toNumber ? (s.price as any).toNumber() : Number(s.price ?? 0),
        })),
        status: order.status,
        paymentMethods: (order.paymentMethods || [])
          .slice()
          .sort((a: any, b: any) => {
            const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
            return aTime - bTime;
          })
          .slice(0, 3)
          .map((pm) => ({
            type: pm.type,
            amount: (pm.amount as any)?.toNumber ? (pm.amount as any).toNumber() : Number(pm.amount ?? 0),
          })),
        refundPaymentMethods: (order.cashMovements || [])
          .slice()
          .sort((a: any, b: any) => {
            const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
            return aTime - bTime;
          })
          .map((movement) => ({
            type: movement.payment || PaymentType.EFECTIVO,
            amount: (movement.amount as any)?.toNumber
              ? (movement.amount as any).toNumber()
              : Number(movement.amount ?? 0),
          })),
      })),
      total,
      page,
      pageSize,
    );
  }

  async lookupOrderNumbers(
    query: { search?: string; storeId?: string; fromDate?: string; toDate?: string; limit?: number },
    user: AuthUser,
  ): Promise<string[]> {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const take = Math.min(Math.max(Number(query.limit ?? 50), 1), 200);

    const where: Prisma.OrderWhereInput = {
      cashSession: {
        Store: {
          tenantId,
        },
      },
    };

    if (query.storeId) {
      await this.assertStoreAccess(query.storeId, user);
      where.cashSession = {
        ...(where.cashSession as any),
        StoreId: query.storeId,
      } as any;
    }

    if (query.fromDate || query.toDate) {
      where.createdAt = {
        ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
        ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
      };
    }

    if (query.search) {
      where.orderNumber = {
        contains: query.search,
        mode: 'insensitive',
      };
    }

    const rows = await this.prisma.order.findMany({
      where,
      select: { orderNumber: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      distinct: ['orderNumber'],
      take,
    });

    return rows.map((r) => r.orderNumber);
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
      select: {
        id: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        orderProducts: {
          select: {
            id: true,
            quantity: true,
            price: true,
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
            status: true,
          },
        },
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
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

  async findByStore(storeId: string, user: AuthUser, pagination?: BasePaginationDto & { 
  currentCash?: boolean;
  clientName?: string;
  sellerName?: string;
  orderNumber?: string;
  status?: string;
}): Promise<any> {
    await this.assertStoreAccess(storeId, user);

    let cashSessionsId: string | undefined;
    if (pagination?.currentCash) {
      const store = await this.assertStoreAccess(storeId, user);

      // Si se especifica userId, buscar sesión de ese usuario específico
      const sessionWhere: any = {
        StoreId: store.id,
        status: SessionStatus.OPEN,
      };

      // Si se proporciona userId en query, buscar sesión de ese usuario
      const queryUserId = (pagination as any)?.userId as string | undefined;
      if (queryUserId) {
        sessionWhere.UserId = queryUserId;
      } else {
        // Si no, buscar sesión del usuario autenticado
        sessionWhere.UserId = user.userId;
      }

      const session = await this.prisma.cashSession.findFirst({
        where: sessionWhere,
        select: { id: true },
      });

      if (!session) {
        throw new NotFoundException('No hay una sesión de caja abierta para la tienda indicada');
      }
      cashSessionsId = session.id;
    }

    // Construir el where base
    const baseWhere = {
      cashSession: {
        StoreId: storeId
      }
    };

    // Si no es ADMIN, verificar si se debe filtrar por userId
    let whereClause: any;
    if (user.role === 'ADMIN') {
      whereClause = baseWhere;
    } else {
      // Verificar si el controller envió un userId específico
      const queryUserId = (pagination as any)?.userId as string | undefined;
      if (queryUserId) {
        // Si el controller envió userId, usar ese (para filtrar por órdenes propias)
        whereClause = {
          ...baseWhere,
          userId: queryUserId
        };
      } else {
        // Si no, no filtrar por userId (para VIEW_ALL_ORDERS_HISTORY)
        whereClause = baseWhere;
      }
    }

    // Aplicar filtro de cashSession si es necesario
    let finalWhere: any = cashSessionsId 
      ? { ...whereClause, cashSessionsId }
      : whereClause;

    // Agregar filtros dinámicos
    if (pagination?.clientName) {
      finalWhere.client = {
        name: {
          contains: pagination.clientName,
          mode: 'insensitive',
        },
      };
    }

    if (pagination?.sellerName) {
      finalWhere.user = {
        name: {
          contains: pagination.sellerName,
          mode: 'insensitive',
        },
      };
    }

    if (pagination?.orderNumber) {
      finalWhere.orderNumber = {
        contains: pagination.orderNumber,
        mode: 'insensitive',
      };
    }

    if (pagination?.status) {
      finalWhere.status = pagination.status;
    }

    // Si se proporciona paginación, usarla
    if (pagination) {
      const { page, pageSize, skip } = getPaginationParams({
        page: pagination.page,
        pageSize: pagination.pageSize,
        defaultPage: 1,
        defaultPageSize: 12,
        maxPageSize: 100,
      });

      const [total, orders] = await Promise.all([
        this.prisma.order.count({ where: finalWhere }),
        this.prisma.order.findMany({
          where: finalWhere,
          select: {
            id: true,
            totalAmount: true,
            createdAt: true,
            status: true,
            client: {
              select: {
                name: true,
              },
            },
            user: {
              select: {
                name: true,
              },
            },
            orderProducts: {
              select: {
                quantity: true,
                price: true,
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
                status: true,
              },
            },
            paymentMethods: {
              select: {
                type: true,
                amount: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
      ]);

      return buildPaginatedResponse(orders, total, page, pageSize);
    }

    // Si no hay paginación, comportamiento original
    return this.prisma.order.findMany({
      where: finalWhere,
      select: {
        id: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        orderProducts: {
          select: {
            id: true,
            quantity: true,
            price: true,
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
            status: true,
          },
        },
        paymentMethods: {
          select: {
            id: true,
            type: true,
            amount: true,
            createdAt: true,
          },
        },
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        cashSession: {
          select: {
            id: true,
            Store: {
              select: {
                id: true,
                name: true,
              },
            },
          },
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

  async cancelOrder(
    id: string,
    userId: string,
    userRole: string,
    authenticatedUser?: AuthUser,
    dto?: CancelOrderDto,
  ): Promise<Order> {
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

      // 4. Reembolso SOLO si se envía paymentMethods en el body (no se asume monto ni método)
      const refundPaymentMethods = (dto?.paymentMethods || []).filter((pm) => (pm?.amount || 0) > 0);

      this.logger.log(
        `Reembolso (manual) - métodos enviados: order=${this.mask(order.id)} count=${refundPaymentMethods.length}`,
      );

      if (refundPaymentMethods.length > 0 && order.cashSession) {
        // Verificar que la sesión de caja esté abierta
        if (order.cashSession.status !== SessionStatus.OPEN) {
          this.logger.warn(
            `Sesión de caja cerrada, no se crea reembolso: session=${this.mask(order.cashSession.id)} order=${this.mask(order.id)}`,
          );
        } else {
          this.logger.log(
            `Creando movimientos de reembolso: order=${this.mask(order.id)} count=${refundPaymentMethods.length}`,
          );

          for (const refund of refundPaymentMethods) {
            try {
              await this.cashMovementService.createFromOrder(
                {
                  cashSessionId: order.cashSession.id,
                  amount: this.toNumber(refund.amount),
                  payment: refund.type as PaymentType,
                  orderId: order.id,
                  clientId: order.client?.id || undefined,
                  clientName: order.client?.name || undefined,
                  clientEmail: order.client?.email || undefined,
                },
                true,
                authenticatedUser,
              );
            } catch (error) {
              this.logger.error(
                `Error al crear movimiento de reembolso: order=${this.mask(order.id)} amount=${refund.amount} msg=${error.message}`,
              );
              // No fallar la cancelación si falla el movimiento
            }
          }
        }
      } else if (refundPaymentMethods.length > 0 && !order.cashSession) {
        this.logger.warn(`Orden sin sesión de caja, no se crea reembolso: order=${this.mask(order.id)}`);
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

  async payOrderPayments(orderId: string, dto: PayOrderPaymentsDto, user?: AuthUser): Promise<{ success: true; fullPayment: boolean }> {
    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    await this.assertOrderAccess(orderId, user);

    const PAID_STATUS = 'PAID' as any;

    return this.prisma.$transaction(async (prisma) => {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          clientId: true,
          client: { select: { name: true, email: true } },
          cashSession: { select: { id: true } },
        },
      });

      if (!order) {
        throw new NotFoundException('La orden especificada no existe');
      }

      if (order.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('No se puede registrar pagos en una orden cancelada');
      }

      const payments = dto?.payments || [];
      if (!Array.isArray(payments) || payments.length === 0) {
        throw new BadRequestException('payments es requerido y debe tener al menos un item');
      }

      await prisma.paymentMethod.createMany({
        data: payments.map((p) => ({
          orderId,
          type: p.type,
          amount: p.amount,
        })),
      });

      const movementsToCreate = payments.filter((p) => (p.amount || 0) > 0);
      if (movementsToCreate.length > 0) {
        for (const payment of movementsToCreate) {
          try {
            await this.cashMovementService.createFromOrder({
              cashSessionId: order.cashSession?.id || '',
              amount: payment.amount,
              payment: payment.type,
              orderId: order.id,
              clientId: order.clientId,
              clientName: order.client?.name || undefined,
              clientEmail: order.client?.email || undefined,
            }, false, user);
          } catch (error) {
            this.logger.error(`Error al crear movimiento de caja (pago): ${error.message}`);
          }
        }
      }

      const paymentMethods = await prisma.paymentMethod.findMany({
        where: { orderId },
        select: { amount: true },
      });

      const totalPaid = paymentMethods.reduce((sum, pm) => sum + this.toNumber(pm.amount), 0);
      const totalAmount = this.toNumber(order.totalAmount);
      const fullPayment = totalPaid >= totalAmount;

      if (fullPayment && (order.status as any) !== PAID_STATUS) {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: PAID_STATUS,
            updatedAt: new Date(),
          },
        });
      }

      return { success: true, fullPayment };
    });
  }

  async completePaidOrder(orderId: string, user?: AuthUser): Promise<{ success: true }> {
    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    await this.assertOrderAccess(orderId, user);

    return this.prisma.$transaction(async (prisma) => {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          services: {
            select: {
              id: true,
              status: true,
            },
          },
          paymentMethods: {
            select: { amount: true },
          },
        },
      });

      if (!order) {
        throw new NotFoundException('La orden especificada no existe');
      }

      if (order.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('No se puede completar una orden cancelada');
      }

      const totalPaid = (order.paymentMethods || []).reduce((sum, pm) => sum + this.toNumber(pm.amount), 0);
      const totalAmount = this.toNumber(order.totalAmount);

      if (totalPaid + 0.00001 < totalAmount) {
        throw new BadRequestException('La orden tiene pagos pendientes');
      }

      await prisma.service.updateMany({
        where: {
          orderId,
          NOT: {
            status: ServiceStatus.ANNULLATED,
          },
        },
        data: {
          status: ServiceStatus.COMPLETED,
          updatedAt: new Date(),
        },
      });

      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: SaleStatus.COMPLETED,
          updatedAt: new Date(),
        },
      });

      return { success: true };
    });
  }

  async getOrderPaymentMethods(orderId: string, user: AuthUser) {
    await this.assertOrderAccess(orderId, user);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        paymentMethods: {
          select: {
            id: true,
            type: true,
            amount: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    const totalAmount = this.toNumber(order.totalAmount);
    const payments = (order.paymentMethods || []).map((pm) => ({
      id: pm.id,
      type: pm.type,
      amount: this.toNumber(pm.amount),
      createdAt: pm.createdAt,
    }));

    const totalPaid = payments.reduce((sum, pm) => sum + pm.amount, 0);
    const pendingAmount = Math.max(totalAmount - totalPaid, 0);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount,
      totalPaid,
      pendingAmount,
      payments,
    };
  }

  async hardDeleteOrdersByDateRange(
    input: HardDeleteOrdersByDateRangeInput,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Solo un ADMIN puede ejecutar hard delete de historial');
    }

    const from = new Date(input.fromDate);
    const to = new Date(input.toDate);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Rango de fechas inválido');
    }

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('fromDate no puede ser mayor que toDate');
    }

    this.logger.warn(
      `Hard delete solicitado: tenant=${tenantId} by=${this.mask(user.userId)} range=[${from.toISOString()}..${to.toISOString()}]`,
    );

    return this.prisma.$transaction(async (prisma) => {
      const orders = await prisma.order.findMany({
        where: {
          createdAt: {
            gte: from,
            lte: to,
          },
          cashSession: {
            Store: {
              tenantId,
            },
          },
        },
        select: { id: true },
      });

      const orderIds = orders.map((o) => o.id);

      if (orderIds.length === 0) {
        await (prisma as any).orderHardDeleteAudit.create({
          data: {
            tenantId,
            executedByUserId: user.userId,
            executedByEmail: user.email,
            fromDate: from,
            toDate: to,
            deletedOrdersCount: 0,
            ipAddress: ipAddress ?? null,
            reason: input.reason ?? null,
          },
        });

        return {
          deletedOrdersCount: 0,
          fromDate: from.toISOString(),
          toDate: to.toISOString(),
        };
      }

      await prisma.inventoryMovement.deleteMany({
        where: {
          orderId: { in: orderIds },
        },
      });

      await prisma.cashMovement.deleteMany({
        where: {
          relatedOrderId: { in: orderIds },
        },
      });

      await prisma.paymentMethod.deleteMany({
        where: {
          orderId: { in: orderIds },
        },
      });

      await prisma.service.deleteMany({
        where: {
          orderId: { in: orderIds },
        },
      });

      await prisma.orderProduct.deleteMany({
        where: {
          orderId: { in: orderIds },
        },
      });

      const deletedOrders = await prisma.order.deleteMany({
        where: {
          id: { in: orderIds },
        },
      });

      await (prisma as any).orderHardDeleteAudit.create({
        data: {
          tenantId,
          executedByUserId: user.userId,
          executedByEmail: user.email,
          fromDate: from,
          toDate: to,
          deletedOrdersCount: deletedOrders.count,
          ipAddress: ipAddress ?? null,
          reason: input.reason ?? null,
        },
      });

      return {
        deletedOrdersCount: deletedOrders.count,
        fromDate: from.toISOString(),
        toDate: to.toISOString(),
      };
    });
  }


  // Método auxiliar para obtener la orden con todos los detalles necesarios para la respuesta (PDF, pagos, etc.)
  async getOrderWithDetails(orderId: string, user: AuthUser): Promise<Order> {
    await this.assertOrderAccess(orderId, user);

    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    // Obtener la orden completa
    const completeOrder = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        cashSession: {
          Store: {
            tenantId,
          },
        },
      },
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

    const [orderUser, orderClient] = await Promise.all([
      this.prisma.user.findFirst({
        where: {
          id: completeOrder.userId,
          tenantId,
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      }),
      this.prisma.client.findFirst({
        where: {
          id: completeOrder.clientId,
          tenantId,
        },
      }),
    ]);

    const orderWithPayments = {
      ...completeOrder,
      user: orderUser,
      client: orderClient,
    };

    // Agregar información adicional para PDF
    const pdfInfo = {
      businessName: 'Tecnicentro JR',
      address: completeOrder.cashSession?.Store?.address || 'Dirección no disponible',
      phone: completeOrder.cashSession?.Store?.phone || 'Teléfono no disponible',
      currentDate: new Date(completeOrder.createdAt).toLocaleDateString('es-PE'),
      currentTime: new Date(completeOrder.createdAt).toLocaleTimeString('es-PE'),
      orderNumber: completeOrder.orderNumber,
      sellerName: orderUser?.name || 'Vendedor no identificado',
      clientName: orderClient?.name || 'Cliente no identificado',
      clientDni: orderClient?.dni || 'N/A',
      clientPhone: orderClient?.phone || 'N/A',
      paidAmount: (completeOrder.paymentMethods || []).reduce(
        (sum, pm) => sum + this.toNumber(pm.amount),
        0,
      )
    };

    return {
      ...orderWithPayments,
      pdfInfo
    } as unknown as Order;
  }

  async updateStatus(
    id: string, 
    userId: string,
    updateOrderStatusDto: { status: SaleStatus },
    authenticatedUser?: AuthUser,
  ): Promise<Order> {
    const { status } = updateOrderStatusDto;

    if (!authenticatedUser) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    await this.assertOrderAccess(id, authenticatedUser);

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
          },
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

      // Solo el propietario o un administrador pueden actualizar el estado
      if (order.userId !== authenticatedUser.userId && authenticatedUser.role !== 'ADMIN') {
        throw new NotFoundException(`No tiene permisos para actualizar esta orden`);
      }

      // 2. Actualizar el estado de la orden
      const updatedOrder = await prisma.order.update({
        where: { id },
        data: { 
          status
        },
      });

      const tenantId = order.cashSession?.Store?.tenantId;

      const [orderProducts, services, client] = await Promise.all([
        prisma.orderProduct.findMany({
          where: { orderId: id },
          include: {
            product: true,
          },
        }),
        prisma.service.findMany({
          where: { orderId: id },
        }),
        tenantId && order.clientId
          ? prisma.client.findFirst({
              where: {
                id: order.clientId,
                tenantId,
              },
            })
          : null,
      ]);

      return { ...updatedOrder, orderProducts, services, client } as unknown as Order;
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
            type: payment.type as PaymentType,
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

      const movementsToCreate = newPaymentMethods.filter((pm) => (pm.amount || 0) > 0);
      if (movementsToCreate.length > 0) {
        console.log('💰 Creando movimientos de caja para pagos');

        for (const payment of movementsToCreate) {
          try {
            await this.cashMovementService.createFromOrder({
              cashSessionId: order.cashSession?.id || '',
              amount: payment.amount,
              payment: payment.type,
              orderId: order.id,
              clientId: order.clientId,
              clientName: order.client?.name || undefined,
              clientEmail: order.client?.email || undefined
            }, false, user);

            console.log('✅ Movimiento de caja creado:', payment.amount);
          } catch (error) {
            console.error('❌ Error al crear movimiento de caja:', error.message);
          }
        }
      }

      // 5. Calcular totales para determinar si la orden puede completarse
      const totalOwed =
        order.services.reduce((sum, s) => sum + this.toNumber(s.price), 0) +
        order.orderProducts.reduce(
          (sum, p) => sum + this.toNumber(p.price) * p.quantity,
          0,
        );

      const existingPaymentMethods = await prisma.paymentMethod.findMany({
        where: { orderId },
        select: { amount: true }
      });

      const totalPaid = existingPaymentMethods.reduce(
        (sum, pm) => sum + this.toNumber(pm.amount),
        0,
      );
      
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
  private async calculateTotalOwed(orderId: string, user: AuthUser): Promise<number> {
    await this.assertOrderAccess(orderId, user);

    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        cashSession: {
          Store: {
            tenantId,
          },
        },
      },
      include: {
        services: true,
        orderProducts: true
      }
    });

    if (!order) return 0;

    const servicesTotal = order.services.reduce((sum, service) => sum + this.toNumber(service.price), 0);
    const productsTotal = order.orderProducts.reduce((sum, product) => sum + this.toNumber(product.price) * product.quantity, 0);
    
    return servicesTotal + productsTotal;
  }

  // Método auxiliar para calcular el total pagado de una orden
  private async calculateTotalPaid(orderId: string, user: AuthUser): Promise<number> {
    await this.assertOrderAccess(orderId, user);

    const paymentMethods = await this.prisma.paymentMethod.findMany({
      where: { orderId },
      select: { amount: true }
    });

    return paymentMethods.reduce((sum, pm) => sum + this.toNumber(pm.amount), 0);
  }
}
