import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantFeature } from '@prisma/client';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PERMISSIONS } from '../auth/permissions';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { CreateWarehouseSupplierDto } from './dto/create-warehouse-supplier.dto';
import { ListWarehouseSuppliersDto } from './dto/list-warehouse-suppliers.dto';
import { UpdateWarehouseSupplierDto } from './dto/update-warehouse-supplier.dto';
import { WarehouseSuppliersService } from './warehouse-suppliers.service';

@ApiTags('Warehouse Suppliers')
@ApiBearerAuth()
@Controller('warehouse/suppliers')
@RequireTenantFeatures(TenantFeature.SUPPLIERS)
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class WarehouseSuppliersController {
  constructor(private readonly service: WarehouseSuppliersService) {}

  @Post()
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_WAREHOUSE_SUPPLIERS)
  @ApiOperation({ summary: 'Crear proveedor para dominio warehouse' })
  create(@Req() req: any, @Body() dto: CreateWarehouseSupplierDto) {
    return this.service.create(req.user, req.warehouseId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_WAREHOUSE_SUPPLIERS)
  @ApiOperation({ summary: 'Listar proveedores para dominio warehouse' })
  list(@Req() req: any, @Query() query: ListWarehouseSuppliersDto) {
    return this.service.list(req.user, req.warehouseId, query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_WAREHOUSE_SUPPLIERS)
  @ApiOperation({ summary: 'Detalle de proveedor' })
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.service.findOne(req.user, req.warehouseId, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_WAREHOUSE_SUPPLIERS)
  @ApiOperation({ summary: 'Actualizar proveedor' })
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateWarehouseSupplierDto) {
    return this.service.update(req.user, req.warehouseId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_WAREHOUSE_SUPPLIERS)
  @ApiOperation({ summary: 'Eliminar proveedor (soft delete)' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(req.user, req.warehouseId, id);
  }
}
