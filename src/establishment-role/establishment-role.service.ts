import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AuthUser = {
  userId: string;
  tenantId?: string;
};

@Injectable()
export class EstablishmentRoleService {
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

    const existing = await this.prisma.establishmentRole.findUnique({
      where: {
        tenantId_name: { tenantId, name },
      },
      select: { id: true, name: true, deletedAt: true },
    });

    if (existing) {
      if (existing.deletedAt) {
        await this.prisma.establishmentRole.update({
          where: { id: existing.id },
          data: { deletedAt: null, updatedAt: new Date() },
        });
      }
      return { id: existing.id, name: existing.name };
    }

    const created = await this.prisma.establishmentRole.create({
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

    return this.prisma.establishmentRole.findMany({
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

    const role = await this.prisma.establishmentRole.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, deletedAt: true },
    });

    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }

    if (role.deletedAt) {
      throw new BadRequestException('El rol ya está eliminado');
    }

    const [storeEmployees, warehouseEmployees] = await Promise.all([
      this.prisma.storeEmployed.findMany({
        where: {
          establishmentRoleId: id,
          store: { tenantId },
        },
        select: {
          employed: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          store: {
            select: { name: true },
          },
        },
      }),
      this.prisma.warehouseEmployed.findMany({
        where: {
          establishmentRoleId: id,
          warehouse: { tenantId },
        },
        select: {
          employed: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          warehouse: {
            select: { name: true },
          },
        },
      }),
    ]);

    await this.prisma.establishmentRole.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    const warnings = [
      ...storeEmployees.map((e) => `${e.employed.firstName} ${e.employed.lastName} (${e.store.name})`),
      ...warehouseEmployees.map((e) => `${e.employed.firstName} ${e.employed.lastName} (${e.warehouse.name})`),
    ];

    return {
      success: true,
      message: 'Rol eliminado correctamente',
      warnings:
        warnings.length > 0
          ? `${warnings.length} empleado(s) aún tienen este rol asignado. Deberás cambiarlo manualmente.`
          : null,
      affectedEmployees: warnings,
    };
  }
}
