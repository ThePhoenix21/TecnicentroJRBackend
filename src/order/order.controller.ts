import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  Query,
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
import { AuthService } from '../auth/auth.service';
import { HardDeleteOrdersByDateRangeDto } from './dto/hard-delete-orders-by-date-range.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { ListOrdersResponseDto } from './dto/list-orders-response.dto';
import { SaleStatusLookupItemDto } from './dto/sale-status-lookup-item.dto';
import { SaleStatus } from '@prisma/client';
import { PayOrderPaymentsDto } from './dto/pay-order-payments.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { OrderPaymentMethodsResponseDto } from './dto/order-payment-methods-response.dto';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';

@ApiTags('Órdenes')
@ApiBearerAuth('JWT-auth')
@RequireTenantFeatures(TenantFeature.SALES)
@Controller('orders')
@UseGuards(RolesGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly authService: AuthService,
  ) {}
  
  @Post('hard-delete/by-date-range')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.MANAGE_ORDERS)
  @RequireTenantFeatures(TenantFeature.SALES, TenantFeature.HARD_DELETE_SALES_HISTORY)
  @ApiOperation({
    summary: 'Hard delete de órdenes por rango de fechas (irreversible)',
    description: 'Elimina físicamente órdenes y entidades relacionadas dentro del rango indicado, solo si el tenant tiene habilitada la feature HARD_DELETE_SALES_HISTORY. Requiere re-autenticación (email y password) y ejecuta auditoría mínima no borrable.'
  })
  @ApiBody({ type: HardDeleteOrdersByDateRangeDto })
  async hardDeleteOrdersByDateRange(
    @Req() req: Request & { user: { userId: string; email: string; role: Role; tenantId?: string } },
    @Body(new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })) dto: HardDeleteOrdersByDateRangeDto,
  ) {
    const userId = req.user?.userId;
    const tenantId = (req.user as any)?.tenantId;

    if (!userId) {
      throw new UnauthorizedException('No se pudo autenticar al usuario');
    }

    if (!tenantId) {
      throw new UnauthorizedException('Tenant no encontrado en el token');
    }

    const validated = await this.authService.validateAnyUser(dto.email, dto.password);
    if (validated.id !== userId || validated.email !== req.user.email) {
      throw new UnauthorizedException('Re-autenticación inválida');
    }

    return this.orderService.hardDeleteOrdersByDateRange(
      {
        fromDate: dto.fromDate,
        toDate: dto.toDate,
        reason: dto.reason,
      },
      req.user as any,
      (req as any)?.ip,
    );
  }

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

  @Get(':id/payment-methods')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_ORDERS)
  @RateLimit({ keyType: 'user', rules: [{ limit: 60, windowSeconds: 60 }] })
  @ApiOperation({ summary: 'Obtener métodos de pago de una orden' })
  @ApiResponse({ status: 200, type: OrderPaymentMethodsResponseDto })
  async getOrderPaymentMethods(
    @Param('id') id: string,
    @Req() req: Request & { user: { userId: string; email: string; role: Role } },
  ): Promise<OrderPaymentMethodsResponseDto> {
    return this.orderService.getOrderPaymentMethods(id, req.user as any);
  }

  private formatOrderResponse(order: any) {
    // Procesar la respuesta según si tiene servicios o solo productos
    const { pdfInfo, orderProducts, services, client, user, paymentMethods } = order;
    const tieneServicios = services && services.length > 0;

    const toNumber = (value: any): number => {
      if (value === null || value === undefined) return 0;
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      if (typeof value === 'object' && typeof value.toNumber === 'function') {
        return value.toNumber();
      }
      const coerced = Number(value);
      return Number.isFinite(coerced) ? coerced : 0;
    };

    const issueDate = pdfInfo?.currentDate || '';
    const issueTime = pdfInfo?.currentTime || '';
    const vendedor = pdfInfo?.sellerName || user?.name || '';
    const cliente = {
      nombre: client?.name || pdfInfo?.clientName || '',
      documento: client?.dni || pdfInfo?.clientDni || '00000000',
      telefono: client?.phone || '',
      email: client?.email || '',
      direccion: client?.address || 'Sin dirección',
    };
    // Productos
    const productos = (orderProducts || []).map((op: any) => {
      // Precio de tienda (storeProduct)
      const precioTienda = toNumber(op.product?.price);
      // Descuento: diferencia entre precio tienda y precio final aplicado en la orden
      const precioFinal = toNumber(op.price ?? precioTienda);
      const cantidad = toNumber(op.quantity);
      const descuento = (precioTienda - precioFinal) * cantidad;
      return {
        nombre: op.product?.product?.name || '',
        cantidad: op.quantity,
        precioUnitario: precioTienda,
        descuento: descuento > 0 ? descuento : 0,
        metodosPago: [],
      };
    });

    // Subtotal y descuentos de productos
    const subtotalProductos = productos.reduce((sum: number, p: any) => sum + (toNumber(p.precioUnitario) * toNumber(p.cantidad)), 0);
    const descuentos = productos.reduce((sum: number, p: any) => sum + toNumber(p.descuento), 0);
    // Servicios - usando datos completos del servicio
    let servicios = [];
    let subtotalServicios = 0;
    if (tieneServicios) {
      servicios = (services || []).map((s: any) => ({
        id: s.id,
        nombre: s.name,
        descripcion: s.description,
        precio: s.price,
        type: s.type,
        status: s.status,
        photoUrls: s.photoUrls || [],
        storeService: s.storeService ? {
          id: s.storeService.id,
          name: s.storeService.name,
          description: s.storeService.description,
          price: s.storeService.price,
          type: s.storeService.type
        } : null,
        serviceCategory: s.serviceCategory ? {
          id: s.serviceCategory.id,
          name: s.serviceCategory.name
        } : null,
      }));
      subtotalServicios = (services || []).reduce((sum: number, s: any) => sum + toNumber(s.price), 0);
    }
    // Subtotal global
    const subtotal = subtotalProductos + subtotalServicios;
    let total = subtotal - descuentos;
    // Si no hay productos, productos debe ser []
    const productosFinal = productos || [];


    // Construir respuesta
    const response: any = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      issueDate,
      issueTime,
      paymentMethods: (paymentMethods || []).map((p: any) => ({
        id: p.id,
        type: p.type,
        amount: String(p.amount ?? 0),
        createdAt: p.createdAt,
      })),
      client: cliente,
      productos: productosFinal,
      descuentos,
      vendedor,
      subtotal: String(subtotal),
      total,
    };
    if (tieneServicios) {
      response.servicios = servicios;
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

  @Patch(':id/payments')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.MANAGE_ORDERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar pagos de una orden (por orden, sin servicios)' })
  async payOrderPayments(
    @Param('id') id: string,
    @Req() req: Request & { user: { userId: string; email: string; role: Role } },
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: PayOrderPaymentsDto,
  ): Promise<{ success: true; fullPayment: boolean }> {
    return this.orderService.payOrderPayments(id, dto, req.user as any);
  }

  @Patch(':id/complete')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.MANAGE_ORDERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Completar orden (solo si está completamente pagada)' })
  async completePaidOrder(
    @Param('id') id: string,
    @Req() req: Request & { user: { userId: string; email: string; role: Role } },
  ): Promise<{ success: true }> {
    return this.orderService.completePaidOrder(id, req.user as any);
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

  @Get('list')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_ORDERS)
  @ApiOperation({ summary: 'Listado paginado de órdenes (filtros combinables)' })
  async list(@Req() req: Request & { user: any }, @Query() query: ListOrdersDto): Promise<ListOrdersResponseDto> {
    return this.orderService.list(query, req.user as any);
  }

  @Get('lookup-status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_ORDERS)
  @ApiOperation({ summary: 'Lookup de estados de órdenes (value y label)' })
  async lookupStatus(): Promise<SaleStatusLookupItemDto[]> {
    return Object.values(SaleStatus).map((s) => ({ value: s, label: s }));
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
    @Req() req: Request & { user: { userId: string; email: string; role: Role } },
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto?: CancelOrderDto,
  ) {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    
    if (!userId) {
      throw new UnauthorizedException('No se pudo autenticar al usuario');
    }

    try {
      const cancelledOrder = await this.orderService.cancelOrder(id, userId, userRole, req.user, dto);
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

    const hasProducts = Array.isArray(orderData.products) && orderData.products.length > 0;
    const hasServices = Array.isArray(orderData.services) && orderData.services.length > 0;

    if (hasProducts && hasServices) {
      throw new BadRequestException('No se permite crear órdenes con productos y servicios combinados. Cree una orden solo de productos o solo de servicios.');
    }

    // 3. Validar que si hay clientId, no haya clientInfo
    if (orderData.clientId && orderData.clientInfo) {
      throw new BadRequestException('No se puede especificar clientId y clientInfo simultáneamente');
    }

    // 4. Validar que los pagos tengan montos positivos
    if (!orderData.paymentMethods || orderData.paymentMethods.length === 0) {
      throw new BadRequestException('Se requiere al menos un método de pago');
    }

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
