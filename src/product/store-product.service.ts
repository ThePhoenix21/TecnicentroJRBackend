import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreProductDto } from './dto/create-store-product.dto';
import { UpdateStoreProductDto } from './dto/update-store-product.dto';
import { StoreProduct } from './entities/store-product.entity';

@Injectable()
export class StoreProductService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createStoreProductDto: CreateStoreProductDto): Promise<StoreProduct> {
    if (!userId) {
      throw new Error('Se requiere un ID de usuario válido para crear un producto en tienda');
    }

    try {
      // Verificar que el producto del catálogo exista
      const catalogProduct = await this.prisma.product.findUnique({
        where: { id: createStoreProductDto.productId }
      });

      if (!catalogProduct) {
        throw new NotFoundException(`Producto del catálogo con ID ${createStoreProductDto.productId} no encontrado`);
      }

      // Verificar que la tienda exista
      const store = await this.prisma.store.findUnique({
        where: { id: createStoreProductDto.storeId }
      });

      if (!store) {
        throw new NotFoundException(`Tienda con ID ${createStoreProductDto.storeId} no encontrada`);
      }

      // Verificar que el usuario tenga acceso a la tienda
      const storeUser = await this.prisma.storeUsers.findFirst({
        where: {
          storeId: createStoreProductDto.storeId,
          userId: userId
        }
      });

      if (!storeUser) {
        throw new ForbiddenException('No tienes permisos para agregar productos a esta tienda');
      }

      // Verificar si ya existe este producto en esta tienda
      const existingStoreProduct = await this.prisma.storeProduct.findFirst({
        where: {
          productId: createStoreProductDto.productId,
          storeId: createStoreProductDto.storeId
        }
      });

      if (existingStoreProduct) {
        throw new ForbiddenException('Este producto ya está registrado en esta tienda');
      }

      // Crear el StoreProduct
      const storeProduct = await this.prisma.storeProduct.create({
        data: {
          productId: createStoreProductDto.productId,
          storeId: createStoreProductDto.storeId,
          userId: userId,
          price: createStoreProductDto.price,
          stock: createStoreProductDto.stock,
          stockThreshold: createStoreProductDto.stockThreshold,
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              basePrice: true,
              buyCost: true,
            },
          },
          store: {
            select: {
              id: true,
              name: true,
              address: true,
              phone: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return storeProduct as unknown as StoreProduct;
    } catch (error) {
      console.error('Error al crear producto en tienda:', error);
      throw new Error('No se pudo crear el producto en tienda: ' + (error as Error).message);
    }
  }

  async findByStore(storeId: string): Promise<StoreProduct[]> {
    return this.prisma.storeProduct.findMany({
      where: { storeId: storeId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            basePrice: true,
            buyCost: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async findByUser(userId: string): Promise<StoreProduct[]> {
    return this.prisma.storeProduct.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            basePrice: true,
            buyCost: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async findOne(id: string): Promise<StoreProduct> {
    const storeProduct = await this.prisma.storeProduct.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            basePrice: true,
            buyCost: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!storeProduct) {
      throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado`);
    }

    return storeProduct as unknown as StoreProduct;
  }

  async update(
    userId: string,
    id: string,
    updateData: UpdateStoreProductDto,
    isAdmin: boolean = false
  ): Promise<StoreProduct> {
    // Verificar que el StoreProduct existe
    const storeProduct = await this.prisma.storeProduct.findUnique({
      where: { id },
    });

    if (!storeProduct) {
      throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado`);
    }

    // Si no es admin, verificar que el producto pertenece al usuario
    if (!isAdmin && storeProduct.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para actualizar este producto');
    }

    return this.prisma.storeProduct.update({
      where: { id },
      data: updateData,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            basePrice: true,
            buyCost: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async remove(userId: string, id: string, isAdmin: boolean = false): Promise<void> {
    // Verificar que el StoreProduct existe
    const storeProduct = await this.prisma.storeProduct.findUnique({
      where: { id },
    });

    if (!storeProduct) {
      throw new NotFoundException(`Producto en tienda con ID ${id} no encontrado`);
    }

    // Si no es admin, verificar que el producto pertenece al usuario
    if (!isAdmin && storeProduct.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para eliminar este producto');
    }

    // Eliminar el StoreProduct
    await this.prisma.storeProduct.delete({
      where: { id },
    });
  }

  async updateStock(id: string, quantity: number): Promise<StoreProduct> {
    return this.prisma.storeProduct.update({
      where: { id },
      data: {
        stock: {
          increment: quantity,
        },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            basePrice: true,
            buyCost: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }
}
