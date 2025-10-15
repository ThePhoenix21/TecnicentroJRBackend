import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Prisma } from '@prisma/client';

interface FindAllParams {
  page?: number;
  limit?: number;
  userId?: string;
}

interface FindByUserParams {
  page?: number;
  limit?: number;
}

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) {}

  async create(createProductDto: CreateProductDto, userId: string) {
    const { name, description, price, stock } = createProductDto;
    
    return this.prisma.product.create({
      data: {
        name,
        description,
        price,
        stock,
        userId,
      },
    });
  }

  async findAll({ page = 1, limit = 10, userId }: FindAllParams = {}) {
    const skip = (page - 1) * limit;
    const where: Prisma.ProductWhereInput = {};
    
    if (userId) {
      where.userId = userId;
    }

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      data: products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByUser(userId: string, { page = 1, limit = 10 }: FindByUserParams = {}) {
    const skip = (page - 1) * limit;
    
    const [total, products] = await Promise.all([
      this.prisma.product.count({ where: { userId } }),
      this.prisma.product.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
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

    if (!product) {
      throw new NotFoundException(`Producto con ID "${id}" no encontrado`);
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    await this.findOne(id); // Verificar que el producto existe
    
    return this.prisma.product.update({
      where: { id },
      data: updateProductDto,
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
  }

  async remove(id: string) {
    await this.findOne(id); // Verificar que el producto existe
    
    return this.prisma.product.delete({
      where: { id },
    });
  }
}
