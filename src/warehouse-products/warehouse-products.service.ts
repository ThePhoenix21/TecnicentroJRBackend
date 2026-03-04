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
};

@Injectable()
export class WarehouseProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly warehouseAccessService: WarehouseAccessService,
  ) {}

  async create(user: AuthUser, warehouseId: string, dto: CreateWarehouseProductDto) {
    const tenantId = this.warehouseAccessService.getTenantIdOrThrow(user);
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);

    const userId = user?.userId;
    if (!userId) {
      throw new ForbiddenException('No se pudo obtener el id del usuario desde el token');
    }

    const shouldCreateCatalogProduct = dto.createNewProduct === true;

    let productId: string;
    let catalogBasePrice = 0;

    if (shouldCreateCatalogProduct) {
      if (!dto.name) {
        throw new BadRequestException('El nombre del producto es requerido cuando createNewProduct es true');
      }

      const created = await this.prisma.product.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          basePrice: dto.basePrice ?? null,
          buyCost: dto.buyCost ?? null,
          createdById: userId,
        } as any,
        select: { id: true, basePrice: true },
      });

      productId = created.id;
      catalogBasePrice = Number(created.basePrice ?? 0);
    } else {
      if (!dto.productId) {
        throw new BadRequestException('productId es requerido cuando createNewProduct es false');
      }

      const product = await this.prisma.product.findFirst({
        where: {
          id: dto.productId,
          isDeleted: false,
          createdBy: { tenantId },
        },
        select: { id: true, basePrice: true },
      });

      if (!product) {
        throw new NotFoundException('Producto no encontrado en el tenant');
      }

      productId = product.id;
      catalogBasePrice = Number(product.basePrice ?? 0);
    }

    const [allStores, allWarehouses] = await Promise.all([
      this.prisma.store.findMany({ where: { tenantId }, select: { id: true } }),
      this.prisma.warehouse.findMany({ where: { tenantId, deletedAt: null }, select: { id: true } }),
    ]);

    const [existingStoreProducts, existingWarehouseProducts] = await Promise.all([
      this.prisma.storeProduct.findMany({
        where: {
          productId,
          deletedAt: null,
          store: { tenantId },
        } as any,
        select: { storeId: true },
      } as any),
      this.prisma.warehouseProduct.findMany({
        where: {
          productId,
          warehouse: { tenantId, deletedAt: null },
        } as any,
        select: { warehouseId: true },
      } as any),
    ]);

    const existingStoreIds = new Set(existingStoreProducts.map((sp: any) => sp.storeId));
    const existingWarehouseIds = new Set(existingWarehouseProducts.map((wp: any) => wp.warehouseId));

    const storesToCreate = allStores.filter((s) => !existingStoreIds.has(s.id));
    const warehousesToCreate = allWarehouses.filter((w) => !existingWarehouseIds.has(w.id));

    const originWarehouseStock = dto.stock ?? 0;
    const originWarehouseThreshold = dto.stockThreshold ?? 0;

    const created = await this.prisma.$transaction(async (prisma) => {
      if (storesToCreate.length > 0) {
        await (prisma.storeProduct as any).createMany({
          data: storesToCreate.map((s) => ({
            productId,
            storeId: s.id,
            userId,
            tenantId,
            price: catalogBasePrice,
            stock: 0,
            stockThreshold: 0,
            deletedAt: null,
          })),
          skipDuplicates: true,
        });
      }

      if (warehousesToCreate.length > 0) {
        await (prisma.warehouseProduct as any).createMany({
          data: warehousesToCreate.map((w) => ({
            warehouseId: w.id,
            productId,
            tenantId,
            stock: w.id === warehouseId ? originWarehouseStock : 0,
            stockThreshold: w.id === warehouseId ? originWarehouseThreshold : 0,
          })),
          skipDuplicates: true,
        });
      }

      const origin = await prisma.warehouseProduct.findFirst({
        where: { warehouseId, productId },
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

      if (!origin) {
        throw new BadRequestException('No se pudo crear el producto en almacén');
      }

      return origin;
    });

    return created;
  }

  async list(user: AuthUser, warehouseId: string, query: ListWarehouseProductsDto) {
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);

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

  async getLookup(
    warehouseId: string,
    tenantId?: string,
    search?: string,
  ): Promise<Array<{ id: string; name: string }>> {
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    const where: any = {
      warehouseId,
      tenantId,
      warehouse: {
        tenantId,
        deletedAt: null,
      },
      product: {
        isDeleted: false,
      },
    };

    if (search) {
      where.product = {
        ...(where.product ?? {}),
        name: {
          contains: search,
          mode: 'insensitive',
        },
      };
    }

    const rows = await this.prisma.warehouseProduct.findMany({
      where,
      select: {
        id: true,
        product: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        product: {
          name: 'asc',
        },
      },
      take: 200,
    });

    return rows.map((r) => ({
      id: r.id,
      name: r.product?.name ?? 'Producto sin nombre',
    }));
  }

  async findOne(user: AuthUser, warehouseId: string, id: string) {
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);

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

  async update(user: AuthUser, warehouseId: string, id: string, dto: UpdateWarehouseProductDto) {
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);

    const existing = await this.prisma.warehouseProduct.findFirst({
      where: { id, warehouseId },
      select: { id: true, productId: true },
    });

    if (!existing) {
      throw new NotFoundException('Producto de almacén no encontrado');
    }

    const warehouseProductFields: any = {};
    if (dto.stock !== undefined) {
      warehouseProductFields.stock = dto.stock;
    }
    if (dto.stockThreshold !== undefined) {
      warehouseProductFields.stockThreshold = dto.stockThreshold;
    }

    const productFields: any = {};
    if (dto.name !== undefined) {
      productFields.name = dto.name;
    }
    if (dto.description !== undefined) {
      productFields.description = dto.description;
    }
    if (dto.basePrice !== undefined) {
      productFields.basePrice = dto.basePrice;
    }
    if (dto.buyCost !== undefined) {
      productFields.buyCost = dto.buyCost;
    }

    const updated = await this.prisma.$transaction(async (prisma) => {
      if (Object.keys(productFields).length > 0) {
        await prisma.product.update({
          where: { id: existing.productId },
          data: productFields,
        });
      }

      if (Object.keys(warehouseProductFields).length > 0) {
        await prisma.warehouseProduct.update({
          where: { id },
          data: warehouseProductFields,
        });
      }

      const row = await prisma.warehouseProduct.findFirst({
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
    });

    return updated;
  }

  async remove(user: AuthUser, warehouseId: string, id: string) {
    await this.warehouseAccessService.assertWarehouseAccess(user, warehouseId);

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
