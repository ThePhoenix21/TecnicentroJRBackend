import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
};

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  private getAuthUserIdOrThrow(user: AuthUser): string {
    const anyUser = user as any;
    const userId = user?.userId ?? anyUser?.sub ?? anyUser?.id;
    if (!userId) {
      throw new ForbiddenException('No se pudo obtener el id del usuario desde el token');
    }
    return String(userId);
  }

  async createTicket(input: { subject: string; message: string }, user: AuthUser) {
    const createdByUserId = this.getAuthUserIdOrThrow(user);

    await (this.prisma.supportTicket as any).create({
      data: {
        subject: input.subject,
        message: input.message,
        createdByUserId,
      },
      select: { id: true },
    });

    return { message: 'Ticket enviado correctamente' };
  }

  async listMyTickets(user: AuthUser) {
    const createdByUserId = this.getAuthUserIdOrThrow(user);

    return (this.prisma.supportTicket as any).findMany({
      where: { createdByUserId },
      select: {
        id: true,
        status: true,
        priority: true,
        subject: true,
        message: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async assertUserExistsOrThrow(userId: string) {
    const exists = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('Usuario no encontrado');
    }
  }

  async listTicketsByUserId(userId: string) {
    await this.assertUserExistsOrThrow(userId);

    return (this.prisma.supportTicket as any).findMany({
      where: { createdByUserId: userId },
      select: {
        status: true,
        priority: true,
        subject: true,
        message: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAllTickets() {
    return (this.prisma.supportTicket as any).findMany({
      select: {
        status: true,
        priority: true,
        subject: true,
        message: true,
        createdByUserId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTicketById(ticketId: string, user: AuthUser) {
    const userId = this.getAuthUserIdOrThrow(user);

    const ticket = await (this.prisma.supportTicket as any).findFirst({
      where: {
        id: ticketId,
        OR: [
          { createdByUserId: userId },
          { createdByUserId: undefined }
        ]
      },
      select: {
        subject: true,
        message: true,
        priority: true,
        status: true,
        createdAt: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }

    return ticket;
  }

  async cancelTicket(ticketId: string, user: AuthUser) {
    const userId = this.getAuthUserIdOrThrow(user);

    const ticket = await (this.prisma.supportTicket as any).findFirst({
      where: {
        id: ticketId,
        createdByUserId: userId,
      },
      select: { id: true, status: true },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado o no tienes permiso para cancelarlo');
    }

    if (ticket.status === 'CANCELLED') {
      return { success: true, message: 'El ticket ya estaba cancelado' };
    }

    await (this.prisma.supportTicket as any).update({
      where: { id: ticketId },
      data: { status: 'CANCELLED' },
      select: { id: true },
    });

    return { success: true, message: 'Ticket cancelado correctamente' };
  }
}
