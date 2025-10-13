import { 
  Injectable, 
  NotFoundException, 
  ForbiddenException,
  BadRequestException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Prisma, Product } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

type ProductWithUser = Prisma.ProductGetPayload<{
  include: { createdBy: { select: { id: true; name: true; email: true } } };
}>;

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) {}

  async create(
    createProductDto: CreateProductDto, 
    userId: string
  ): Promise<Product> {
    try {
      return await this.prisma.product.create({
        data: {
          ...createProductDto,
          createdBy: {
            connect: { id: userId }
          }
        }
      });
    } catch (error) {
      throw new BadRequestException('Error creating product');
    }
  }

  async findAll(paginationDto: PaginationDto): Promise<Product[]> {
    const { skip, take, search } = paginationDto;
    const where: Prisma.ProductWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    return this.prisma.product.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  }

  async findByUserId(
    userId: string, 
    paginationDto: PaginationDto
  ): Promise<Product[]> {
    const { skip, take, search } = paginationDto;
    const where: Prisma.ProductWhereInput = { createdById: userId };

    if (search) {
      where.AND = [
        { createdById: userId },
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } }
          ]
        }
      ];
    }

    return this.prisma.product.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(id: string): Promise<ProductWithUser | null> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    return product;
  }

  async update(
    id: string, 
    updateProductDto: UpdateProductDto,
    userId: string
  ): Promise<Product> {
    // First verify the product exists and belongs to the user
    const product = await this.prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    if (product.createdById !== userId) {
      throw new ForbiddenException('You do not have permission to update this product');
    }

    return this.prisma.product.update({
      where: { id },
      data: updateProductDto
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    // First verify the product exists and belongs to the user
    const product = await this.prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    if (product.createdById !== userId) {
      throw new ForbiddenException('You do not have permission to delete this product');
    }

    await this.prisma.product.delete({
      where: { id }
    });
  }

  async count(where?: Prisma.ProductWhereInput): Promise<number> {
    return this.prisma.product.count({ where });
  }
}
