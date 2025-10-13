import { 
  Injectable, 
  NotFoundException, 
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { Prisma, SaleStatus, PrismaClient } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

type SaleWithRelations = Prisma.SaleGetPayload<{
  include: {
    product: true;
    user: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
  };
}>;

type SaleListResponse = {
  data: SaleWithRelations[];
  total: number;
};

@Injectable()
export class SaleService {
  constructor(private prisma: PrismaService) {}

  /**
   * Creates a new sale with stock validation and transaction
   */
  async create(createSaleDto: CreateSaleDto, userId: string): Promise<SaleWithRelations> {
    const { productId, quantity, status = SaleStatus.COMPLETED } = createSaleDto;

    return this.prisma.$transaction(async (prisma: Prisma.TransactionClient) => {
      // 1. Verify product exists and get current stock and price
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, stock: true, price: true },
      });

      if (!product) {
        throw new NotFoundException('Producto no encontrado');
      }

      // 2. Validate stock if sale is being completed
      if (status === SaleStatus.COMPLETED && product.stock < quantity) {
        throw new BadRequestException('Stock insuficiente para completar la venta');
      }

      // 3. Calculate total amount based on product price and quantity
      const totalAmount = product.price * quantity;

      // 4. Create the sale
      const sale = await prisma.sale.create({
        data: {
          productId,
          userId,
          quantity,
          totalAmount,
          status,
        },
        include: {
          product: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // 5. Update product stock if sale is completed
      if (status === SaleStatus.COMPLETED) {
        await prisma.product.update({
          where: { id: productId },
          data: {
            stock: {
              decrement: quantity,
            },
          },
        });
      }

      return sale;
    });
  }

  /**
   * Finds all sales with pagination and filtering
   */
  async findAll(paginationDto: PaginationDto): Promise<SaleListResponse> {
    const { page = 1, limit = 10, search } = paginationDto;
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100); // Limit max page size to 100

    const where: Prisma.SaleWhereInput = {};
    
    if (search) {
      where.OR = [
        { product: { name: { contains: search, mode: 'insensitive' } } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [sales, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: {
          product: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return { data: sales, total };
  }

  /**
   * Finds sales for a specific user with pagination
   */
  async findByUserId(userId: string, paginationDto: PaginationDto): Promise<SaleListResponse> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100);

    const where: Prisma.SaleWhereInput = { userId };

    const [sales, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: {
          product: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return { data: sales, total };
  }

  /**
   * Finds a single sale by ID
   */
  async findOne(id: string): Promise<SaleWithRelations> {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        product: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    return sale;
  }


  /**
   * Helper method to get sales statistics
   */
  async getSalesStats() {
    const [totalSales, totalAmountResult, completedSales] = await Promise.all([
      this.prisma.sale.count(),
      this.prisma.sale.aggregate({
        _sum: { totalAmount: true },
      }),
      this.prisma.sale.count({
        where: { status: SaleStatus.COMPLETED },
      }),
    ]);

    return {
      totalSales,
      totalAmount: totalAmountResult._sum.totalAmount || 0,
      completedSales,
      cancelledSales: totalSales - completedSales,
    };
  }

  /**
   * Anula una venta existente
   * Solo accesible por administradores con credenciales válidas
   */
  async annulSale(
    saleId: string, 
    identifier: string, // Puede ser email, username o name
    adminPassword: string,
    reason: string
  ): Promise<SaleWithRelations> {
    // Verificar si el identificador es un email
    const isEmail = identifier.includes('@');
    
    // Buscar administrador por email, username o name
    const admin = await this.prisma.user.findFirst({
      where: {
        role: 'ADMIN',
        OR: [
          { email: isEmail ? identifier : undefined },
          { username: !isEmail ? identifier : undefined },
          { name: !isEmail ? identifier : undefined }
        ].filter(condition => Object.values(condition)[0] !== undefined)
      }
    });

    if (!admin) {
      throw new ForbiddenException('Credenciales de administrador inválidas');
    }

    // Verificar contraseña
    const bcrypt = require('bcrypt');
    const isPasswordValid = await bcrypt.compare(adminPassword, admin.password);
    if (!isPasswordValid) {
      throw new ForbiddenException('Credenciales de administrador inválidas');
    }

    // Buscar la venta
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        product: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID "${saleId}" no encontrada`);
    }

    if (sale.status === 'ANNULLED') {
      throw new BadRequestException('La venta ya ha sido anulada anteriormente');
    }

    // Actualizar el estado de la venta a ANNULLED
    const updatedSale = await this.prisma.sale.update({
      where: { id: saleId },
      data: {
        status: 'ANNULLED',
        updatedAt: new Date(),
        // Se podrían agregar estos campos al modelo Sale en schema.prisma:
        // annulledBy: admin.id,
        // annulmentReason: reason,
        // annulmentDate: new Date()
      },
      include: {
        product: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Aquí se podría revertir el stock si es necesario
    // await this.prisma.product.update({
    //   where: { id: sale.productId },
    //   data: {
    //     stock: {
    //       increment: sale.quantity
    //     }
    //   }
    // });

    return updatedSale;
  }
}
