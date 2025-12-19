import { Controller, Get, Post, Body, Query, UseGuards, Req, Param, ForbiddenException } from '@nestjs/common';
import { InventoryMovementService } from './inventory-movement.service';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { FilterInventoryMovementDto } from './dto/filter-inventory-movement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { Role } from '../auth/enums/role.enum';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { TenantFeature } from '@prisma/client';

@ApiTags('Movimientos de Inventario')
@Controller('inventory-movements')
@RequireTenantFeatures(TenantFeature.INVENTORY)
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class InventoryMovementController {
  constructor(private readonly inventoryMovementService: InventoryMovementService) {}

  @Post()
  @Roles(Role.ADMIN, Role.USER) // USER puede registrar entradas/salidas? Según requerimiento sí, ADJUST solo supervisores.
  @ApiOperation({ summary: 'Registrar un movimiento manual (Entrada/Salida)' })
  create(@Body() createDto: CreateInventoryMovementDto, @Req() req: any) {
    // Validación adicional de rol para ADJUST
    if (createDto.type === 'ADJUST' && req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Solo administradores pueden realizar ajustes manuales');
    }
    return this.inventoryMovementService.create(createDto, req.user);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener historial de movimientos con filtros' })
  findAll(@Query() filterDto: FilterInventoryMovementDto, @Req() req: any) {
    return this.inventoryMovementService.findAll(filterDto, req.user);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Obtener estadísticas para dashboard de inventario' })
  @RequirePermissions(PERMISSIONS.VIEW_DASHBOARD)
  getDashboard(@Query('storeId') storeId: string | undefined, @Req() req: any) {
    return this.inventoryMovementService.getDashboardStats(storeId, req.user);
  }

  @Get('product/:id')
  @ApiOperation({ summary: 'Obtener últimos movimientos de un producto' })
  getProductMovements(@Param('id') id: string, @Req() req: any) {
    return this.inventoryMovementService.getProductMovements(id, req.user);
  }
}
