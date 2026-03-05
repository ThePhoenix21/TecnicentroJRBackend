import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpStatus,
  HttpCode,
  ParseUUIDPipe,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { Role } from '../auth/enums/role.enum';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { SupplyOrderService } from './supply-order.service';
import { CreateSupplyOrderDto } from './dto/create-supply-order.dto';
import { ListSupplyOrdersDto } from './dto/list-supply-orders.dto';
import { ListSupplyOrdersResponseDto } from './dto/list-supply-orders-response.dto';
import { ReceiveSupplyOrderDto } from './dto/receive-supply-order.dto';
import { UpdateSupplyOrderDto } from './dto/update-supply-order.dto';
import { TenantFeature } from '@prisma/client';

@ApiTags('Órdenes de Suministro')
@ApiBearerAuth()
@RequireTenantFeatures(TenantFeature.SUPPLY_ORDERS)
@Controller('supply-orders')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class SupplyOrderController {
  constructor(private readonly supplyOrderService: SupplyOrderService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_SUPPLY_ORDERS)
  @ApiOperation({ 
    summary: 'Listar órdenes de suministro',
    description: 'Lista órdenes de suministro filtradas por modo (tienda/almacén). En modo "store" muestra solo órdenes de la tienda especificada. En modo "warehouse" muestra solo órdenes del almacén especificado. Sin modo, muestra todas las órdenes del tenant.'
  })
  @ApiOkResponse({ type: ListSupplyOrdersResponseDto })
  async list(@Req() req: any, @Query() query: ListSupplyOrdersDto): Promise<ListSupplyOrdersResponseDto> {
    return this.supplyOrderService.list(query, req.user);
  }

  @Get('lookup')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_SUPPLY_ORDERS)
  @ApiOperation({ summary: 'Lookup de órdenes de suministro (id y código)' })
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 120, windowSeconds: 60 }],
  })
  async lookup(
    @Req() req: any,
    @Query('storeId') storeId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.supplyOrderService.lookup(req.user, { storeId, warehouseId });
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_SUPPLY_ORDERS)
  @ApiOperation({ summary: 'Obtener orden de suministro por ID' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    return this.supplyOrderService.findOne(id, req.user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.CREATE_SUPPLY_ORDER)
  @ApiOperation({ summary: 'Crear orden de suministro' })
  @ApiBody({ type: CreateSupplyOrderDto })
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 30, windowSeconds: 60 }],
  })
  async create(
    @Req() req: any,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateSupplyOrderDto,
  ) {
    return this.supplyOrderService.create(dto, req.user);
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.RECEIVE_SUPPLY_ORDER)
  @ApiOperation({ summary: 'Registrar recepción de orden de suministro' })
  @ApiBody({ type: ReceiveSupplyOrderDto })
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 20, windowSeconds: 60 }],
  })
  async receive(
    @Param('id') id: string,
    @Req() req: any,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: ReceiveSupplyOrderDto,
  ) {
    return this.supplyOrderService.receive(id, dto, req.user);
  }

  @Post(':id/close-partial')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.RECEIVE_SUPPLY_ORDER)
  @ApiOperation({ summary: 'Cerrar orden de suministro como parcialmente recibida' })
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 10, windowSeconds: 60 }],
  })
  async closePartial(@Param('id') id: string, @Req() req: any) {
    return this.supplyOrderService.closePartial(id, req.user);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.APPROVE_SUPPLY_ORDER)
  @ApiOperation({ summary: 'Aprobar orden de suministro' })
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 20, windowSeconds: 60 }],
  })
  async approve(@Param('id') id: string, @Req() req: any) {
    return this.supplyOrderService.approve(id, req.user);
  }

  @Post(':id/annull')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.CANCEL_SUPPLY_ORDER)
  @ApiOperation({ summary: 'Anular orden de suministro' })
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 10, windowSeconds: 60 }],
  })
  async annull(@Param('id') id: string, @Req() req: any) {
    return this.supplyOrderService.annull(id, req.user);
  }

  @Post(':id/approve-with-email')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.APPROVE_SUPPLY_ORDER)
  @ApiOperation({ summary: 'Aprobar orden de suministro y enviar email' })
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 20, windowSeconds: 60 }],
  })
  async approveWithEmail(@Param('id') id: string, @Req() req: any) {
    return this.supplyOrderService.approveWithEmail(id, req.user);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.EDIT_EMITTED_SUPPLY_ORDER)
  @ApiOperation({ 
    summary: 'Actualizar orden de suministro',
    description: 'Actualiza una orden de suministro permitiendo asignarla a una tienda o un almacén. Debes especificar storeId o warehouseId, pero no ambos. Devuelve { success: true } si la actualización fue exitosa.'
  })
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 20, windowSeconds: 60 }],
  })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateSupplyOrderDto,
    @Req() req: any
  ) {
    return this.supplyOrderService.update(id, updateDto, req.user);
  }
}
