import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentType, PaymentSourceType } from '@prisma/client';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
};

export interface CreatePaymentDto {
  type: PaymentType;
  amount: number;
  sourceType: PaymentSourceType;
  sourceId: string;
}

@Injectable()
export class PaymentService {
  constructor(private prisma: PrismaService) {}

  private async assertPaymentSourceAccess(sourceType: PaymentSourceType, sourceId: string, user: AuthUser) {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    if (sourceType === PaymentSourceType.SERVICE) {
      const svc = await this.prisma.service.findFirst({
        where: {
          id: sourceId,
          order: {
            cashSession: {
              Store: {
                tenantId,
              },
            },
          },
        },
        select: { id: true },
      });

      if (!svc) {
        throw new NotFoundException('No tienes permisos para usar este servicio como fuente de pago');
      }

      return;
    }

    if (sourceType === PaymentSourceType.ORDERPRODUCT) {
      const op = await this.prisma.orderProduct.findFirst({
        where: {
          id: sourceId,
          order: {
            cashSession: {
              Store: {
                tenantId,
              },
            },
          },
        },
        select: { id: true },
      });

      if (!op) {
        throw new NotFoundException('No tienes permisos para usar este producto de orden como fuente de pago');
      }

      return;
    }

    throw new NotFoundException('Fuente de pago inválida');
  }

  async createPayments(payments: CreatePaymentDto[], user: AuthUser) {
    if (!payments || payments.length === 0) {
      return [];
    }

    // Crear los pagos uno por uno para obtener los IDs
    const createdPayments: any[] = [];
    for (const payment of payments) {
      await this.assertPaymentSourceAccess(payment.sourceType, payment.sourceId, user);
      const created = await this.prisma.payment.create({
        data: payment,
      });
      createdPayments.push(created);
    }

    return createdPayments;
  }

  async getPaymentsBySource(sourceType: PaymentSourceType, sourceId: string, user: AuthUser) {
    await this.assertPaymentSourceAccess(sourceType, sourceId, user);
    return this.prisma.payment.findMany({
      where: {
        sourceType,
        sourceId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async deletePayment(id: string, user: AuthUser) {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }

    const existing = await this.prisma.payment.findUnique({
      where: { id },
      select: { id: true, sourceType: true, sourceId: true },
    });

    if (!existing) {
      throw new NotFoundException('Pago no encontrado');
    }

    await this.assertPaymentSourceAccess(existing.sourceType, existing.sourceId, user);
    return this.prisma.payment.delete({
      where: {
        id,
      },
    });
  }

  async updatePayment(id: string, data: Partial<CreatePaymentDto>, user: AuthUser) {
    const existing = await this.prisma.payment.findUnique({
      where: { id },
      select: { id: true, sourceType: true, sourceId: true },
    });

    if (!existing) {
      throw new NotFoundException('Pago no encontrado');
    }

    await this.assertPaymentSourceAccess(existing.sourceType, existing.sourceId, user);

    if (data.sourceType || data.sourceId) {
      const sourceType = (data.sourceType ?? existing.sourceType) as PaymentSourceType;
      const sourceId = (data.sourceId ?? existing.sourceId) as string;
      await this.assertPaymentSourceAccess(sourceType, sourceId, user);
    }

    return this.prisma.payment.update({
      where: {
        id,
      },
      data,
    });
  }
}
