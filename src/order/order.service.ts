import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order } from './entities/order.entity';
import { Prisma, SaleStatus } from '@prisma/client';

@Injectable()
export class OrderService {
  constructor(private prisma: PrismaService) {}

  async create(createOrderDto: CreateOrderDto): Promise<Order> {
    const { clientInfo, clientId, products, services, userId } = createOrderDto;

    return this.prisma.$transaction(async (prisma) => {
      // 1. Verificar o crear el cliente
      let clientIdToUse = clientId;
      
      if (!clientId && clientInfo) {
        if (!userId) {
          throw new BadRequestException('Se requiere el ID de usuario para crear un cliente');
        }
        
        // Verificar si ya existe un cliente con el mismo DNI o RUC
        const existingClient = await prisma.client.findFirst({
          where: {
            OR: [
              { dni: clientInfo.dni },
              { ruc: clientInfo.ruc }
            ].filter(condition => Object.values(condition)[0] !== undefined), // Solo incluir condiciones definidas
            userId: userId
          },
          select: { id: true }
        });

        if (existingClient) {
          // Usar el cliente existente
          clientIdToUse = existingClient.id;
        } else {
          // Crear un nuevo cliente solo si no existe
          const newClient = await prisma.client.create({
            data: {
              ...clientInfo,
              userId: userId,
            },
            select: { id: true }
          });
          clientIdToUse = newClient.id;
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
          userId,
        },
      });

      if (existingProducts.length !== products.length) {
        const foundIds = new Set(existingProducts.map(p => p.id));
        const missingIds = productIds.filter(id => !foundIds.has(id));
        throw new NotFoundException(`Los siguientes productos no existen: ${missingIds.join(', ')}`);
      }

      // 3. Calcular el monto total y verificar stock
      const productMap = new Map(products.map(p => [p.productId, p.quantity]));
      let totalAmount = 0;
      const orderProductsData: Array<{
        productId: string;
        quantity: number;
        price: number;
      }> = [];

      // Verificar stock y calcular total
      for (const product of existingProducts) {
        const quantity = productMap.get(product.id) || 0;
        if (product.stock < quantity) {
          throw new BadRequestException(`No hay suficiente stock para el producto: ${product.name}`);
        }
        const productPrice = product.price;
        totalAmount += productPrice * quantity;
        
        orderProductsData.push({
          productId: product.id,
          quantity,
          price: productPrice,
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

      // 5. Crear la orden
      const orderData: Prisma.OrderCreateInput = {
        totalAmount,
        status: orderStatus,
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
        existingProducts.map(product => 
          prisma.product.update({
            where: { id: product.id },
            data: { 
              stock: product.stock - (productMap.get(product.id) || 0) 
            },
          })
        )
      );

      return order as unknown as Order;
    });
  }

  async findAll(userId: string): Promise<Order[]> {
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
}
