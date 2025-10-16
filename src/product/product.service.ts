import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createProductDto: CreateProductDto): Promise<Product> {
    if (!userId) {
      throw new Error('Se requiere un ID de usuario válido para crear un producto');
    }

    console.log('Intentando crear producto con userId:', userId);
    
    try {
      // Crear el producto y obtenerlo con la información del usuario en una sola consulta
      const product = await this.prisma.$transaction(async (prisma) => {
        const createdProduct = await prisma.product.create({
          data: {
            ...createProductDto,
            userId: userId,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });
        
        if (!createdProduct) {
          throw new Error('No se pudo crear el producto');
        }
        
        return createdProduct;
      });
      
      return product as unknown as Product;
    } catch (error) {
      console.error('Error al crear el producto:', error);
      throw new Error('No se pudo crear el producto: ' + (error as Error).message);
    }
  }

  async findAll(userId: string): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    if (product.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para ver este producto');
    }

    return product;
  }

  async update(
    userId: string,
    id: string,
    updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    // Verificar que el producto existe y pertenece al usuario
    await this.findOne(userId, id);

    return this.prisma.product.update({
      where: { id },
      data: updateProductDto,
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    // Verificar que el producto existe y pertenece al usuario
    await this.findOne(userId, id);

    await this.prisma.product.delete({
      where: { id },
    });
  }

  async updateStock(id: string, quantity: number): Promise<Product> {
    return this.prisma.product.update({
      where: { id },
      data: {
        stock: {
          increment: quantity,
        },
      },
    });
  }
}
