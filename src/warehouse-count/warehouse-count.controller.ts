import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
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
import { AddWarehouseCountItemDto } from './dto/add-warehouse-count-item.dto';
import { CreateWarehouseCountSessionDto } from './dto/create-warehouse-count-session.dto';
import { UpdateWarehouseCountItemDto } from './dto/update-warehouse-count-item.dto';
import { WarehouseCountService } from './warehouse-count.service';

@ApiTags('Warehouse Count')
@ApiBearerAuth()
@Controller('warehouse/count')
@RequireTenantFeatures(TenantFeature.WAREHOUSES)
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class WarehouseCountController {
  constructor(private readonly service: WarehouseCountService) {}

  @Post('session')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_WAREHOUSE_COUNTS)
  @ApiOperation({ summary: 'Crear sesión de conteo para almacén activo' })
  createSession(@Req() req: any, @Body() dto: CreateWarehouseCountSessionDto) {
    return this.service.createSession(req.user, dto);
  }

  @Get('session')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_WAREHOUSE_COUNTS)
  @ApiOperation({ summary: 'Listar sesiones de conteo del almacén activo' })
  listSessions(@Req() req: any) {
    return this.service.listSessions(req.user);
  }

  @Post('session/:id/items')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_WAREHOUSE_COUNTS)
  @ApiOperation({ summary: 'Registrar conteo físico por producto de almacén' })
  addItem(@Req() req: any, @Param('id') sessionId: string, @Body() dto: AddWarehouseCountItemDto) {
    return this.service.addItem(req.user, sessionId, dto);
  }

  @Patch('items/:id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_WAREHOUSE_COUNTS)
  @ApiOperation({ summary: 'Actualizar conteo físico de item' })
  updateItem(@Req() req: any, @Param('id') itemId: string, @Body() dto: UpdateWarehouseCountItemDto) {
    return this.service.updateItem(req.user, itemId, dto);
  }

  @Post('session/:id/close')
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.MANAGE_WAREHOUSE_COUNTS)
  @ApiOperation({ summary: 'Cerrar conteo físico y aplicar ajustes de stock' })
  closeSession(@Req() req: any, @Param('id') sessionId: string) {
    return this.service.closeSession(req.user, sessionId);
  }

  @Get('session/:id/report')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_WAREHOUSE_COUNTS)
  @ApiOperation({ summary: 'Reporte de sesión de conteo de almacén' })
  getReport(@Req() req: any, @Param('id') sessionId: string) {
    return this.service.getSessionReport(req.user, sessionId);
  }
}
