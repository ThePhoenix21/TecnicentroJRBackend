import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order } from './entities/order.entity';
import { Prisma, SaleStatus, PrismaClient, SessionStatus } from '@prisma/client';
import { customAlphabet } from 'nanoid';

@Injectable()
export class OrderService {
  constructor(private prisma: PrismaService) {}

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
      const existingProducts = await prisma.product.findMany({
        where: {
          id: { in: productIds },
        },
      });

      if (existingProducts.length !== products.length) {
        const foundIds = new Set(existingProducts.map(p => p.id));
        const missingIds = productIds.filter(id => !foundIds.has(id));
        throw new NotFoundException(`Los siguientes productos no existen: ${missingIds.join(', ')}`);
      }

      // 3. Calcular el monto total y verificar stock
      const productMap = new Map(products.map(p => [p.productId, { 
        quantity: p.quantity, 
        // Usamos customPrice si existe, de lo contrario usamos el precio del producto
        price: 'customPrice' in p ? p.customPrice : undefined
      }]));
      
      let totalAmount = 0;
      const orderProductsData: Array<{
        productId: string;
        quantity: number;
        price: number;
      }> = [];

      // Verificar stock y calcular total
      for (const product of existingProducts) {
        const productData = productMap.get(product.id);
        if (!productData) continue;
        
        const { quantity, price } = productData;
        
        if (product.stock < quantity) {
          throw new BadRequestException(`No hay suficiente stock para el producto: ${product.name}`);
        }
        
        // Si no se proporcionó un precio personalizado, usar el precio del producto
        const finalPrice = price !== undefined ? price : product.price;
        
        totalAmount += finalPrice * quantity;
        
        orderProductsData.push({
          productId: product.id,
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

      // 5. Actualizar el stock de productos
      await Promise.all(
        existingProducts.map(product => {
          const productData = productMap.get(product.id);
          if (!productData) return null;
          
          return prisma.product.update({
            where: { id: product.id },
            data: { 
              stock: product.stock - productData.quantity
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
            product: true,
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

  async cancelOrder(id: string, userId: string): Promise<Order> {
    return this.prisma.$transaction(async (prisma) => {
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
          services: true
        }
      });

      if (!order) {
        throw new NotFoundException(`Orden con ID ${id} no encontrada`);
      }

      // Solo el propietario o un administrador pueden anular la orden
      if (order.userId !== userId && order.user.role !== 'ADMIN') {
        throw new NotFoundException(`No tiene permisos para anular esta orden`);
      }

      // 2. Verificar si la orden ya está anulada
      if (order.status === 'CANCELLED') {
        throw new BadRequestException('La orden ya está anulada');
      }

      // 3. Actualizar el estado de la orden a CANCELLED
      const updatedOrder = await prisma.order.update({
        where: { id },
        data: { 
          status: 'CANCELLED',
          // Actualizar también la fecha de actualización
          updatedAt: new Date()
        },
        include: {
          orderProducts: true,
          services: true,
          client: true
        }
      });

      // 4. Actualizar el estado de los servicios a ANNULLATED si existen
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

      // 5. Devolver la orden actualizada con los servicios
      return prisma.order.findUnique({
        where: { id },
        include: {
          orderProducts: true,
          services: true,
          client: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      }) as unknown as Order;
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
