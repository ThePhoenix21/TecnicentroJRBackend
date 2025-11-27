import { Order as PrismaOrder, SaleStatus, Service, OrderProduct, Payment, Client } from '@prisma/client';

export class Order implements PrismaOrder {
  id: string;
  totalAmount: number;
  status: SaleStatus;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  clientId: string;
  orderProducts?: (OrderProduct & { payments?: Payment[] })[];
  services?: (Service & { payments?: Payment[] })[];
  orderNumber: string;
  cashSessionsId: string | null;
  client?: Client;
}
