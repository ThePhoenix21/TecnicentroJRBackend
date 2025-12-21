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
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CompleteOrderDto } from './dto/complete-order.dto';
import { plainToInstance } from 'class-transformer';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { OrderCreateResponseDto } from './dto/order-create-response.dto';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { TenantFeature } from '@prisma/client';

@ApiTags('Órdenes')
@ApiBearerAuth('JWT-auth')
@RequireTenantFeatures(TenantFeature.SALES)
@Controller('orders')
@UseGuards(RolesGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
  ) {}

  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.MANAGE_ORDERS)
  @ApiOperation({
    summary: 'Crear una orden',
    description: 'Crea una orden con productos y/o servicios. Los pagos se registran a nivel de orden en paymentMethods. Los campos legacy products[].payments y services[].payments, si se envían, serán ignorados. Regla especial: si la orden contiene SOLO servicios (sin products) y el tenant tiene la feature FASTSERVICE habilitada (presente en el JWT como tenantFeatures), entonces se exige pago total: la suma de paymentMethods.amount debe ser igual a la suma de services.price y los servicios/la orden se crean como COMPLETED.'
  })
  @ApiBody({
    type: CreateOrderDto,
    examples: {
      ejemploConProductoYServicio: {
        summary: 'Orden con 1 producto y 1 servicio',
        value: {
          clientInfo: {
            name: 'Juan Pérez',
            email: 'juan@email.com',
            phone: '987654321',
            address: 'Av. Principal 123',
            dni: '12345678',
            ruc: '20123456789'
          },
          products: [
            {
              productId: '1c5e23f3-253b-4cc3-a902-0efc86ad2766',
              quantity: 1,
              price: 20
            }
          ],
          services: [
            {
              name: 'Cambio de aceite',
              description: 'Servicio de mantenimiento',
              price: 50,
              type: 'MISELANEOUS'
            }
          ],
          paymentMethods: [
            {
              type: 'EFECTIVO',
              amount: 70
            }
          ],
          cashSessionId: '33403c01-fb0f-4d17-b6f6-2990df45551f'
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Orden creada exitosamente',
    type: OrderCreateResponseDto,
  })
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
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_ORDERS)
  async getOrderDetails(
    @Param('id') id: string,
    @Req() req: Request & { user: { userId: string; email: string; role: Role } }
  ) {
    try {
      const order = await this.orderService.getOrderWithDetails(id, req.user as any);
      return this.formatOrderResponse(order);
    } catch (error) {
      throw new BadRequestException(`Error al obtener los detalles de la orden: ${error.message}`);
    }
  }

  private formatOrderResponse(order: any) {
    // Procesar la respuesta según si tiene servicios o solo productos
    const { pdfInfo, orderProducts, services, client, user, paymentMethods } = order;
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
      // Precio de tienda (storeProduct)
      const precioTienda = op.product?.price ?? 0;
      // Descuento: diferencia entre precio tienda y precio final aplicado en la orden
      const precioFinal = op.price ?? precioTienda;
      const descuento = (precioTienda - precioFinal) * op.quantity;
      return {
        nombre: op.product?.product?.name || '',
        cantidad: op.quantity,
        precioUnitario: precioTienda,
        descuento: descuento > 0 ? descuento : 0,
        metodosPago: [],
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
        adelantos: []
      }));
      subtotalServicios = (services || []).reduce((sum: number, s: any) => sum + (s.price || 0), 0);
    }
    // Subtotal global
    const subtotal = subtotalProductos + subtotalServicios;
    const pagosOrden = (paymentMethods || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    if (tieneServicios) {
      adelantos = pagosOrden;
    }

    let total = subtotal - descuentos;
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
      paymentMethods: (paymentMethods || []).map((p: any) => ({
        type: p.type,
        amount: p.amount,
      })),
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
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.MANAGE_ORDERS)
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
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_ORDERS)
  async findMe(@Req() req: Request & { user: { userId: string; email: string; role: Role } }) {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new UnauthorizedException('No se pudo autenticar al usuario');
    }

    return this.orderService.findMe(userId, req.user as any);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_ORDERS)
  async getOrders(@Req() req: Request & { user: { userId: string; email: string; role: Role } }) {
    return this.orderService.findAll(req.user as any);
  }

  @Get('store/:storeId')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_ORDERS)
  async getOrdersByStore(
    @Param('storeId') storeId: string,
    @Req() req: Request & { user: { userId: string; email: string; role: Role } }
  ) {
    return this.orderService.findByStore(storeId, req.user as any);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_ORDERS)
  async getOrderById(
    @Param('id') id: string,
    @Req() req: Request & { user: { userId: string; email: string; role: Role } }
  ) {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new UnauthorizedException('No se pudo autenticar al usuario');
    }

    return this.orderService.findOne(id, req.user as any);
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_ORDERS)
  async getUserOrders(
    @Param('userId') userId: string,
    @Req() req: Request & { user: { userId: string; email: string; role: Role } }
  ) {
    return this.orderService.findMe(userId, req.user as any);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.MANAGE_ORDERS)
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
    if (!orderData.paymentMethods || orderData.paymentMethods.length === 0) {
      throw new BadRequestException('Se requiere al menos un método de pago');
    }

    const hasServices = Array.isArray(orderData.services) && orderData.services.length > 0;

    for (const payment of orderData.paymentMethods) {
      if (payment.amount < 0) {
        throw new BadRequestException('El monto de pago no puede ser negativo');
      }

      if (payment.amount === 0 && !hasServices) {
        throw new BadRequestException('El monto de pago debe ser mayor a cero');
      }
    }
  }
}
