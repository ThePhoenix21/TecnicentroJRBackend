import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Service, ServiceStatus, ServiceType } from '@prisma/client';

@Injectable()
export class ServiceService {
  constructor(private prisma: PrismaService) {}

  async create(createServiceDto: CreateServiceDto): Promise<Service> {
    const { description, photoUrls, ...rest } = createServiceDto;
    const data: any = { ...rest };
    
    if (description !== undefined) {
      data.description = description;
    }
    
    if (photoUrls !== undefined) {
      data.photoUrls = photoUrls || [];
    }
    
    return this.prisma.service.create({
      data,
    });
  }

  async findAll(
    status?: ServiceStatus,
    type?: ServiceType,
  ): Promise<Service[]> {
    return this.prisma.service.findMany({
      where: {
        ...(status && { status }),
        ...(type && { type }),
      },
      include: {
        order: true,
      },
    });
  }

  async findOne(id: string): Promise<Service> {
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: {
        order: true,
      },
    });

    if (!service) {
      throw new NotFoundException(`Servicio con ID ${id} no encontrado`);
    }

    return service;
  }

  async update(
    id: string,
    updateServiceDto: UpdateServiceDto,
  ): Promise<Service> {
    await this.findOne(id); // Verifica que el servicio exista

    return this.prisma.service.update({
      where: { id },
      data: updateServiceDto,
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.service.delete({
      where: { id },
    });
  }

  async getPendingPayment(id: string): Promise<{
    serviceId: string;
    serviceName: string;
    servicePrice: number;
    totalPaid: number;
    pendingAmount: number;
    isFullyPaid: boolean;
    paymentBreakdown: Array<{
      id: string;
      type: string;
      amount: number;
      createdAt: string;
    }>;
  }> {
    // 1. Obtener el servicio
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            paymentMethods: true,
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException(`Servicio con ID ${id} no encontrado`);
    }

    // 2. Obtener todos los pagos de la orden (nuevo esquema: pagos a nivel de orden)
    const payments = service.order?.paymentMethods || [];

    // 3. Calcular totales
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const pendingAmount = service.price - totalPaid;
    const isFullyPaid = pendingAmount <= 0;

    // 4. Formatear respuesta
    return {
      serviceId: service.id,
      serviceName: service.name,
      servicePrice: service.price,
      totalPaid,
      pendingAmount: Math.max(0, pendingAmount), // Evitar negativos
      isFullyPaid,
      paymentBreakdown: payments.map(payment => ({
        id: payment.id,
        type: payment.type,
        amount: payment.amount,
        createdAt: payment.createdAt.toISOString(),
      })),
    };
  }

  async findAllWithClients(
    status?: ServiceStatus,
    type?: ServiceType,
    storeId?: string
  ): Promise<any[]> {
    const services = await this.prisma.service.findMany({
      where: {
        ...(status && { status }),
        ...(type && { type }),
        ...(storeId && { 
          order: { 
            cashSession: {
              StoreId: storeId
            }
          } 
        }) // Filtrar por tienda si se proporciona
      },
      include: {
        order: {
          include: {
            client: true,
            cashSession: {
              include: {
                Store: true
              }
            }
          }
        },
      },
    });

    // Formatear la respuesta para incluir cliente, tienda y orden
    return services.map((service: any) => ({
      ...service,
      client: service.order?.client || null,
      store: service.order?.cashSession?.Store || null,
      order: service.order ? {
        id: service.order.id,
        clientId: service.order.clientId,
        storeId: service.order.cashSession?.StoreId,
        totalAmount: service.order.totalAmount,
        status: service.order.status,
        createdAt: service.order.createdAt
      } : null
    }));
  }
}
