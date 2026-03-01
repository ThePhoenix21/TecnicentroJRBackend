import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { Role } from '../auth/enums/role.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { TenantFeature } from '@prisma/client';
import { WarehouseProductsService } from './warehouse-products.service';
import { CreateWarehouseProductDto } from './dto/create-warehouse-product.dto';
import { UpdateWarehouseProductDto } from './dto/update-warehouse-product.dto';
import { ListWarehouseProductsDto } from './dto/list-warehouse-products.dto';

@ApiTags('Warehouse Products')
@ApiBearerAuth()
@Controller('warehouse/products')
@RequireTenantFeatures(TenantFeature.WAREHOUSES)
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class WarehouseProductsController {
  constructor(private readonly service: WarehouseProductsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_WAREHOUSE_PRODUCTS)
  @ApiOperation({ summary: 'Registrar producto en almacén activo' })
  create(@Req() req: any, @Body() dto: CreateWarehouseProductDto) {
    return this.service.create(req.user, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_WAREHOUSE_PRODUCTS)
  @ApiOperation({ summary: 'Listar productos del almacén activo' })
  list(@Req() req: any, @Query() query: ListWarehouseProductsDto) {
    return this.service.list(req.user, query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_WAREHOUSE_PRODUCTS)
  @ApiOperation({ summary: 'Detalle de producto de almacén' })
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.service.findOne(req.user, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_WAREHOUSE_PRODUCTS)
  @ApiOperation({ summary: 'Actualizar configuración de producto de almacén' })
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateWarehouseProductDto) {
    return this.service.update(req.user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.MANAGE_WAREHOUSE_PRODUCTS)
  @ApiOperation({ summary: 'Eliminar producto de almacén (stock debe ser 0)' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(req.user, id);
  }
}
