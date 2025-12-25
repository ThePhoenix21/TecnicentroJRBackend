import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatalogProductDto } from './dto/create-catalog-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CatalogProduct } from './entities/catalog-product.entity';

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
}
