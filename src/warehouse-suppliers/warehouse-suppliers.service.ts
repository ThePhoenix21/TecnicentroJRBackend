import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPaginatedResponse, getPaginationParams } from '../common/pagination/pagination.helper';
import { WarehouseAccessService } from '../warehouse-common/warehouse-access.service';
import { CreateWarehouseSupplierDto } from './dto/create-warehouse-supplier.dto';
import { ListWarehouseSuppliersDto } from './dto/list-warehouse-suppliers.dto';
import { UpdateWarehouseSupplierDto } from './dto/update-warehouse-supplier.dto';

type AuthUser = {
  userId: string;
  role: string;
  tenantId?: string;
};

@Injectable()
export class WarehouseSuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly warehouseAccessService: WarehouseAccessService,
  ) {}

  async create(user: AuthUser, warehouseId: string, dto: CreateWarehouseSupplierDto) {
    const tenantId = this.warehouseAccessService.getTenantIdOrThrow(user);
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);
    const ruc = dto.ruc ? dto.ruc.trim() : null;

    if (ruc) {
      const existing = await this.prisma.provider.findFirst({
        where: {
          ruc,
          deletedAt: null,
          createdBy: { tenantId },
        },
        select: { id: true },
      });

      if (existing) {
        throw new BadRequestException('Ya existe un proveedor con ese RUC');
      }
    }

    return this.prisma.provider.create({
      data: {
        name: dto.name.trim(),
        ruc,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        address: dto.address ?? null,
        createdById: user.userId,
      },
      select: {
        id: true,
        name: true,
        ruc: true,
        phone: true,
        email: true,
        address: true,
        createdAt: true,
      },
    });
  }

  async list(user: AuthUser, warehouseId: string, query: ListWarehouseSuppliersDto) {
    const tenantId = this.warehouseAccessService.getTenantIdOrThrow(user);
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);
    const { page, pageSize, skip } = getPaginationParams({
      page: query.page,
      pageSize: query.pageSize,
      defaultPage: 1,
      defaultPageSize: 20,
      maxPageSize: 100,
    });

    const where: any = {
      deletedAt: null,
      createdBy: { tenantId },
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { ruc: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.provider.count({ where }),
      this.prisma.provider.findMany({
        where,
        select: {
          id: true,
          name: true,
          ruc: true,
          phone: true,
          email: true,
          address: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return buildPaginatedResponse(rows, total, page, pageSize);
  }

  async findOne(user: AuthUser, warehouseId: string, id: string) {
    const tenantId = this.warehouseAccessService.getTenantIdOrThrow(user);
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);

    const row = await this.prisma.provider.findFirst({
      where: {
        id,
        deletedAt: null,
        createdBy: { tenantId },
      },
      include: {
        providerProducts: {
          select: {
            id: true,
            buyCost: true,
            product: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    return row;
  }

  async update(user: AuthUser, warehouseId: string, id: string, dto: UpdateWarehouseSupplierDto) {
    const tenantId = this.warehouseAccessService.getTenantIdOrThrow(user);
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);

    const existing = await this.prisma.provider.findFirst({
      where: {
        id,
        deletedAt: null,
        createdBy: { tenantId },
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    return this.prisma.provider.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone ?? null } : {}),
        ...(dto.email !== undefined ? { email: dto.email ?? null } : {}),
        ...(dto.address !== undefined ? { address: dto.address ?? null } : {}),
      },
      select: {
        id: true,
        name: true,
        ruc: true,
        phone: true,
        email: true,
        address: true,
        updatedAt: true,
      },
    });
  }

  async remove(user: AuthUser, warehouseId: string, id: string) {
    const tenantId = this.warehouseAccessService.getTenantIdOrThrow(user);
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);

    const existing = await this.prisma.provider.findFirst({
      where: {
        id,
        deletedAt: null,
        createdBy: { tenantId },
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    await this.prisma.provider.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true },
    });

    return { success: true };
  }
}
