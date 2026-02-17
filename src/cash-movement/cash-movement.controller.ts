import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query, ForbiddenException } from '@nestjs/common';
import { CashMovementService } from './cash-movement.service';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { UpdateCashMovementDto } from './dto/update-cash-movement.dto';
import { ListCashMovementsDto, CashMovementOperationFilter } from './dto/list-cash-movements.dto';
import { ListCashMovementsResponseDto } from './dto/list-cash-movements-response.dto';
import { CashMovementLookupItemDto } from './dto/cash-movement-lookup-item.dto';
import { CashMovementOperationLookupDto } from './dto/cash-movement-operation-lookup.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Role } from '../auth/enums/role.enum';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { PaymentType, TenantFeature } from '@prisma/client';
import { PERMISSIONS } from '../auth/permissions';

@ApiTags('Cash Movements')
@Controller('cash-movement')
@RequireTenantFeatures(TenantFeature.CASH)
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CashMovementController {
  constructor(private readonly cashMovementService: CashMovementService) {}

  private hasPermission(user: any, permission: string): boolean {
    if (!user?.permissions) return false;
    return user.permissions.includes(permission);
  }

  @Post('manual')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.MANAGE_CASH)
  @ApiOperation({ summary: 'Crear movimiento manual' })
  async createManual(@Body() createCashMovementDto: CreateCashMovementDto, @Req() req: any) {
    return this.cashMovementService.createManual(createCashMovementDto, req.user);
  }

  @Get('balance/:cashSessionId')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_CASH)
  @ApiOperation({ summary: 'Consultar balance de una sesión' })
  async getCashBalance(@Param('cashSessionId') cashSessionId: string, @Req() req: any) {
    return this.cashMovementService.getCashBalance(cashSessionId, req.user);
  }

  @Get('session/:sessionId')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_CASH)
  @ApiOperation({ summary: 'Listar movimientos por sesión' })
  async findBySession(
    @Param('sessionId') sessionId: string,
    @Query() query: ListCashMovementsDto,
    @Req() req: any
  ): Promise<ListCashMovementsResponseDto> {
    // Validar que el usuario tenga al menos uno de los permisos requeridos
    const hasViewCash = this.hasPermission(req.user, PERMISSIONS.VIEW_CASH);
    const hasOwnHistory = this.hasPermission(req.user, PERMISSIONS.VIEW_OWN_CASH_HISTORY);
    const hasAllHistory = this.hasPermission(req.user, PERMISSIONS.VIEW_ALL_CASH_HISTORY);
    
    if (!hasViewCash && !hasOwnHistory && !hasAllHistory) {
      throw new ForbiddenException('No tienes permisos para ver movimientos de caja');
    }
    
    // Si solo tiene permiso para ver su propio historial, validar que la sesión sea suya
    if (!hasViewCash && !hasAllHistory && hasOwnHistory) {
      const session = await this.cashMovementService.getSessionOwner(sessionId);
      if (session.UserId !== req.user.userId) {
        throw new ForbiddenException('Solo puedes ver tus propias sesiones de caja');
      }
    }
    
    return this.cashMovementService.findBySession(sessionId, query, req.user);
  }

  @Get('lookup-payment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({ summary: 'Lookup de métodos de pago para movimientos de caja' })
  lookupPayment(): CashMovementLookupItemDto[] {
    return Object.values(PaymentType).map((p) => ({ id: p, value: p }));
  }

  @Get('lookup-operation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({ summary: 'Lookup de operaciones para movimientos de caja' })
  lookupOperation(): CashMovementOperationLookupDto[] {
    return Object.values(CashMovementOperationFilter).map((op) => ({ id: op, value: op }));
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Listar todos los movimientos' })
  findAll(@Req() req: any) {
    return this.cashMovementService.findAll(req.user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({ summary: 'Ver detalle de un movimiento' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.cashMovementService.findOne(id, req.user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar movimiento' })
  update(@Param('id') id: string, @Body() updateCashMovementDto: UpdateCashMovementDto, @Req() req: any) {
    return this.cashMovementService.update(id, updateCashMovementDto, req.user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar movimiento' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.cashMovementService.remove(id, req.user);
  }
}
