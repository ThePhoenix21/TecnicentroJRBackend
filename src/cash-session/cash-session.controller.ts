import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Req, UnauthorizedException, BadRequestException, NotFoundException, ForbiddenException, Query, ValidationPipe } from '@nestjs/common';
import { CashSessionService } from './cash-session.service';
import { CreateCashSessionDto } from './dto/create-cash-session.dto';
import { UpdateCashSessionDto } from './dto/update-cash-session.dto';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Role } from '../auth/enums/role.enum';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { CashMovementService } from '../cash-movement/cash-movement.service';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { TenantFeature } from '@prisma/client';
import { ListClosedCashSessionsDto } from './dto/list-closed-cash-sessions.dto';
import { ListCashMovementsDto } from '../cash-movement/dto/list-cash-movements.dto';
import { ListCashMovementsResponseDto } from '../cash-movement/dto/list-cash-movements-response.dto';
import { PERMISSIONS } from '../auth/permissions';

@ApiTags('Cash Sessions')
@Controller('cash-session')
@RequireTenantFeatures(TenantFeature.CASH)
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CashSessionController {
  constructor(
    private readonly cashSessionService: CashSessionService,
    private readonly authService: AuthService,
    private readonly cashMovementService: CashMovementService
  ) {}

  private hasPermission(user: any, permission: string): boolean {
    if (!user?.permissions) return false;
    return user.permissions.includes(permission);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.MANAGE_CASH)
  @ApiOperation({ summary: 'Crear nueva sesión de caja' })
  async create(@Body() createCashSessionDto: CreateCashSessionDto, @Req() req: any) {
    console.log('Usuario en request:', req.user);
    console.log('Request completo:', req);
    
    if (!req.user) {
      throw new UnauthorizedException('Usuario no autenticado');
    }
    
    return this.cashSessionService.create(createCashSessionDto, req.user);
  }

  @Get(':id/closing-print')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.PRINT_CASH_CLOSURE)
  @ApiOperation({ summary: 'Obtener datos para imprimir cierre de caja' })
  async getClosingPrintData(@Param('id') id: string, @Req() req: any) {
    return this.cashSessionService.getClosingPrintData(id, req.user);
  }


  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Obtener todas las sesiones de caja' })
  findAll(@Req() req: any) {
    return this.cashSessionService.findAll(req.user);
  }

  @Get('current/:storeId')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_CASH)
  @ApiOperation({ summary: 'Obtener sesión de caja actual de una tienda' })
  findCurrentSessionByStore(@Param('storeId') storeId: string, @Req() req: any) {
    return this.cashSessionService.findOpenSessionByStore(storeId, req.user);
  }

  @Get('store/:storeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({ summary: 'Obtener sesiones de caja por tienda' })
  async findByStore(
    @Param('storeId') storeId: string, 
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20
    , @Req() req: any
  ) {
    return this.cashSessionService.findByStore(storeId, page, limit, req.user);
  }

  @Get('store/:storeId/open')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_CASH)
  @ApiOperation({ summary: 'Obtener sesión abierta actual de una tienda' })
  findOpenSessionByStore(@Param('storeId') storeId: string, @Req() req: any) {
    return this.cashSessionService.findOpenSessionByStore(storeId, req.user);
  }

  @Post('store/closed')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({ summary: 'Listar cajas cerradas de una tienda (ADMIN)' })
  async listClosedCashSessions(
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) body: ListClosedCashSessionsDto,
    @Req() req: any,
  ) {
    const user = req.user;

    // Validar permisos de historial de caja
    if (user.role !== Role.ADMIN) {
      const hasAllHistory = this.hasPermission(user, PERMISSIONS.VIEW_ALL_CASH_HISTORY);
      const hasOwnHistory = this.hasPermission(user, PERMISSIONS.VIEW_OWN_CASH_HISTORY);
      
      if (!hasAllHistory && !hasOwnHistory) {
        throw new ForbiddenException('No tienes permisos para ver historial de cajas cerradas');
      }
      
      // Si tiene VIEW_ALL_CASH_HISTORY, no filtrar (ver todas las sesiones)
      // Si solo tiene VIEW_OWN_CASH_HISTORY, filtrar por sus sesiones
      if (!hasAllHistory && hasOwnHistory) {
        // Extraer el nombre del usuario del email (parte antes del @)
        const userName = user.email?.split('@')[0] || 'unknown';
        body.openedByName = userName; // Forzar filtro por usuario
      }
      // Si tiene VIEW_ALL_CASH_HISTORY, no aplicar filtro (body.openedByName queda undefined/null)
    }

    const tokenStores: string[] = Array.isArray(user?.stores) ? user.stores : [];
    const storeIdFromToken = tokenStores.length === 1 ? tokenStores[0] : undefined;

    let storeId: string | undefined;

    if (user?.role === Role.ADMIN) {
      storeId = body.storeId || storeIdFromToken;
      if (!storeId) {
        throw new BadRequestException('storeId es requerido para ADMIN cuando el token trae múltiples tiendas o no trae stores');
      }
    } else {
      storeId = storeIdFromToken;
      if (!storeId) {
        throw new BadRequestException('El token debe contener exactamente una tienda (stores) para este endpoint');
      }
    }

    if (tokenStores.length > 0 && !tokenStores.includes(storeId)) {
      throw new ForbiddenException('No tienes permisos para acceder a esta tienda');
    }

    return this.cashSessionService.listClosedSessionsByStore(storeId, { from: body.from, to: body.to, openedByName: body.openedByName }, user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({ summary: 'Obtener sesión de caja por ID' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.cashSessionService.findOne(id, req.user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar sesión de caja' })
  update(@Param('id') id: string, @Body() updateCashSessionDto: UpdateCashSessionDto, @Req() req: any) {
    return this.cashSessionService.update(id, updateCashSessionDto, req.user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar sesión de caja' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.cashSessionService.remove(id, req.user);
  }

  @Get(':sessionId/movements')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({ summary: 'Obtener movimientos de una sesión de caja' })
  async getMovements(
    @Param('sessionId') sessionId: string,
    @Query() query: ListCashMovementsDto,
    @Req() req: any
  ): Promise<ListCashMovementsResponseDto> {
    return this.cashMovementService.findBySession(sessionId, query, req.user);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Cerrar sesión de caja' })
  async closeCashSession(
    @Param('id') id: string,
    @Body() closeCashSessionDto: CloseCashSessionDto,
    @Req() req: any
  ) {
    // Validar permisos de gestión de caja
    if (req.user?.role !== Role.ADMIN) {
      const user = await this.authService.validateAnyUser(
        closeCashSessionDto.email,
        closeCashSessionDto.password
      );

      if (!user || !this.hasPermission(user, PERMISSIONS.MANAGE_CASH)) {
        throw new ForbiddenException('No tienes permisos para gestionar cajas');
      }
    }

    // 1. Validar credenciales del usuario
    const user = await this.authService.validateAnyUser(
      closeCashSessionDto.email,
      closeCashSessionDto.password
    );

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.tenantId) {
      throw new ForbiddenException('Tenant no encontrado para el usuario');
    }

    const authUser = {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    // 2. Obtener la sesión de caja con información completa
    const cashSession = await this.cashSessionService.findOneForClose(id, authUser);
    
    if (!cashSession) {
      throw new NotFoundException('La sesión de caja no existe');
    }

    // 3. Verificar que la sesión esté abierta
    if (cashSession.status !== 'OPEN') {
      throw new BadRequestException('La sesión de caja ya está cerrada');
    }

    // 4. Verificar permisos: solo el usuario que abrió o un ADMIN pueden cerrar
    const isAdmin = user.role === Role.ADMIN;
    const isOwner = cashSession.UserId === user.id;
    
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('Solo el usuario que abrió la sesión o un administrador pueden cerrarla');
    }

    // 5. Obtener el cuadre de caja actual
    const cashBalance = await this.cashMovementService.getCashBalance(id, authUser, { allowAdmin: isAdmin });

    // 6. Calcular el monto de cierre (balance actual)
    const closingAmount = cashBalance.balance.balanceActual;

    // 7. Cerrar la sesión de caja
    const updatedSession = await this.cashSessionService.close(
      id, 
      user.id, 
      closingAmount, 
      closeCashSessionDto.declaredAmount,
      authUser
    );

    // 8. Obtener reporte de cierre
    const closingReport = await this.cashSessionService.getClosingReport(id, authUser);

    return {
      message: 'Sesión de caja cerrada exitosamente',
      cashBalance: cashBalance.balance,
      closingReport,
    };
  }
}
