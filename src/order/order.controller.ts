import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
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
      return this.formatOrderResponse(createdOrder);
    } catch (error) {
      throw new BadRequestException(`Error al crear la orden: ${error.message}`);
    }
  }

  @Get('details/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  async getOrderDetails(
    @Param('id') id: string,
    @Req() req: Request & { user: { userId: string; email: string; role: Role } }
  ) {
    try {
      const order = await this.orderService.getOrderWithDetails(id);
      return this.formatOrderResponse(order);
    } catch (error) {
      throw new BadRequestException(`Error al obtener los detalles de la orden: ${error.message}`);
    }
  }

  private formatOrderResponse(order: any) {
    // Procesar la respuesta según si tiene servicios o solo productos
    const { pdfInfo, orderProducts, services, client, user } = order;
    const tieneServicios = services && services.length > 0;

    // Datos del negocio
    const businessName = pdfInfo?.businessName || 'Tecnicentro JR';
    const address = pdfInfo?.address || '';
    const phone = pdfInfo?.phone || '';
    const issueDate = pdfInfo?.currentDate || '';
    const issueTime = pdfInfo?.currentTime || '';
    const vendedor = pdfInfo?.sellerName || user?.name || '';
    const cliente = {
      nombre: client?.name || pdfInfo?.clientName || '',
      documento: client?.dni || '',
      telefono: client?.phone || '',
      email: client?.email || '',
      direccion: client?.address || '',
    };
    // Productos
    const productos = (orderProducts || []).map((op: any) => {
      // Pagos por producto
      const metodosPago = (op.payments || []).map((p: any) => ({
        tipo: p.type,
        monto: p.amount,
      }));
      // Precio de tienda (storeProduct)
      const precioTienda = op.product?.price ?? 0;
      // Descuento: diferencia entre precio tienda y precio pagado
      const sumaPagos = (op.payments || []).reduce((sum: number, p: any) => sum + p.amount, 0);
      const descuento = (precioTienda * op.quantity) - sumaPagos;
      return {
        nombre: op.product?.product?.name || '',
        cantidad: op.quantity,
        precioUnitario: precioTienda,
        descuento: descuento > 0 ? descuento : 0,
        metodosPago,
      };
    });

    // Subtotal y descuentos de productos
    const subtotalProductos = productos.reduce((sum: number, p: any) => sum + (p.precioUnitario * p.cantidad), 0);
    const descuentos = productos.reduce((sum: number, p: any) => sum + p.descuento, 0);
    // Servicios y adelantos
    let servicios = [];
    let adelantos = 0;
    let subtotalServicios = 0;
    if (tieneServicios) {
      servicios = (services || []).map((s: any) => ({
        nombre: s.name,
        descripcion: s.description,
        precio: s.price,
        adelantos: (s.payments || []).map((p: any) => ({ tipo: p.type, monto: p.amount }))
      }));
      subtotalServicios = (services || []).reduce((sum: number, s: any) => sum + (s.price || 0), 0);
      adelantos = (services || []).reduce((sum: number, s: any) => sum + ((s.payments || []).reduce((a: number, ad: any) => a + ad.amount, 0)), 0);
    }
    // Subtotal global
    const subtotal = subtotalProductos + subtotalServicios;
    // Pagos de productos
    const pagosProductos = productos.reduce((sum: number, p: any) => sum + ((p.metodosPago ?? []).reduce((a: number, mp: any) => a + mp.monto, 0) || 0), 0);
    // Total a pagar (lo que falta por pagar)
    let total = subtotal - descuentos - adelantos - pagosProductos;
    if (!tieneServicios) {
      total = subtotal - descuentos;
    }
    // Si no hay productos, productos debe ser []
    const productosFinal = productos || [];


    // Construir respuesta
    const response: any = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      businessName,
      address,
      phone,
      issueDate,
      client: cliente,
      productos: productosFinal,
      descuentos,
      vendedor,
      subtotal,
      total,
    };
    if (tieneServicios) {
      response.issueTime = issueTime;
      response.servicios = servicios;
      response.adelantos = adelantos;
    }
    return response;
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

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getOrders() {
    return this.orderService.findAll();
  }

  @Get('store/:storeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  async getOrdersByStore(@Param('storeId') storeId: string) {
    return this.orderService.findByStore(storeId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  async getOrderById(
    @Param('id') id: string,
    @Req() req: Request & { user: { userId: string; email: string; role: Role } }
  ) {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new UnauthorizedException('No se pudo autenticar al usuario');
    }

    return this.orderService.findOne(id, userId);
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getUserOrders(@Param('userId') userId: string) {
    return this.orderService.findMe(userId);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async cancelOrder(
    @Param('id') id: string,
    @Req() req: Request & { user: { userId: string; email: string; role: Role } }
  ) {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    
    if (!userId) {
      throw new UnauthorizedException('No se pudo autenticar al usuario');
    }

    try {
      const cancelledOrder = await this.orderService.cancelOrder(id, userId, userRole, req.user);
      return cancelledOrder;
    } catch (error) {
      throw new BadRequestException(`Error al cancelar la orden: ${error.message}`);
    }
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
