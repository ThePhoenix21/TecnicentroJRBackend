import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../common/utility/supabase-storage.util';
import { EmployedStatus } from '@prisma/client';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
};

type FileUpload = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Injectable()
export class EmployedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseStorage: SupabaseStorageService,
  ) {}

  private getAuthUserIdOrThrow(user: AuthUser): string {
    const anyUser = user as any;
    const userId = user?.userId ?? anyUser?.sub ?? anyUser?.id;
    if (!userId) {
      throw new ForbiddenException('No se pudo obtener el id del usuario desde el token');
    }
    return String(userId);
  }

  private async buildBasicResponse(prisma: PrismaService | any, employedId: string, tenantId: string) {
    const employed = await (prisma.employed as any).findFirst({
      where: {
        id: employedId,
        OR: [
          { createdByUser: { tenantId } },
          { storeAssignments: { some: { store: { tenantId } } } },
          { warehouseAssignments: { some: { warehouse: { tenantId } } } },
        ],
        deletedAt: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        storeAssignments: {
          where: { store: { tenantId } },
          select: {
            store: { select: { name: true } },
          },
          take: 1,
        },
        warehouseAssignments: {
          where: { warehouse: { tenantId } },
          select: {
            warehouse: { select: { name: true } },
          },
          take: 1,
        },
      },
    });

    if (!employed) throw new NotFoundException('Empleado no encontrado');

    const storeName = employed.storeAssignments?.[0]?.store?.name;
    const warehouseName = employed.warehouseAssignments?.[0]?.warehouse?.name;

    return {
      id: employed.id,
      firstName: employed.firstName,
      lastName: employed.lastName,
      position: employed.position,
      assignmentName: storeName ?? warehouseName ?? null,
    };
  }

  private getTenantIdOrThrow(user: AuthUser): string {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant no encontrado en el token');
    }
    return tenantId;
  }

  private assertSingleAssignment(input: { storeId?: string; warehouseId?: string }) {
    const hasStore = Boolean(input.storeId);
    const hasWarehouse = Boolean(input.warehouseId);

    if (hasStore === hasWarehouse) {
      throw new BadRequestException('Debe asignar el empleado a exactamente 1: storeId o warehouseId');
    }
  }

  private async assertStoreTenant(storeId: string, tenantId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId },
      select: { id: true },
    });
    if (!store) throw new ForbiddenException('No tienes permisos para usar esta tienda');
  }

  private async assertWarehouseTenant(warehouseId: string, tenantId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
      select: { id: true },
    });
    if (!warehouse) throw new ForbiddenException('No tienes permisos para usar este almacén');
  }

  private async findEmployedOrThrow(employedId: string, tenantId: string) {
    const employed = await (this.prisma.employed as any).findFirst({
      where: {
        id: employedId,
        OR: [
          { createdByUser: { tenantId } },
          { storeAssignments: { some: { store: { tenantId } } } },
          { warehouseAssignments: { some: { warehouse: { tenantId } } } },
        ],
        deletedAt: null,
      },
      include: {
        storeAssignments: {
          where: { store: { tenantId } },
          include: { store: true },
        },
        warehouseAssignments: {
          where: { warehouse: { tenantId } },
          include: { warehouse: true },
        },
      },
    });

    if (!employed) throw new NotFoundException('Empleado no encontrado');

    return employed;
  }

  async create(
    input: {
      firstName: string;
      lastName: string;
      document?: string;
      phone?: string;
      email?: string;
      position?: string;
      storeId?: string;
      warehouseId?: string;
      assignmentRole?: string;
    },
    user: AuthUser,
  ) {
    const tenantId = this.getTenantIdOrThrow(user);
    const creatorUserId = this.getAuthUserIdOrThrow(user);
    this.assertSingleAssignment(input);

    if (input.storeId) await this.assertStoreTenant(input.storeId, tenantId);
    if (input.warehouseId) await this.assertWarehouseTenant(input.warehouseId, tenantId);

    return this.prisma.$transaction(async (prisma) => {
      const employed = await prisma.employed.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          document: input.document ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          position: input.position ?? null,
          createdByUserId: creatorUserId,
        },
      });

      if (input.storeId) {
        await prisma.storeEmployed.create({
          data: {
            employedId: employed.id,
            storeId: input.storeId,
            role: input.assignmentRole ?? null,
          },
        });
      }

      if (input.warehouseId) {
        await prisma.warehouseEmployed.create({
          data: {
            employedId: employed.id,
            warehouseId: input.warehouseId,
            role: input.assignmentRole ?? null,
          },
        });
      }

      await prisma.employedHistory.create({
        data: {
          employedId: employed.id,
          hiredAt: new Date(),
          endedAt: null,
          reason: 'ingreso',
          createdById: creatorUserId,
        },
      });

      return this.buildBasicResponse(prisma, employed.id, tenantId);
    });
  }

  async update(
    employedId: string,
    input: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
      position?: string;
      status?: string;
    },
    user: AuthUser,
  ) {
    const tenantId = this.getTenantIdOrThrow(user);
    await this.findEmployedOrThrow(employedId, tenantId);

    const status = input.status as EmployedStatus | undefined;

    await this.prisma.employed.update({
      where: { id: employedId },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(status ? { status } : {}),
      },
    });

    const updatedFields = Object.entries(input)
      .filter(([, v]) => v !== undefined)
      .map(([field, value]) => ({ field, value }));

    return {
      ...(await this.buildBasicResponse(this.prisma, employedId, tenantId)),
      updatedFields,
    };
  }

  async getSimple(employedId: string, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    const employed = await this.prisma.employed.findFirst({
      where: {
        id: employedId,
        createdByUser: { tenantId },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });

    if (!employed) throw new NotFoundException('Empleado no encontrado');

    return employed;
  }

  async getFull(employedId: string, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    const employed = await (this.prisma.employed as any).findFirst({
      where: {
        id: employedId,
        OR: [
          { createdByUser: { tenantId } },
          { storeAssignments: { some: { store: { tenantId } } } },
          { warehouseAssignments: { some: { warehouse: { tenantId } } } },
        ],
        deletedAt: null,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
        createdByUser: {
          select: { id: true, email: true, name: true },
        },
        storeAssignments: {
          where: { store: { tenantId } },
          include: { store: true },
        },
        warehouseAssignments: {
          where: { warehouse: { tenantId } },
          include: { warehouse: true },
        },
        employedHistories: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!employed) throw new NotFoundException('Empleado no encontrado');

    return employed;
  }

  async list(user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    const employees = await (this.prisma.employed as any).findMany({
      where: {
        OR: [
          { createdByUser: { tenantId } },
          { storeAssignments: { some: { store: { tenantId } } } },
          { warehouseAssignments: { some: { warehouse: { tenantId } } } },
        ],
        deletedAt: null,
      },
      include: {
        employedHistories: {
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
        storeAssignments: {
          where: { store: { tenantId } },
          include: { store: true },
        },
        warehouseAssignments: {
          where: { warehouse: { tenantId } },
          include: { warehouse: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return employees.map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      position: e.position,
      status: e.status,
      assignmentName: e.storeAssignments?.[0]?.store?.name ?? e.warehouseAssignments?.[0]?.warehouse?.name ?? null,
    }));
  }

  async listDeleted(user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    const employees = await (this.prisma.employed as any).findMany({
      where: {
        OR: [
          { createdByUser: { tenantId } },
          { storeAssignments: { some: { store: { tenantId } } } },
          { warehouseAssignments: { some: { warehouse: { tenantId } } } },
        ],
        deletedAt: { not: null },
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
        createdByUser: {
          select: { id: true, email: true, name: true },
        },
        storeAssignments: {
          where: { store: { tenantId } },
          include: { store: true },
        },
        warehouseAssignments: {
          where: { warehouse: { tenantId } },
          include: { warehouse: true },
        },
        employedHistories: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { deletedAt: 'desc' },
    });

    return employees;
  }

  async uploadDocuments(employedId: string, files: FileUpload[], user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    const employed = await this.findEmployedOrThrow(employedId, tenantId);

    if (!files || files.length === 0) {
      throw new BadRequestException('No se enviaron archivos');
    }

    const uploads = await Promise.all(
      files.map(async (file) => {
        const uploaded = await this.supabaseStorage.uploadFile(file, `employed/${employedId}`);
        return uploaded.url;
      }),
    );

    return this.prisma.employed.update({
      where: { id: employedId },
      data: {
        documentUrls: {
          set: [...(employed.documentUrls || []), ...uploads],
        },
      },
      select: {
        id: true,
        documentUrls: true,
      },
    });
  }

  async terminate(employedId: string, reason: string | undefined, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    const creatorUserId = this.getAuthUserIdOrThrow(user);
    const employed = await this.findEmployedOrThrow(employedId, tenantId);

    if (employed.status === EmployedStatus.INACTIVE) {
      throw new BadRequestException('El empleado ya está INACTIVE');
    }

    return this.prisma.$transaction(async (prisma) => {
      const updated = await prisma.employed.update({
        where: { id: employedId },
        data: { status: EmployedStatus.INACTIVE },
      });

      await prisma.employedHistory.create({
        data: {
          employedId,
          hiredAt: new Date(),
          endedAt: new Date(),
          reason: reason ?? 'despido',
          createdById: creatorUserId,
        },
      });

      return updated;
    });
  }

  async suspend(employedId: string, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    const employed = await this.findEmployedOrThrow(employedId, tenantId);

    if (employed.status === EmployedStatus.SUSPENDED) {
      throw new BadRequestException('El empleado ya está SUSPENDED');
    }

    return this.prisma.employed.update({
      where: { id: employedId },
      data: { status: EmployedStatus.SUSPENDED },
    });
  }

  async activate(employedId: string, reason: string | undefined, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    const creatorUserId = this.getAuthUserIdOrThrow(user);
    const employed = await this.findEmployedOrThrow(employedId, tenantId);

    if (employed.status === EmployedStatus.ACTIVE) {
      throw new BadRequestException('El empleado ya está ACTIVE');
    }

    return this.prisma.$transaction(async (prisma) => {
      const wasInactive = employed.status === EmployedStatus.INACTIVE;

      const updated = await prisma.employed.update({
        where: { id: employedId },
        data: { status: EmployedStatus.ACTIVE },
      });

      if (wasInactive) {
        await prisma.employedHistory.create({
          data: {
            employedId,
            hiredAt: new Date(),
            endedAt: null,
            reason: reason ?? 'reingreso',
            createdById: creatorUserId,
          },
        });
      }

      return updated;
    });
  }

  async reassign(
    employedId: string,
    input: { storeId?: string; warehouseId?: string; role?: string; reason?: string },
    user: AuthUser,
  ) {
    const tenantId = this.getTenantIdOrThrow(user);
    this.assertSingleAssignment(input);

    await this.findEmployedOrThrow(employedId, tenantId);

    if (input.storeId) await this.assertStoreTenant(input.storeId, tenantId);
    if (input.warehouseId) await this.assertWarehouseTenant(input.warehouseId, tenantId);

    return this.prisma.$transaction(async (prisma) => {
      await prisma.storeEmployed.deleteMany({ where: { employedId } });
      await prisma.warehouseEmployed.deleteMany({ where: { employedId } });

      if (input.storeId) {
        await prisma.storeEmployed.create({
          data: {
            employedId,
            storeId: input.storeId,
            role: input.role ?? null,
          },
        });
      }

      if (input.warehouseId) {
        await prisma.warehouseEmployed.create({
          data: {
            employedId,
            warehouseId: input.warehouseId,
            role: input.role ?? null,
          },
        });
      }

      return this.buildBasicResponse(prisma, employedId, tenantId);
    });
  }

  async softDeleteAndRecreate(
    employedId: string,
    input: {
      firstName: string;
      lastName: string;
      document?: string;
      phone?: string;
      email?: string;
      position?: string;
      storeId?: string;
      warehouseId?: string;
      assignmentRole?: string;
    },
    user: AuthUser,
  ) {
    const tenantId = this.getTenantIdOrThrow(user);
    const creatorUserId = this.getAuthUserIdOrThrow(user);
    this.assertSingleAssignment(input);

    const old = await this.findEmployedOrThrow(employedId, tenantId);

    if (input.document && old.document && input.document === old.document) {
      throw new BadRequestException('Para corrección de DNI, el nuevo document debe ser diferente');
    }

    return this.prisma.$transaction(async (prisma) => {
      await (prisma.employed as any).update({
        where: { id: employedId },
        data: {
          deletedAt: new Date(),
          status: EmployedStatus.INACTIVE,
        },
      });

      await prisma.storeEmployed.deleteMany({ where: { employedId } });
      await prisma.warehouseEmployed.deleteMany({ where: { employedId } });

      const created = await prisma.employed.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          document: input.document ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          position: input.position ?? null,
          createdByUserId: creatorUserId,
        },
      });

      if (input.storeId) {
        await prisma.storeEmployed.create({
          data: {
            employedId: created.id,
            storeId: input.storeId,
            role: input.assignmentRole ?? null,
          },
        });
      }

      if (input.warehouseId) {
        await prisma.warehouseEmployed.create({
          data: {
            employedId: created.id,
            warehouseId: input.warehouseId,
            role: input.assignmentRole ?? null,
          },
        });
      }

      await prisma.employedHistory.create({
        data: {
          employedId: created.id,
          hiredAt: new Date(),
          endedAt: null,
          reason: 'ingreso',
          createdById: creatorUserId,
        },
      });

      return this.buildBasicResponse(prisma, created.id, tenantId);
    });
  }
}
