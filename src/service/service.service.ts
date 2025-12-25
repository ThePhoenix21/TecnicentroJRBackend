import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Service, ServiceStatus, ServiceType } from '@prisma/client';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
};

@Injectable()
export class ServiceService {
  constructor(private prisma: PrismaService) {}

  private getTenantIdOrThrow(user: AuthUser): string {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }
    return tenantId;
  }

  private async assertStoreMembership(storeId: string, user: AuthUser) {
    if (user.role === 'ADMIN') return;
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

  private async assertOrderAccess(orderId: string, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        cashSession: {
          Store: {
            tenantId,
          },
        },
      },
      select: {
        id: true,
        cashSession: {
          select: {
            StoreId: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    const storeId = order.cashSession?.StoreId;
    if (!storeId) {
      throw new ForbiddenException('No tienes permisos para acceder a esta orden');
    }

    await this.assertStoreMembership(storeId, user);
    return { orderId: order.id, storeId };
  }

  private async assertServiceAccess(serviceId: string, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    const service = await this.prisma.service.findFirst({
      where: {
        id: serviceId,
        order: {
          cashSession: {
            Store: {
              tenantId,
            },
          },
        },
      },
      select: {
        id: true,
        orderId: true,
        order: {
          select: {
            cashSession: {
              select: {
                StoreId: true,
              },
            },
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException(`Servicio con ID ${serviceId} no encontrado`);
    }

    const storeId = service.order?.cashSession?.StoreId;
    if (!storeId) {
      throw new ForbiddenException('No tienes permisos para acceder a este servicio');
    }

    await this.assertStoreMembership(storeId, user);
    return service;
  }

  async create(createServiceDto: CreateServiceDto, user: AuthUser): Promise<Service> {
    await this.assertOrderAccess(createServiceDto.orderId, user);

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
    user?: AuthUser,
  ): Promise<Service[]> {
    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    const tenantId = this.getTenantIdOrThrow(user);

    return this.prisma.service.findMany({
      where: {
        ...(status && { status }),
        ...(type && { type }),
        order: {
          cashSession: {
            Store: {
              tenantId,
              ...(user.role !== 'ADMIN'
                ? {
                    storeUsers: {
                      some: {
                        userId: user.userId,
                      },
                    },
                  }
                : {}),
            },
          },
        },
      },
      include: {
        order: true,
      },
    });
  }

  async findOne(id: string, user: AuthUser): Promise<Service> {
    await this.assertServiceAccess(id, user);
    const tenantId = this.getTenantIdOrThrow(user);

    const service = await this.prisma.service.findFirst({
      where: {
        id,
        order: {
          cashSession: {
            Store: {
              tenantId,
            },
          },
        },
      },
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
    user: AuthUser,
  ): Promise<Service> {
    await this.assertServiceAccess(id, user);

    return this.prisma.service.update({
      where: { id },
      data: updateServiceDto,
    });
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    await this.assertServiceAccess(id, user);
    await this.prisma.service.delete({
      where: { id },
    });
  }

  async getPendingPayment(id: string, user: AuthUser): Promise<{
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
    await this.assertServiceAccess(id, user);
    const tenantId = this.getTenantIdOrThrow(user);

    const service = await this.prisma.service.findFirst({
      where: {
        id,
        order: {
          cashSession: {
            Store: {
              tenantId,
            },
          },
        },
      },
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
    storeId?: string,
    user?: AuthUser
  ): Promise<any[]> {
    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    const tenantId = this.getTenantIdOrThrow(user);

    const services = await this.prisma.service.findMany({
      where: {
        ...(status && { status }),
        ...(type && { type }),
        order: {
          cashSession: {
            ...(storeId ? { StoreId: storeId } : {}),
            Store: {
              tenantId,
              ...(user.role !== 'ADMIN'
                ? {
                    storeUsers: {
                      some: {
                        userId: user.userId,
                      },
                    },
                  }
                : {}),
            },
          },
        },
      },
      include: {
        order: {
          include: {
            client: true,
            paymentMethods: true,
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
      hasPendingPayment: (service.price || 0) - ((service.order?.paymentMethods || []).reduce((sum: number, payment: any) => sum + (payment.amount || 0), 0)) > 0,
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
