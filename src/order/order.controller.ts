import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CompleteOrderDto } from './dto/complete-order.dto';
import { plainToInstance } from 'class-transformer';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('orders')
@UseGuards(RolesGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
  ) {}

  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  async create(
    @Req() req: Request & { user: { userId: string; email: string; role: Role } },
    @Body(new ValidationPipe({ 
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true 
    })) createOrderDto: CreateOrderDto,
  ) {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new UnauthorizedException('No se pudo autenticar al usuario');
    }

    // Validaciones adicionales
    await this.validateOrderData(createOrderDto);

    // Procesar precios personalizados de productos
    if (createOrderDto.products) {
      createOrderDto.products = createOrderDto.products.map(product => {
        // Si hay price, lo usamos como customPrice
        if (product.price !== undefined) {
          return {
            ...product,
            customPrice: product.price
          };
        }
        return product;
      });
    }

    // Asignar el ID del usuario
    createOrderDto.userId = userId;

    try {
      const createdOrder = await this.orderService.create(createOrderDto, req.user);
      return createdOrder;
    } catch (error) {
      throw new BadRequestException(`Error al crear la orden: ${error.message}`);
    }
  }

  @Patch('complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async completeOrder(
    @Req() req: Request & { user: { userId: string; email: string; role: Role } },
    @Body(new ValidationPipe({ 
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true 
    })) completeOrderDto: CompleteOrderDto,
  ) {
    try {
      const completedOrder = await this.orderService.completeOrder(completeOrderDto, req.user);
      return completedOrder;
    } catch (error) {
      throw new BadRequestException(`Error al completar la orden: ${error.message}`);
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  async findMe(@Req() req: Request & { user: { userId: string; email: string; role: Role } }) {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new UnauthorizedException('No se pudo autenticar al usuario');
    }

    return this.orderService.findMe(userId);
  }

  private async validateOrderData(orderData: CreateOrderDto): Promise<void> {
    // 1. Validar que al menos haya un cliente (clientId o clientInfo con DNI)
    if (!orderData.clientId && !orderData.clientInfo?.dni) {
      throw new BadRequestException('Se requiere DNI del cliente');
    }

    // 2. Validar que al menos haya un producto o servicio
    if ((!orderData.products || orderData.products.length === 0) &&
        (!orderData.services || orderData.services.length === 0)) {
      throw new BadRequestException('Se requiere al menos un producto o servicio');
    }

    // 3. Validar que si hay clientId, no haya clientInfo
    if (orderData.clientId && orderData.clientInfo) {
      throw new BadRequestException('No se puede especificar clientId y clientInfo simultáneamente');
    }

    // 4. Validar que los pagos tengan montos positivos
    if (orderData.products) {
      for (const product of orderData.products) {
        if (product.payments && product.payments.length > 0) {
          for (const payment of product.payments) {
            if (payment.amount <= 0) {
              throw new BadRequestException('El monto de pago debe ser mayor a cero');
            }
          }
        }
      }
    }

    if (orderData.services) {
      for (const service of orderData.services) {
        if (service.payments && service.payments.length > 0) {
          for (const payment of service.payments) {
            if (payment.amount <= 0) {
              throw new BadRequestException('El monto de pago debe ser mayor a cero');
            }
          }
        }
      }
    }
  }
}
