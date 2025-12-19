import { 
  Controller, 
  Post, 
  Body, 
  Param, 
  Delete, 
  Patch, 
  Get, 
  UseGuards, 
  Req, 
  HttpStatus,
  HttpCode
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryCountService } from './inventory-count.service';
import { CreateInventoryCountSessionDto } from './dto/create-inventory-count-session.dto';
import { AddInventoryCountItemDto } from './dto/add-inventory-count-item.dto';
import { UpdateInventoryCountItemDto } from './dto/update-inventory-count-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { Request } from 'express';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { TenantFeature } from '@prisma/client';

@ApiTags('Inventario Físico')
@Controller('inventory-count')
@RequireTenantFeatures(TenantFeature.INVENTORY)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class InventoryCountController {
  constructor(private readonly inventoryCountService: InventoryCountService) {}

  @Post('session')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear una nueva sesión de conteo (Solo ADMIN)' })
  @ApiResponse({ status: 201, description: 'Sesión creada exitosamente' })
  createSession(
    @Body() createDto: CreateInventoryCountSessionDto,
    @Req() req: any
  ) {
    return this.inventoryCountService.createSession(createDto, req.user.userId);
  }

  @Get('session')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Listar sesiones de conteo' })
  findAllSessions() {
    return this.inventoryCountService.findAllSessions();
  }

  @Delete('session/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar una sesión de conteo (Solo ADMIN)' })
  deleteSession(@Param('id') id: string) {
    return this.inventoryCountService.deleteSession(id);
  }

  @Post('session/:id/items')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Agregar item a la sesión de conteo' })
  addItem(
    @Param('id') sessionId: string,
    @Body() addDto: AddInventoryCountItemDto,
    @Req() req: any
  ) {
    return this.inventoryCountService.addItem(sessionId, addDto, req.user.userId);
  }

  @Patch('items/:id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Actualizar item de conteo' })
  updateItem(
    @Param('id') itemId: string,
    @Body() updateDto: UpdateInventoryCountItemDto,
    @Req() req: any
  ) {
    return this.inventoryCountService.updateItem(itemId, updateDto, req.user.userId);
  }

  @Post('session/:id/close')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cerrar/Finalizar sesión de conteo (Solo ADMIN)' })
  closeSession(
    @Param('id') sessionId: string,
    @Req() req: any
  ) {
    return this.inventoryCountService.closeSession(sessionId, req.user.userId);
  }

  @Get('session/:id/report')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Obtener reporte de la sesión' })
  getSessionReport(@Param('id') sessionId: string) {
    return this.inventoryCountService.getSessionReport(sessionId);
  }
}
