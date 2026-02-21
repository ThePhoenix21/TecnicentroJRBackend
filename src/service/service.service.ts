import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Service, ServiceStatus, ServiceType } from '@prisma/client';
import { getPaginationParams, buildPaginatedResponse } from '../common/pagination/pagination.helper';
import { ListServicesDto } from './dto/list-services.dto';
import { ListServicesResponseDto } from './dto/list-services-response.dto';
import { ListServicesWithClientsDto, ServicesCashSessionScope } from './dto/list-services-with-clients.dto';
import { ServiceLookupItemDto } from './dto/service-lookup-item.dto';
import { ServiceDetailResponseDto } from './dto/service-detail-response.dto';
import { PERMISSIONS } from '../auth/permissions';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
  permissions?: string[];
  stores?: string[];
};

@Injectable()
export class ServiceService {
  constructor(private prisma: PrismaService) {}

  private toNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    return value.toNumber();
  }

  private getTenantIdOrThrow(user: AuthUser): string {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }
    return tenantId;
  }

  private hasPermission(user: AuthUser, permission: string): boolean {
    return Array.isArray(user?.permissions) && user.permissions.includes(permission);
  }

  private hasViewAllServices(user: AuthUser): boolean {
    if (user?.role === 'ADMIN') return true;
    return this.hasPermission(user, PERMISSIONS.VIEW_ALL_SERVICES);
  }

  private getCurrentStoreId(user: AuthUser): string | undefined {
    const tokenStores: string[] = Array.isArray(user?.stores) ? user.stores : [];
    return tokenStores.length === 1 ? tokenStores[0] : undefined;
  }

  private resolveStoreScopeForServiceQueries(user: AuthUser, requestedStoreId?: string): {
    canViewAll: boolean;
    effectiveStoreId?: string;
  } {
    const canViewAll = this.hasViewAllServices(user);
    const effectiveStoreId = requestedStoreId || this.getCurrentStoreId(user);

    if (user.role !== 'ADMIN' && canViewAll && !effectiveStoreId) {
      throw new BadRequestException('storeId es requerido para usuarios con VIEW_ALL_SERVICES');
    }

    if (user.role !== 'ADMIN' && effectiveStoreId && Array.isArray(user?.stores) && user.stores.length > 0 && !user.stores.includes(effectiveStoreId)) {
      throw new ForbiddenException('No tienes permisos para acceder a servicios de esa tienda');
    }

    return { canViewAll, effectiveStoreId };
  }

  async list(query: ListServicesDto, user: AuthUser): Promise<ListServicesResponseDto> {
    const tenantId = this.getTenantIdOrThrow(user);
    if (!query.storeId) {
      throw new BadRequestException('storeId es requerido');
    }

    const canViewAll = this.hasViewAllServices(user);
    const requestedStoreId = query.storeId;

    // Acceso explícito por tienda solicitada
    if (user.role !== 'ADMIN') {
      if (Array.isArray(user?.stores) && user.stores.length > 0 && !user.stores.includes(requestedStoreId)) {
        throw new ForbiddenException('No tienes permisos para acceder a servicios de esa tienda');
      }

      if (!Array.isArray(user?.stores) || user.stores.length === 0) {
        await this.assertStoreMembership(requestedStoreId, user);
      }
    } else if (Array.isArray(user?.stores) && user.stores.length > 0 && !user.stores.includes(requestedStoreId)) {
      throw new ForbiddenException('No tienes permisos para acceder a servicios de esa tienda');
    }

    const currentOpenCashSession = await this.prisma.cashSession.findFirst({
      where: {
        StoreId: requestedStoreId,
        UserId: user.userId,
        status: 'OPEN',
      },
      orderBy: { openedAt: 'desc' },
      select: { id: true },
    });
    const currentOpenCashSessionId = currentOpenCashSession?.id;

    const { page, pageSize, skip } = getPaginationParams({
      page: query.page,
      pageSize: query.pageSize,
      defaultPage: 1,
      defaultPageSize: 12,
      maxPageSize: 100,
    });

    const where: any = {
      order: {
        ...(!canViewAll ? { userId: user.userId } : {}),
        cashSession: {
          StoreId: requestedStoreId,
          Store: {
            tenantId,
            ...(canViewAll && user.role !== 'ADMIN'
              ? {
                  storeUsers: {
                    some: {
                      userId: user.userId,
                    },
                  },
                }
              : {}),
          },
          ...(query.openCashOnly
            ? currentOpenCashSessionId
              ? { id: currentOpenCashSessionId }
              : { id: '__NO_OPEN_CASH_SESSION__' }
            : {}),
        },
      },
      ...(query.status && { status: query.status }),
      ...(query.fromDate || query.toDate
        ? {
            createdAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const [total, services] = await Promise.all([
      this.prisma.service.count({ where }),
      this.prisma.service.findMany({
        where,
        select: {
          id: true,
          name: true,
          status: true,
          price: true,
          createdAt: true,
          order: {
            select: {
              cashSessionsId: true,
              client: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return buildPaginatedResponse(
      services.map((service: any) => ({
        serviceId: service.id,
        clientName: service.order?.client?.name ?? '',
        serviceName: service.name,
        status: service.status,
        price: this.toNumber(service.price),
        createdAt: service.createdAt,
        isFromCurrentCash: !!(currentOpenCashSessionId && service.order?.cashSessionsId === currentOpenCashSessionId),
      })),
      total,
      page,
      pageSize,
    );
  }

  async lookup(user: AuthUser): Promise<ServiceLookupItemDto[]> {
    const tenantId = this.getTenantIdOrThrow(user);

    const services = await this.prisma.service.findMany({
      where: {
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
      select: {
        id: true,
        name: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return services.map((s) => ({
      id: s.id,
      value: s.name,
    }));
  }

  async getDetail(id: string, user: AuthUser): Promise<ServiceDetailResponseDto> {
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
      select: {
        id: true,
        name: true,
        description: true,
        photoUrls: true,
        type: true,
        status: true,
        price: true,
        createdAt: true,
        updatedAt: true,
        storeService: {
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            type: true,
          },
        },
        serviceCategory: {
          select: {
            id: true,
            name: true,
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            isPriceModified: true,
            createdAt: true,
            updatedAt: true,
            canceledAt: true,
            client: {
              select: {
                id: true,
                name: true,
                dni: true,
                phone: true,
                email: true,
                address: true,
              },
            },
            paymentMethods: {
              select: {
                type: true,
                amount: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
            cashSession: {
              select: {
                Store: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException(`Servicio con ID ${id} no encontrado`);
    }

    return {
      id: service.id,
      service: {
        id: service.id,
        name: service.name,
        description: service.description ?? null,
        photoUrls: service.photoUrls ?? [],
        type: service.type,
        status: service.status,
        price: this.toNumber(service.price),
        createdAt: service.createdAt,
        updatedAt: service.updatedAt,
      },
      order: {
        id: service.order.id,
        orderNumber: service.order.orderNumber,
        status: service.order.status,
        totalAmount: this.toNumber(service.order.totalAmount),
        isPriceModified: service.order.isPriceModified,
        createdAt: service.order.createdAt,
        updatedAt: service.order.updatedAt,
        canceledAt: service.order.canceledAt ?? null,
        storeName: service.order.cashSession?.Store?.name ?? null,
        paymentMethods: (service.order.paymentMethods ?? []).map((pm) => ({
          type: pm.type,
          amount: this.toNumber(pm.amount),
          createdAt: pm.createdAt,
        })),
      },
      client: {
        id: service.order.client?.id ?? null,
        name: service.order.client?.name ?? null,
        dni: service.order.client?.dni ?? '',
        phone: service.order.client?.phone ?? null,
        email: service.order.client?.email ?? null,
        address: service.order.client?.address ?? null,
      },
      storeService: service.storeService
        ? {
            id: service.storeService.id,
            name: service.storeService.name,
            description: service.storeService.description ?? null,
            price: this.toNumber(service.storeService.price),
            type: service.storeService.type,
          }
        : null,
      serviceCategory: service.serviceCategory
        ? {
            id: service.serviceCategory.id,
            name: service.serviceCategory.name,
          }
        : null,
    };
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
    const canViewAll = this.hasViewAllServices(user);
    const currentStoreId = this.getCurrentStoreId(user);

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
        userId: true,
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

    if (user.role !== 'ADMIN') {
      if (!canViewAll) {
        if (order.userId !== user.userId) {
          throw new ForbiddenException('No tienes permisos para acceder a esta orden');
        }
      } else if (currentStoreId) {
        if (storeId !== currentStoreId) {
          throw new ForbiddenException('No tienes permisos para acceder a servicios de otra tienda');
        }
      } else {
        await this.assertStoreMembership(storeId, user);
      }
    }

    return { orderId: order.id, storeId };
  }

  private async assertServiceAccess(serviceId: string, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    const canViewAll = this.hasViewAllServices(user);
    const currentStoreId = this.getCurrentStoreId(user);

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
            userId: true,
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

    if (user.role !== 'ADMIN') {
      if (!canViewAll) {
        if (service.order?.userId !== user.userId) {
          throw new ForbiddenException('No tienes permisos para acceder a este servicio');
        }
      } else if (currentStoreId) {
        if (storeId !== currentStoreId) {
          throw new ForbiddenException('No tienes permisos para acceder a servicios de otra tienda');
        }
      } else {
        await this.assertStoreMembership(storeId, user);
      }
    }

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
    storeId?: string,
    user?: AuthUser,
  ): Promise<Service[]> {
    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    const tenantId = this.getTenantIdOrThrow(user);
    const { canViewAll, effectiveStoreId } = this.resolveStoreScopeForServiceQueries(user, storeId);

    return this.prisma.service.findMany({
      where: {
        ...(status && { status }),
        ...(type && { type }),
        order: {
          ...(!canViewAll ? { userId: user.userId } : {}),
          cashSession: {
            ...(effectiveStoreId ? { StoreId: effectiveStoreId } : {}),
            Store: {
              tenantId,
              ...(canViewAll && user.role !== 'ADMIN'
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
    const totalPaid = payments.reduce((sum, payment) => sum + this.toNumber(payment.amount), 0);
    const pendingAmount = this.toNumber(service.price) - totalPaid;
    const isFullyPaid = pendingAmount <= 0;

    // 4. Formatear respuesta
    return {
      serviceId: service.id,
      serviceName: service.name,
      servicePrice: this.toNumber(service.price),
      totalPaid,
      pendingAmount: Math.max(0, pendingAmount), // Evitar negativos
      isFullyPaid,
      paymentBreakdown: payments.map(payment => ({
        id: payment.id,
        type: payment.type,
        amount: this.toNumber(payment.amount),
        createdAt: payment.createdAt.toISOString(),
      })),
    };
  }

  async findAllWithClients(
    query: ListServicesWithClientsDto,
    user?: AuthUser,
  ): Promise<ListServicesResponseDto> {
    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    const { page, pageSize, skip } = getPaginationParams({
      page: query.page,
      pageSize: query.pageSize,
      defaultPage: 1,
      defaultPageSize: 12,
      maxPageSize: 100,
    });

    const tenantId = this.getTenantIdOrThrow(user);
    const { canViewAll, effectiveStoreId } = this.resolveStoreScopeForServiceQueries(user, query.storeId);

    const where: any = {
      ...(query.status && { status: query.status }),
      ...(query.type && { type: query.type }),
      ...(query.fromDate || query.toDate
        ? {
            createdAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
      ...(query.serviceName && query.serviceName.trim() && {
        name: { contains: query.serviceName.trim(), mode: 'insensitive' },
      }),
      order: {
        ...(!canViewAll ? { userId: user.userId } : {}),
        ...(query.clientName && query.clientName.trim() && {
          client: {
            name: { contains: query.clientName.trim(), mode: 'insensitive' },
          },
        }),
        cashSession: {
          ...(effectiveStoreId ? { StoreId: effectiveStoreId } : {}),
          ...(query.cashSessionScope === ServicesCashSessionScope.CURRENT ? { status: 'OPEN' } : {}),
          Store: {
            tenantId,
            ...(canViewAll && user.role !== 'ADMIN'
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
    };

    const [total, services] = await Promise.all([
      this.prisma.service.count({ where }),
      this.prisma.service.findMany({
        where,
        select: {
          id: true,
          name: true,
          status: true,
          price: true,
          createdAt: true,
          order: {
            select: {
              client: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return buildPaginatedResponse(
      services.map((service: any) => ({
        clientId: service.order?.client?.id ?? null,
        clientName: service.order?.client?.name ?? '',
        serviceId: service.id,
        serviceName: service.name,
        status: service.status,
        price: this.toNumber(service.price),
        createdAt: service.createdAt,
      })),
      total,
      page,
      pageSize,
    );
  }
}
