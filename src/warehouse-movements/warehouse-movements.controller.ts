import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantFeature } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { CreateWarehouseMovementDto } from './dto/create-warehouse-movement.dto';
import { ListWarehouseMovementsDto } from './dto/list-warehouse-movements.dto';
import { WarehouseMovementsService } from './warehouse-movements.service';

@ApiTags('Warehouse Movements')
@ApiBearerAuth()
@Controller('warehouse/movements')
@RequireTenantFeatures(TenantFeature.WAREHOUSES)
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class WarehouseMovementsController {
  constructor(private readonly service: WarehouseMovementsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_WAREHOUSE_MOVEMENTS)
  @ApiOperation({ summary: 'Registrar movimiento en almacén activo' })
  create(@Req() req: any, @Body() dto: CreateWarehouseMovementDto) {
    return this.service.create(req.user, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_WAREHOUSE_MOVEMENTS)
  @ApiOperation({ summary: 'Listar movimientos de almacén activo' })
  list(@Req() req: any, @Query() query: ListWarehouseMovementsDto) {
    return this.service.list(req.user, query);
  }
}
