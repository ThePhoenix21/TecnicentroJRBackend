import { Order as PrismaOrder, SaleStatus, Service, OrderProduct } from '@prisma/client';

export class Order implements PrismaOrder {
  id: string;
  totalAmount: number;
  status: SaleStatus;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  clientId: string;
  orderProducts?: OrderProduct[];
  services?: Service[];
}
