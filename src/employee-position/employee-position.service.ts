import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AuthUser = {
  userId: string;
  tenantId?: string;
};

@Injectable()
export class EmployeePositionService {
  constructor(private readonly prisma: PrismaService) {}

  private getTenantIdOrThrow(user?: AuthUser): string {
    if (!user?.tenantId) {
      throw new BadRequestException('Tenant no encontrado en el token');
    }
    return user.tenantId;
  }

  private getUserIdOrThrow(user?: AuthUser): string {
    if (!user?.userId) {
      throw new BadRequestException('Usuario no autenticado');
    }
    return user.userId;
  }

  async findOrCreate(name: string, user: AuthUser): Promise<{ id: string; name: string }> {
    const tenantId = this.getTenantIdOrThrow(user);
    const createdById = this.getUserIdOrThrow(user);

    const existing = await this.prisma.employeePosition.findUnique({
      where: {
        tenantId_name: { tenantId, name },
      },
      select: { id: true, name: true, deletedAt: true },
    });

    if (existing) {
      if (existing.deletedAt) {
        await this.prisma.employeePosition.update({
          where: { id: existing.id },
          data: { deletedAt: null, updatedAt: new Date() },
        });
      }
      return { id: existing.id, name: existing.name };
    }

    const created = await this.prisma.employeePosition.create({
      data: {
        name,
        tenantId,
        createdById,
      },
      select: { id: true, name: true },
    });

    return created;
  }

  async lookup(user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    return this.prisma.employeePosition.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async softDelete(id: string, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    const position = await this.prisma.employeePosition.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, deletedAt: true },
    });

    if (!position) {
      throw new NotFoundException('Posición no encontrada');
    }

    if (position.deletedAt) {
      throw new BadRequestException('La posición ya está eliminada');
    }

    const employeesWithPosition = await this.prisma.employed.findMany({
      where: {
        positionId: id,
        deletedAt: null,
        createdByUser: { tenantId },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        storeAssignments: {
          select: {
            store: { select: { name: true } },
          },
        },
        warehouseAssignments: {
          select: {
            warehouse: { select: { name: true } },
          },
        },
      },
    });

    await this.prisma.employeePosition.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    const warnings =
      employeesWithPosition.length > 0
        ? employeesWithPosition.map((e) => {
            const assignment =
              e.storeAssignments[0]?.store.name || e.warehouseAssignments[0]?.warehouse.name || 'Sin asignación';
            return `${e.firstName} ${e.lastName} (${assignment})`;
          })
        : [];

    return {
      success: true,
      message: 'Posición eliminada correctamente',
      warnings:
        warnings.length > 0
          ? `${warnings.length} empleado(s) aún tienen esta posición asignada. Deberás cambiarla manualmente.`
          : null,
      affectedEmployees: warnings,
    };
  }
}
