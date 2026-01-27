import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatalogProductDto } from './dto/create-catalog-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CatalogProduct } from './entities/catalog-product.entity';
import { StoreProductStockDto } from './dto/store-product-stock.dto';

type AuthUser = {
  userId: string;
  email: string;
  role: string;
  tenantId?: string;
};

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) {}

  private getTenantIdOrUndefined(user?: AuthUser): string | undefined {
    return user?.tenantId;
  }

  private async attachCreatedByForTenant(product: any, tenantId?: string) {
    if (!product) return product;
    if (!product.createdById || !tenantId) {
      return { ...product, createdBy: null };
    }

    const createdBy = await this.prisma.user.findFirst({
      where: {
        id: product.createdById,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return { ...product, createdBy: createdBy ?? null };
  }

  async create(createCatalogProductDto: CreateCatalogProductDto, user?: AuthUser): Promise<CatalogProduct> {
    try {
      const product = await this.prisma.product.create({
        data: createCatalogProductDto,
      });

      const tenantId = this.getTenantIdOrUndefined(user);
      const withCreatedBy = await this.attachCreatedByForTenant(product, tenantId);
      return withCreatedBy as unknown as CatalogProduct;
    } catch (error) {
      console.error('Error al crear el producto del catálogo:', error);
      throw new Error('No se pudo crear el producto del catálogo: ' + (error as Error).message);
    }
  }

  async findAll(user?: AuthUser): Promise<CatalogProduct[]> {
    const tenantId = this.getTenantIdOrUndefined(user);

    const products = await this.prisma.product.findMany({
      where: { isDeleted: false }, // Solo productos no eliminados
      orderBy: { createdAt: 'desc' },
    });

    return (await Promise.all(products.map((p) => this.attachCreatedByForTenant(p, tenantId)))) as unknown as CatalogProduct[];
  }

  async lookup(user?: AuthUser, search?: string): Promise<Array<{ id: string; name: string }>> {
    const tenantId = this.getTenantIdOrUndefined(user);

    const whereCondition: any = {
      isDeleted: false,
    };

    // Si hay tenant, filtrar por productos creados por usuarios del tenant
    if (tenantId) {
      whereCondition.createdBy = {
        tenantId,
      };
    }

    // Si hay búsqueda, filtrar por nombre que contenga el término (case insensitive)
    if (search) {
      whereCondition.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    const products = await this.prisma.product.findMany({
      where: whereCondition,
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
      take: 1000, // Limitar a 1000 resultados para lookup
    });

    return products;
  }

  async findOne(id: string, user?: AuthUser): Promise<CatalogProduct> {
    const tenantId = this.getTenantIdOrUndefined(user);

    const product = await this.prisma.product.findFirst({
      where: { id, isDeleted: false },
    });

    if (!product) {
      throw new NotFoundException(`Producto del catálogo con ID ${id} no encontrado`);
    }

    const withCreatedBy = await this.attachCreatedByForTenant(product, tenantId);
    return withCreatedBy as unknown as CatalogProduct;
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    user?: AuthUser,
  ): Promise<CatalogProduct> {
    const tenantId = this.getTenantIdOrUndefined(user);

    // Verificar que el producto existe y no está eliminado
    const product = await this.prisma.product.findFirst({ where: { id, isDeleted: false } });

    if (!product) {
      throw new NotFoundException(`Producto del catálogo con ID ${id} no encontrado`);
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: updateProductDto,
    });

    const withCreatedBy = await this.attachCreatedByForTenant(updated, tenantId);
    return withCreatedBy as unknown as CatalogProduct;
  }

  async remove(id: string, user?: AuthUser): Promise<CatalogProduct> {
    const tenantId = this.getTenantIdOrUndefined(user);

    // Verificar que el producto existe y no está ya eliminado
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Producto del catálogo con ID ${id} no encontrado`);
    }

    if (product.isDeleted) {
      throw new NotFoundException(`Producto del catálogo con ID ${id} ya está eliminado`);
    }

    // Soft delete: marcar como eliminado en lugar de borrar físicamente
    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: { isDeleted: true },
    });

    const withCreatedBy = await this.attachCreatedByForTenant(updatedProduct, tenantId);
    return withCreatedBy as unknown as CatalogProduct;
  }

  async getStoreStock(user: AuthUser | undefined, storeId: string): Promise<StoreProductStockDto[]> {
    const tenantId = this.getTenantIdOrUndefined(user);

    if (!tenantId) {
      throw new ForbiddenException('TenantId no encontrado en el token');
    }

    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId },
      select: { id: true },
    });

    if (!store) {
      throw new ForbiddenException('No tienes acceso a esta tienda');
    }

    const storeProducts = await this.prisma.storeProduct.findMany({
      where: {
        storeId,
        store: { tenantId },
        product: { isDeleted: false },
      },
      select: {
        id: true,
        productId: true,
        stock: true,
        product: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        product: {
          name: 'asc',
        },
      },
    });

    return storeProducts.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.product.name,
      stock: item.stock,
    }));
  }
}
