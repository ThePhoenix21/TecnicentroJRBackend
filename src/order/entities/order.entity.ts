import { Order as PrismaOrder, SaleStatus, Service, OrderProduct, PaymentMethod, Client, User } from '@prisma/client';

export class Order implements PrismaOrder {
  id: string;
  totalAmount: number;
  status: SaleStatus;
  isPriceModified: boolean;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  clientId: string;
  orderProducts?: OrderProduct[];
  services?: Service[];
  paymentMethods?: PaymentMethod[];
  orderNumber: string;
  cashSessionsId: string | null;
  client?: Client;
  
  // Nuevos campos de auditoría de anulaciones (tipos exactos de Prisma)
  canceledAt: Date | null;
  canceledById: string | null;
  canceledBy?: User | null;
  user?: User | null; // Usuario que creó la orden
}
