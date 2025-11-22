import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentType, PaymentSourceType } from '@prisma/client';

export interface CreatePaymentDto {
  type: PaymentType;
  amount: number;
  sourceType: PaymentSourceType;
  sourceId: string;
}

@Injectable()
export class PaymentService {
  constructor(private prisma: PrismaService) {}

  async createPayments(payments: CreatePaymentDto[]) {
    if (!payments || payments.length === 0) {
      return [];
    }

    // Crear los pagos uno por uno para obtener los IDs
    const createdPayments: any[] = [];
    for (const payment of payments) {
      const created = await this.prisma.payment.create({
        data: payment,
      });
      createdPayments.push(created);
    }

    return createdPayments;
  }

  async getPaymentsBySource(sourceType: PaymentSourceType, sourceId: string) {
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

  async deletePayment(id: string) {
    return this.prisma.payment.delete({
      where: {
        id,
      },
    });
  }

  async updatePayment(id: string, data: Partial<CreatePaymentDto>) {
    return this.prisma.payment.update({
      where: {
        id,
      },
      data,
    });
  }
}
