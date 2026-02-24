import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../common/utility/supabase-storage.util';
import { DocumentStatus, EmployedStatus } from '@prisma/client';
import { ListEmployedDto } from './dto/list-employed.dto';

function safeSlug(input: string): string {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

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
  size?: number;
};

@Injectable()
export class EmployedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseStorage: SupabaseStorageService,
  ) {}

  private async closeOpenHistory(
    prisma: PrismaService | any,
    employedId: string,
    input: { endedAt: Date; reason: string },
    actorUserId: string,
  ) {
    const open = await prisma.employedHistory.findFirst({
      where: {
        employedId,
        endedAt: null,
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!open) {
      return;
    }

    await (prisma.employedHistory as any).update({
      where: { id: open.id },
      data: {
        endedAt: input.endedAt,
        reason: input.reason,
        updatedByUserId: actorUserId,
      },
    });
  }

  async bulkChangeStatus(
    input: { ids: string[]; status: string; reason?: string },
    user: AuthUser,
  ) {
    const tenantId = this.getTenantIdOrThrow(user);
    const actorUserId = this.getAuthUserIdOrThrow(user);

    const targetStatus = input.status as EmployedStatus;
    const now = new Date();

    const employees = await (this.prisma.employed as any).findMany({
      where: {
        id: { in: input.ids },
        OR: [
          { createdByUser: { tenantId } },
          { storeAssignments: { some: { store: { tenantId } } } },
          { warehouseAssignments: { some: { warehouse: { tenantId } } } },
        ],
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
      },
    });

    const foundIds = new Set(employees.map((e: any) => e.id));
    const notFoundOrForbiddenIds = input.ids.filter((id) => !foundIds.has(id));

    await this.prisma.$transaction(async (prisma) => {
      for (const e of employees) {
        if (targetStatus === EmployedStatus.INACTIVE) {
          await this.closeOpenHistory(
            prisma,
            e.id,
            { endedAt: now, reason: input.reason ?? 'cambio_masivo' },
            actorUserId,
          );
        }

        if (targetStatus === EmployedStatus.ACTIVE && e.status === EmployedStatus.INACTIVE) {
          await prisma.employedHistory.create({
            data: {
              employedId: e.id,
              hiredAt: now,
              endedAt: null,
              reason: input.reason ?? 'reingreso',
              createdById: actorUserId,
            },
          });
        }

        await prisma.employed.update({
          where: { id: e.id },
          data: { status: targetStatus },
        });
      }
    });

    return {
      requestedCount: input.ids.length,
      updatedCount: employees.length,
      notFoundOrForbiddenIds,
      statusApplied: targetStatus,
    };
  }

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

  private buildEmployeeDocumentFileName(originalname: string): string {
    const ext = originalname.includes('.') ? `.${originalname.split('.').pop()}` : '';
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
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

  async lookup(user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    return (this.prisma.employed as any).findMany({
      where: {
        deletedAt: null,
        OR: [
          { createdByUser: { tenantId } },
          { storeAssignments: { some: { store: { tenantId } } } },
          { warehouseAssignments: { some: { warehouse: { tenantId } } } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
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

  async createWithDocuments(
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
    files: FileUpload[] | undefined,
    user: AuthUser,
  ) {
    const created = await this.create(input, user);
    const employedId = created?.id;
    if (!employedId) {
      throw new BadRequestException('No se pudo crear el empleado');
    }

    if (!files || files.length === 0) {
      return { employed: created, documents: [] };
    }

    const actorUserId = this.getAuthUserIdOrThrow(user);

    const uploadedRecords: Array<{
      url: string;
      originalName: string;
      mimeType: string;
      size: number;
    }> = [];
    const failedDocuments: string[] = [];

    for (const file of files) {
      try {
        const uploaded = await this.supabaseStorage.uploadEmployeeDocument(
          file,
          employedId,
          this.buildEmployeeDocumentFileName(file.originalname),
        );

        uploadedRecords.push({
          url: uploaded.url,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size ?? file.buffer.length,
        });
      } catch {
        failedDocuments.push(file.originalname);
      }
    }

    if (uploadedRecords.length > 0) {
      await this.prisma.employeeDocument.createMany({
        data: uploadedRecords.map((u) => ({
          employedId,
          url: u.url,
          originalName: u.originalName,
          mimeType: u.mimeType,
          size: u.size,
          updatedByUserId: actorUserId,
        })),
      });
    }

    const documents = await this.prisma.employeeDocument.findMany({
      where: { employedId, status: DocumentStatus.ACTIVE },
      select: {
        id: true,
        url: true,
        originalName: true,
        mimeType: true,
        status: true,
        size: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (failedDocuments.length > 0) {
      return {
        employed: created,
        documents,
        warning:
          'Empleado creado correctamente, pero uno o más documentos no pudieron guardarse. Intenta subirlos más tarde.',
        failedDocuments,
      };
    }

    return { employed: created, documents };
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
        documents: {
          where: { status: DocumentStatus.ACTIVE },
          orderBy: { createdAt: 'desc' },
        },
        employedHistories: {
          orderBy: { createdAt: 'desc' },
          include: {
            createdBy: {
              select: { id: true, email: true, name: true },
            },
            updatedByUser: {
              select: { id: true, email: true, name: true },
            },
          },
        },
      },
    });

    if (!employed) throw new NotFoundException('Empleado no encontrado');

    const storeAssignment = employed.storeAssignments?.[0] ?? null;
    const warehouseAssignment = employed.warehouseAssignments?.[0] ?? null;
    const assignment = storeAssignment
      ? {
          type: 'STORE',
          role: storeAssignment.role ?? null,
          store: {
            id: storeAssignment.store.id,
            name: storeAssignment.store.name,
          },
          warehouse: null,
          assignedAt: storeAssignment.assignedAt,
        }
      : warehouseAssignment
      ? {
          type: 'WAREHOUSE',
          role: warehouseAssignment.role ?? null,
          store: null,
          warehouse: {
            id: warehouseAssignment.warehouse.id,
            name: warehouseAssignment.warehouse.name,
          },
          assignedAt: warehouseAssignment.assignedAt,
        }
      : null;

    const filesBaseUrl = process.env.FILES_BASE_URL ?? process.env.APP_URL ?? 'http://localhost:3000';

    return {
      id: employed.id,
      firstName: employed.firstName,
      lastName: employed.lastName,
      fullName: `${employed.firstName} ${employed.lastName}`.trim(),
      documentNumber: employed.document,
      phone: employed.phone,
      email: employed.email,
      position: employed.position,
      status: employed.status,
      userId: employed.userId ?? null,
      assignment,
      audit: {
        createdAt: employed.createdAt,
        updatedAt: employed.updatedAt,
        deletedAt: employed.deletedAt,
        createdBy: employed.createdByUser
          ? {
              id: employed.createdByUser.id,
              name: employed.createdByUser.name,
              email: employed.createdByUser.email,
            }
          : null,
      },
      documents: (employed.documents ?? []).map((doc: any) => {
        const hasAbsoluteUrl = typeof doc.url === 'string' && /^https?:\/\//i.test(doc.url);
        const viewUrl = hasAbsoluteUrl ? doc.url : `${filesBaseUrl}/files/employed/${doc.id}/view`;
        const downloadUrl = hasAbsoluteUrl
          ? `${doc.url}${doc.url.includes('?') ? '&' : '?'}download=${encodeURIComponent(doc.originalName ?? 'document')}`
          : `${filesBaseUrl}/files/employed/${doc.id}/download`;

        return {
          id: doc.id,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          size: doc.size,
          status: doc.status === DocumentStatus.ACTIVE ? 'UPLOADED' : doc.status,
          uploadedAt: doc.createdAt,
          links: {
            view: viewUrl,
            download: downloadUrl,
          },
        };
      }),
      history: (employed.employedHistories ?? []).map((history: any) => ({
        id: history.id,
        hiredAt: history.hiredAt,
        endedAt: history.endedAt,
        reason: history.reason,
        createdAt: history.createdAt,
        createdBy: history.createdBy
          ? {
              id: history.createdBy.id,
              name: history.createdBy.name,
            }
          : null,
      })),
    };
  }

  async list(query: ListEmployedDto, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    const where: any = {
      OR: [
        { createdByUser: { tenantId } },
        { storeAssignments: { some: { store: { tenantId } } } },
        { warehouseAssignments: { some: { warehouse: { tenantId } } } },
      ],
      deletedAt: null,
    };

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.firstName) {
      where.firstName = { contains: query.firstName, mode: 'insensitive' };
    }

    if (query?.lastName) {
      where.lastName = { contains: query.lastName, mode: 'insensitive' };
    }

    if (query?.position) {
      where.position = { contains: query.position, mode: 'insensitive' };
    }

    if (query?.storeId) {
      where.storeAssignments = {
        some: { storeId: query.storeId, store: { tenantId } },
      };
    }

    if (query?.warehouseId) {
      where.warehouseAssignments = {
        some: { warehouseId: query.warehouseId, warehouse: { tenantId } },
      };
    }

    if (query?.fromDate || query?.toDate) {
      where.createdAt = {
        ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
        ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
      };
    }

    const employees = await (this.prisma.employed as any).findMany({
      where,
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
        employedHistories: {
          orderBy: { createdAt: 'desc' },
          include: {
            createdBy: {
              select: { id: true, email: true, name: true },
            },
            updatedByUser: {
              select: { id: true, email: true, name: true },
            },
          },
        },
      },
      orderBy: { deletedAt: 'desc' },
    });

    return employees;
  }

  async uploadDocuments(employedId: string, files: FileUpload[], user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    await this.findEmployedOrThrow(employedId, tenantId);

    if (!files || files.length === 0) {
      throw new BadRequestException('No se enviaron archivos');
    }

    const actorUserId = this.getAuthUserIdOrThrow(user);

    const uploadedRecords: Array<{
      url: string;
      originalName: string;
      mimeType: string;
      size: number;
    }> = [];
    const failedDocuments: string[] = [];

    for (const file of files) {
      try {
        const uploaded = await this.supabaseStorage.uploadEmployeeDocument(
          file,
          employedId,
          this.buildEmployeeDocumentFileName(file.originalname),
        );

        uploadedRecords.push({
          url: uploaded.url,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size ?? file.buffer.length,
        });
      } catch {
        failedDocuments.push(file.originalname);
      }
    }

    if (uploadedRecords.length > 0) {
      await this.prisma.employeeDocument.createMany({
        data: uploadedRecords.map((upload) => ({
          employedId,
          url: upload.url,
          originalName: upload.originalName,
          mimeType: upload.mimeType,
          size: upload.size,
          updatedByUserId: actorUserId,
        })),
      });
    }

    const documents = await this.prisma.employeeDocument.findMany({
      where: { employedId, status: DocumentStatus.ACTIVE },
      select: {
        id: true,
        url: true,
        originalName: true,
        mimeType: true,
        status: true,
        size: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const response: any = {
      id: employedId,
      documents,
    };

    if (failedDocuments.length > 0) {
      response.warning =
        'Uno o más documentos no pudieron guardarse correctamente. Intenta subirlos más tarde.';
      response.failedDocuments = failedDocuments;
    }

    return response;
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

      await this.closeOpenHistory(
        prisma,
        employedId,
        { endedAt: new Date(), reason: reason ?? 'despido' },
        creatorUserId,
      );

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

  async lookupPositions(user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);

    const positions = await (this.prisma.employed as any).findMany({
      where: {
        deletedAt: null,
        OR: [
          { createdByUser: { tenantId } },
          { storeAssignments: { some: { store: { tenantId } } } },
          { warehouseAssignments: { some: { warehouse: { tenantId } } } },
        ],
        position: { not: null },
      },
      distinct: ['position'],
      select: {
        position: true,
      },
      orderBy: { position: 'asc' },
    });

    return positions
      .map((item: { position: string | null }) => item.position)
      .filter((position): position is string => Boolean(position));
  }

  async lookupStatus() {
    return Object.values(EmployedStatus);
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
      await this.closeOpenHistory(
        prisma,
        employedId,
        { endedAt: new Date(), reason: 'correccion_dni' },
        creatorUserId,
      );

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

  async softDelete(employedId: string, reason: string | undefined, user: AuthUser) {
    const tenantId = this.getTenantIdOrThrow(user);
    const actorUserId = this.getAuthUserIdOrThrow(user);
    const employed = await this.findEmployedOrThrow(employedId, tenantId);

    if (employed.deletedAt) {
      throw new BadRequestException('El empleado ya está eliminado');
    }

    return this.prisma.$transaction(async (prisma) => {
      // Cerrar historial abierto si existe
      await this.closeOpenHistory(
        prisma,
        employedId,
        { endedAt: new Date(), reason: reason ?? 'eliminacion' },
        actorUserId,
      );

      // Marcar como eliminado
      const updated = await prisma.employed.update({
        where: { id: employedId },
        data: {
          deletedAt: new Date(),
          status: EmployedStatus.INACTIVE,
        },
      });

      return {
        id: updated.id,
        deletedAt: updated.deletedAt,
        reason: reason ?? 'eliminacion',
      };
    });
  }
}
