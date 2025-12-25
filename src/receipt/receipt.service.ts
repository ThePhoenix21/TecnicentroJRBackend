import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { 
  ServiceReceiptResponseDto, 
  ProductReceiptResponseDto, 
  AdvanceReceiptResponseDto,
  CompletionReceiptResponseDto,
  CashCloseReceiptResponseDto
} from './dto/receipt-response.dto';

@Injectable()
export class ReceiptService {
  constructor(private prisma: PrismaService) {}

  private getTenantIdOrThrow(user: any): string {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }
    return tenantId;
  }

  async getServiceReceipt(orderId: string, user: any): Promise<ServiceReceiptResponseDto> {
    const tenantId = this.getTenantIdOrThrow(user);
    // Obtener la orden con toda la información necesaria
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
        paymentMethods: true,
        cashSession: {
          include: {
            Store: true
          }
        }
      }
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    if (!order.services || order.services.length === 0) {
      throw new NotFoundException('La orden no contiene servicios');
    }

    // Obtener información de la tienda
    const store = order.cashSession?.Store;
    if (!store) {
      throw new NotFoundException('La orden no está asociada a una tienda');
    }

    const payments = order.paymentMethods || [];

    const [seller, client] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: order.userId, tenantId },
        select: { id: true, name: true, email: true },
      }),
      this.prisma.client.findFirst({
        where: { id: order.clientId, tenantId },
      }),
    ]);

    // Calcular monto total pagado
    const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);

    // Formatear fecha y hora
    const now = new Date(order.createdAt);
    const currentDate = now.toLocaleDateString('es-PE');
    const currentTime = now.toLocaleTimeString('es-PE');

    const servicesWithPayments = order.services.map(service => ({
      ...service,
      payments: []
    }));

    const receipt = {
      businessName: 'Tecnicentro JR',
      address: store.address || 'Dirección no disponible',
      phone: store.phone || 'Teléfono no disponible',
      currentDate,
      currentTime,
      orderNumber: order.orderNumber,
      sellerName: seller?.name || 'Vendedor no identificado',
      clientName: client?.name || 'Cliente no identificado',
      clientDni: client?.dni || 'N/A',
      clientPhone: client?.phone || 'N/A',
      paidAmount,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        status: order.status,
        createdAt: order.createdAt
      }
    };

    return {
      receipt,
      services: servicesWithPayments,
      payments
    };
  }

  async getProductReceipt(orderId: string, user: any): Promise<ProductReceiptResponseDto> {
    const tenantId = this.getTenantIdOrThrow(user);
    // Obtener la orden con productos
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
        orderProducts: true,
        paymentMethods: true,
        cashSession: {
          include: {
            Store: true
          }
        }
      }
    });

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    if (!order.orderProducts || order.orderProducts.length === 0) {
      throw new NotFoundException('La orden no contiene productos');
    }

    // Obtener información de la tienda
    const store = order.cashSession?.Store;
    if (!store) {
      throw new NotFoundException('La orden no está asociada a una tienda');
    }

    const payments = order.paymentMethods || [];

    const [seller, client] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: order.userId, tenantId },
        select: { id: true, name: true, email: true },
      }),
      this.prisma.client.findFirst({
        where: { id: order.clientId, tenantId },
      }),
    ]);

    // Calcular monto total pagado
    const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);

    // Formatear fecha y hora
    const now = new Date(order.createdAt);
    const currentDate = now.toLocaleDateString('es-PE');
    const currentTime = now.toLocaleTimeString('es-PE');

    const productsWithPayments = order.orderProducts.map(op => ({
      ...op,
      payments: []
    }));

    const receipt = {
      businessName: 'Tecnicentro JR',
      address: store.address || 'Dirección no disponible',
      phone: store.phone || 'Teléfono no disponible',
      currentDate,
      currentTime,
      orderNumber: order.orderNumber,
      sellerName: seller?.name || 'Vendedor no identificado',
      clientName: client?.name || 'Cliente no identificado',
      clientDni: client?.dni || 'N/A',
      clientPhone: client?.phone || 'N/A',
      paidAmount,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        status: order.status,
        createdAt: order.createdAt
      }
    };

    return {
      receipt,
      products: productsWithPayments,
      payments
    };
  }

  async getAdvanceReceipt(serviceId: string, user: any): Promise<AdvanceReceiptResponseDto> {
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
      include: {
        order: {
          include: {
            cashSession: {
              include: {
                Store: true,
              },
            },
            paymentMethods: true,
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    if (!service.order) {
      throw new NotFoundException('El servicio no está asociado a una orden');
    }

    const store = service.order.cashSession?.Store;
    if (!store) {
      throw new NotFoundException('El servicio no está asociado a una tienda');
    }

    const payments = service.order.paymentMethods || [];

    const [seller, client] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: service.order.userId, tenantId },
        select: { id: true, name: true, email: true },
      }),
      this.prisma.client.findFirst({
        where: { id: service.order.clientId, tenantId },
      }),
    ]);

    const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);

    const now = new Date(service.createdAt);
    const currentDate = now.toLocaleDateString('es-PE');
    const currentTime = now.toLocaleTimeString('es-PE');

    const receipt = {
      businessName: 'Tecnicentro JR',
      address: store.address || 'Dirección no disponible',
      phone: store.phone || 'Teléfono no disponible',
      currentDate,
      currentTime,
      orderNumber: service.order.orderNumber,
      sellerName: seller?.name || 'Vendedor no identificado',
      clientName: client?.name || 'Cliente no identificado',
      clientDni: client?.dni || 'N/A',
      clientPhone: client?.phone || 'N/A',
      paidAmount,
      order: {
        id: service.order.id,
        orderNumber: service.order.orderNumber,
        totalAmount: service.order.totalAmount,
        status: service.order.status,
        createdAt: service.order.createdAt,
      },
    };

    return {
      receipt,
      service: {
        ...service,
        payments: [],
      },
      payments,
    };
  }

  async getCompletionReceipt(serviceId: string, user: any): Promise<CompletionReceiptResponseDto> {
    const tenantId = this.getTenantIdOrThrow(user);
    // Similar a getAdvanceReceipt pero para servicios completados
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
      include: {
        order: {
          include: {
            cashSession: {
              include: {
                Store: true
              }
            },
            paymentMethods: true,
          }
        }
      }
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    if (service.status !== 'COMPLETED') {
      throw new NotFoundException('El servicio no está completado');
    }

    // Obtener información de la tienda
    const store = service.order.cashSession?.Store;
    if (!store) {
      throw new NotFoundException('El servicio no está asociado a una tienda');
    }

    const payments = service.order.paymentMethods || [];

    const [seller, client] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: service.order.userId, tenantId },
        select: { id: true, name: true, email: true },
      }),
      this.prisma.client.findFirst({
        where: { id: service.order.clientId, tenantId },
      }),
    ]);

    // Calcular monto total pagado
    const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);

    // Formatear fecha y hora
    const now = new Date(service.updatedAt); // Usar updatedAt para completados
    const currentDate = now.toLocaleDateString('es-PE');
    const currentTime = now.toLocaleTimeString('es-PE');

    const receipt = {
      businessName: 'Tecnicentro JR',
      address: store.address || 'Dirección no disponible',
      phone: store.phone || 'Teléfono no disponible',
      currentDate,
      currentTime,
      orderNumber: service.order.orderNumber,
      sellerName: seller?.name || 'Vendedor no identificado',
      clientName: client?.name || 'Cliente no identificado',
      clientDni: client?.dni || 'N/A',
      clientPhone: client?.phone || 'N/A',
      paidAmount,
      order: {
        id: service.order.id,
        orderNumber: service.order.orderNumber,
        totalAmount: service.order.totalAmount,
        status: service.order.status,
        createdAt: service.order.createdAt
      }
    };

    return {
      receipt,
      service: {
        ...service,
        payments: []
      },
      payments
    };
  }

  async getCashCloseReceipt(sessionId: string, user: any): Promise<CashCloseReceiptResponseDto> {
    const tenantId = this.getTenantIdOrThrow(user);
    // Obtener la sesión de caja con movimientos
    const cashSession = await this.prisma.cashSession.findFirst({
      where: {
        id: sessionId,
        Store: {
          tenantId,
        },
      },
      include: {
        Store: true,
        cashMovements: {
          include: {
            order: {
              select: {
                id: true,
                clientId: true,
                orderNumber: true,
              },
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!cashSession) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }

    if (cashSession.status !== 'CLOSED') {
      throw new NotFoundException('La sesión de caja no está cerrada');
    }

    // Obtener información de la tienda
    const store = cashSession.Store;
    if (!store) {
      throw new NotFoundException('La sesión no está asociada a una tienda');
    }

    const cashier = await this.prisma.user.findFirst({
      where: {
        id: cashSession.UserId,
        tenantId,
      },
      select: { id: true, name: true, email: true },
    });

    // Formatear fecha y hora
    const now = new Date(cashSession.closedAt || cashSession.openedAt);
    const currentDate = now.toLocaleDateString('es-PE');
    const currentTime = now.toLocaleTimeString('es-PE');

    const receipt = {
      businessName: 'Tecnicentro JR',
      address: store.address || 'Dirección no disponible',
      phone: store.phone || 'Teléfono no disponible',
      currentDate,
      currentTime,
      orderNumber: `CIERRE-${cashSession.id.slice(0, 8)}`,
      sellerName: cashier?.name || 'Cajero no identificado',
      clientName: 'N/A',
      clientDni: 'N/A',
      clientPhone: 'N/A',
      paidAmount: cashSession.closingAmount || 0,
      order: {
        id: cashSession.id,
        openingAmount: cashSession.openingAmount,
        closingAmount: cashSession.closingAmount,
        status: cashSession.status,
        openedAt: cashSession.openedAt,
        closedAt: cashSession.closedAt
      }
    };

    return {
      receipt,
      cashSession,
      movements: cashSession.cashMovements.map((m: any) => ({
        ...m,
        order: m.order
          ? {
              ...m.order,
              client: null,
            }
          : null,
      }))
    };
  }
}
