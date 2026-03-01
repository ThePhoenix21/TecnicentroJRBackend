import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { CreateWarehouseReceptionDto } from './dto/create-warehouse-reception.dto';
import { ListWarehouseReceptionsDto } from './dto/list-warehouse-receptions.dto';
import { WarehouseReceptionsService } from './warehouse-receptions.service';

@ApiTags('Warehouse Receptions')
@ApiBearerAuth()
@Controller('warehouse/receptions')
@RequireTenantFeatures(TenantFeature.WAREHOUSES)
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class WarehouseReceptionsController {
  constructor(private readonly service: WarehouseReceptionsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_WAREHOUSE_RECEPTIONS)
  @ApiOperation({ summary: 'Confirmar recepción en almacén activo' })
  create(@Req() req: any, @Body() dto: CreateWarehouseReceptionDto) {
    return this.service.create(req.user, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_WAREHOUSE_RECEPTIONS)
  @ApiOperation({ summary: 'Listar recepciones del almacén activo' })
  list(@Req() req: any, @Query() query: ListWarehouseReceptionsDto) {
    return this.service.list(req.user, query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_WAREHOUSE_RECEPTIONS)
  @ApiOperation({ summary: 'Detalle de recepción de almacén' })
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.service.findOne(req.user, id);
  }
}
