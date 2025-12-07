import { Controller, Get, Post, Body, Query, UseGuards, Req, Param } from '@nestjs/common';
import { InventoryMovementService } from './inventory-movement.service';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';
import { FilterInventoryMovementDto } from './dto/filter-inventory-movement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Movimientos de Inventario')
@Controller('inventory-movements')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class InventoryMovementController {
  constructor(private readonly inventoryMovementService: InventoryMovementService) {}

  @Post()
  @Roles(Role.ADMIN, Role.USER) // USER puede registrar entradas/salidas? Según requerimiento sí, ADJUST solo supervisores.
  @ApiOperation({ summary: 'Registrar un movimiento manual (Entrada/Salida)' })
  create(@Body() createDto: CreateInventoryMovementDto, @Req() req: any) {
    // Validación adicional de rol para ADJUST
    if (createDto.type === 'ADJUST' && req.user.role !== 'ADMIN') {
      throw new Error('Solo administradores pueden realizar ajustes manuales');
    }
    return this.inventoryMovementService.create(createDto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener historial de movimientos con filtros' })
  findAll(@Query() filterDto: FilterInventoryMovementDto) {
    return this.inventoryMovementService.findAll(filterDto);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Obtener estadísticas para dashboard de inventario' })
  getDashboard(@Query('storeId') storeId?: string) {
    return this.inventoryMovementService.getDashboardStats(storeId);
  }

  @Get('product/:id')
  @ApiOperation({ summary: 'Obtener últimos movimientos de un producto' })
  getProductMovements(@Param('id') id: string) {
    return this.inventoryMovementService.getProductMovements(id);
  }
}
