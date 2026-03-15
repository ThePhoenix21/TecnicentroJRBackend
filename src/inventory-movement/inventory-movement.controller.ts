import { Controller, Get, Post, Body, Query, UseGuards, Req, Param, ForbiddenException } from '@nestjs/common';
import { InventoryMovementService } from './inventory-movement.service';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { FilterInventoryMovementDto } from './dto/filter-inventory-movement.dto';
import { InventoryMovementSummaryDto } from './dto/inventory-movement-summary.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { Role } from '../auth/enums/role.enum';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { TenantFeature } from '@prisma/client';
import { ListInventoryMovementsResponseDto } from './dto/list-inventory-movements-response.dto';

@ApiTags('Movimientos de Inventario')
@Controller('inventory-movements')
@RequireTenantFeatures(TenantFeature.INVENTORY)
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.VIEW_INVENTORY)
@ApiBearerAuth()
export class InventoryMovementController {
  constructor(private readonly inventoryMovementService: InventoryMovementService) {}

  @Post()
  @Roles(Role.ADMIN, Role.USER) // USER puede registrar entradas/salidas? Según requerimiento sí, ADJUST solo supervisores.
  @RequirePermissions(PERMISSIONS.MANAGE_INVENTORY)
  @ApiOperation({ summary: 'Registrar un movimiento manual (Entrada/Salida)' })
  create(@Body() createDto: CreateInventoryMovementDto, @Req() req: any) {
    // Validación adicional de rol para ADJUST
    if (createDto.type === 'ADJUST' && req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Solo administradores pueden realizar ajustes manuales');
    }
    return this.inventoryMovementService.create(createDto, req.user);
  }

  @Get()
  @ApiOperation({
    summary: 'Obtener historial de movimientos con filtros',
    description: 'Lista paginada de movimientos filtrados por tienda, producto, tipo, usuario y rango de fechas.',
  })
  @ApiOkResponse({ type: ListInventoryMovementsResponseDto })
  findAll(@Query() filterDto: FilterInventoryMovementDto, @Req() req: any): Promise<ListInventoryMovementsResponseDto> {
    return this.inventoryMovementService.findAll(filterDto, req.user);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Obtener estadísticas para dashboard de inventario' })
  @RequirePermissions(PERMISSIONS.VIEW_DASHBOARD)
  getDashboard(@Query('storeId') storeId: string | undefined, @Req() req: any) {
    return this.inventoryMovementService.getDashboardStats(storeId, req.user);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Obtener resumen de movimientos (entradas/salidas/ventas/devoluciones/ajustes) con filtro por fecha' })
  getSummary(@Query() query: InventoryMovementSummaryDto, @Req() req: any) {
    return this.inventoryMovementService.getMovementsSummary(query, req.user);
  }

  @Get('product/:id')
  @ApiOperation({ summary: 'Obtener últimos movimientos de un producto' })
  getProductMovements(@Param('id') id: string, @Req() req: any) {
    return this.inventoryMovementService.getProductMovements(id, req.user);
  }
}
