import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPaginatedResponse, getPaginationParams } from '../common/pagination/pagination.helper';
import { WarehouseAccessService } from '../warehouse-common/warehouse-access.service';
import { CreateWarehouseProductDto } from './dto/create-warehouse-product.dto';
import { UpdateWarehouseProductDto } from './dto/update-warehouse-product.dto';
import { ListWarehouseProductsDto } from './dto/list-warehouse-products.dto';

type AuthUser = {
  userId: string;
  role: string;
  tenantId?: string;
  activeLoginMode?: 'STORE' | 'WAREHOUSE' | null;
  activeWarehouseId?: string | null;
};

@Injectable()
export class WarehouseProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly warehouseAccessService: WarehouseAccessService,
  ) {}

  async create(user: AuthUser, dto: CreateWarehouseProductDto) {
    const tenantId = this.warehouseAccessService.getTenantIdOrThrow(user);
    const warehouseId = await this.warehouseAccessService.assertWarehouseAccess(user);

    const product = await this.prisma.product.findFirst({
      where: {
        id: dto.productId,
        isDeleted: false,
        createdBy: { tenantId },
      },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado en el tenant');
    }

    const exists = await this.prisma.warehouseProduct.findFirst({
      where: {
        warehouseId,
        productId: dto.productId,
      },
      select: { id: true },
    });

    if (exists) {
      throw new BadRequestException('El producto ya está registrado en el almacén');
    }

    return this.prisma.warehouseProduct.create({
      data: {
        warehouseId,
        productId: dto.productId,
        tenantId,
        stock: dto.stock ?? 0,
        stockThreshold: dto.stockThreshold ?? 0,
      },
      select: {
        id: true,
        warehouseId: true,
        productId: true,
        stock: true,
        stockThreshold: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async list(user: AuthUser, query: ListWarehouseProductsDto) {
    const warehouseId = await this.warehouseAccessService.assertWarehouseAccess(user);

    const { page, pageSize, skip } = getPaginationParams({
      page: query.page,
      pageSize: query.pageSize,
      defaultPage: 1,
      defaultPageSize: 20,
      maxPageSize: 100,
    });

    const where: any = {
      warehouseId,
      product: { isDeleted: false },
      ...(query.q
        ? {
            product: {
              isDeleted: false,
              name: { contains: query.q, mode: 'insensitive' },
            },
          }
        : {}),
      ...(query.inStock ? { stock: { gt: 0 } } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.warehouseProduct.count({ where }),
      this.prisma.warehouseProduct.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              buyCost: true,
              basePrice: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return buildPaginatedResponse(rows, total, page, pageSize);
  }

  async findOne(user: AuthUser, id: string) {
    const warehouseId = await this.warehouseAccessService.assertWarehouseAccess(user);

    const row = await this.prisma.warehouseProduct.findFirst({
      where: { id, warehouseId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            buyCost: true,
            basePrice: true,
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Producto de almacén no encontrado');
    }

    return row;
  }

  async update(user: AuthUser, id: string, dto: UpdateWarehouseProductDto) {
    const warehouseId = await this.warehouseAccessService.assertWarehouseAccess(user);

    const existing = await this.prisma.warehouseProduct.findFirst({
      where: { id, warehouseId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Producto de almacén no encontrado');
    }

    return this.prisma.warehouseProduct.update({
      where: { id },
      data: {
        ...(dto.stockThreshold !== undefined ? { stockThreshold: dto.stockThreshold } : {}),
      },
      select: {
        id: true,
        warehouseId: true,
        productId: true,
        stock: true,
        stockThreshold: true,
        updatedAt: true,
      },
    });
  }

  async remove(user: AuthUser, id: string) {
    const warehouseId = await this.warehouseAccessService.assertWarehouseAccess(user);

    const existing = await this.prisma.warehouseProduct.findFirst({
      where: { id, warehouseId },
      select: { id: true, stock: true },
    });

    if (!existing) {
      throw new NotFoundException('Producto de almacén no encontrado');
    }

    if (existing.stock !== 0) {
      throw new ForbiddenException('No se puede eliminar un producto con stock distinto de 0');
    }

    await this.prisma.warehouseProduct.delete({ where: { id } });
    return { success: true };
  }
}
