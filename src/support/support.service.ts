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
}
