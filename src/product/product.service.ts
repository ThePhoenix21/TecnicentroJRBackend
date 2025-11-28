import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatalogProductDto } from './dto/create-catalog-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CatalogProduct } from './entities/catalog-product.entity';

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) {}

  async create(createCatalogProductDto: CreateCatalogProductDto): Promise<CatalogProduct> {
    try {
      const product = await this.prisma.product.create({
        data: createCatalogProductDto,
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return product as unknown as CatalogProduct;
    } catch (error) {
      console.error('Error al crear el producto del catálogo:', error);
      throw new Error('No se pudo crear el producto del catálogo: ' + (error as Error).message);
    }
  }

  async findAll(): Promise<CatalogProduct[]> {
    return this.prisma.product.findMany({
      where: { isDeleted: false }, // Solo productos no eliminados
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async findOne(id: string): Promise<CatalogProduct> {
    const product = await this.prisma.product.findUnique({
      where: { id, isDeleted: false }, // Solo si no está eliminado
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Producto del catálogo con ID ${id} no encontrado`);
    }

    return product as unknown as CatalogProduct;
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
  ): Promise<CatalogProduct> {
    // Verificar que el producto existe y no está eliminado
    const product = await this.prisma.product.findUnique({
      where: { id, isDeleted: false },
    });

    if (!product) {
      throw new NotFoundException(`Producto del catálogo con ID ${id} no encontrado`);
    }

    return this.prisma.product.update({
      where: { id },
      data: updateProductDto,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async remove(id: string): Promise<CatalogProduct> {
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
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return updatedProduct as unknown as CatalogProduct;
  }
}
