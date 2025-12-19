import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Req, UnauthorizedException, BadRequestException, NotFoundException, ForbiddenException, Query } from '@nestjs/common';
import { CashSessionService } from './cash-session.service';
import { CreateCashSessionDto } from './dto/create-cash-session.dto';
import { UpdateCashSessionDto } from './dto/update-cash-session.dto';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { CashMovementService } from '../cash-movement/cash-movement.service';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { TenantFeature } from '@prisma/client';

@ApiTags('Cash Sessions')
@Controller('cash-session')
@RequireTenantFeatures(TenantFeature.CASH)
export class CashSessionController {
  constructor(
    private readonly cashSessionService: CashSessionService,
    private readonly authService: AuthService,
    private readonly cashMovementService: CashMovementService
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({
    summary: 'Crear nueva sesión de caja',
    description: 'Crea una nueva sesión de caja para una tienda específica. Requiere autenticación JWT y rol USER o ADMIN. El usuario debe pertenecer a la tienda y no debe haber sesiones abiertas previas.'
  })
  @ApiBody({
    description: 'Datos para crear la sesión de caja',
    type: CreateCashSessionDto,
    examples: {
      example: {
        value: {
          storeId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          openingAmount: 100.50
        }
      }
    }
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Sesión de caja creada exitosamente',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Sesión de caja creada exitosamente' },
        cashSession: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            openedAt: { type: 'string' },
            closedAt: { type: 'string', nullable: true },
            openedById: { type: 'string' },
            closedById: { type: 'string', nullable: true },
            status: { type: 'string', example: 'OPEN' },
            openingAmount: { type: 'number' },
            closingAmount: { type: 'number', nullable: true },
            StoreId: { type: 'string' },
            UserId: { type: 'string' },
            Store: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                address: { type: 'string', nullable: true },
                phone: { type: 'string', nullable: true }
              }
            },
            User: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string' },
                username: { type: 'string' }
              }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'No tienes permisos para crear sesiones en esta tienda' })
  @ApiResponse({ status: 404, description: 'La tienda especificada no existe' })
  @ApiResponse({ status: 409, description: 'Ya hay una sesión de caja abierta para esta tienda' })
  async create(@Body() createCashSessionDto: CreateCashSessionDto, @Req() req: any) {
    console.log('Usuario en request:', req.user);
    console.log('Request completo:', req);
    
    if (!req.user) {
      throw new UnauthorizedException('Usuario no autenticado');
    }
    
    return this.cashSessionService.create(createCashSessionDto, req.user);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener todas las sesiones de caja',
    description: 'Obtiene una lista de todas las sesiones de caja registradas. Requiere rol ADMIN'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de sesiones de caja obtenida exitosamente'
  })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  findAll() {
    return this.cashSessionService.findAll();
  }

  @Get('current/:storeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener sesión de caja actual de una tienda',
    description: 'Obtiene la sesión de caja actualmente abierta para una tienda específica. Requiere rol USER o ADMIN'
  })
  @ApiParam({ 
    name: 'storeId', 
    description: 'ID de la tienda para obtener la sesión actual',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Sesión actual obtenida exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'b2c3d4e5-f6a7-8901-bcde-f23456789012' },
        storeId: { type: 'string', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
        openedAt: { type: 'string', format: 'date-time' },
        closedAt: { type: 'string', format: 'date-time', nullable: true },
        openedById: { type: 'string', example: 'c3d4e5f6-a7b8-9012-cdef-345678901234' },
        closedById: { type: 'string', nullable: true },
        status: { type: 'string', enum: ['OPEN', 'CLOSED'], example: 'OPEN' },
        openingAmount: { type: 'number', example: 100.50 },
        closingAmount: { type: 'number', nullable: true }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'No hay sesión abierta para esta tienda',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'No hay sesión abierta para esta tienda' }
      }
    }
  })
  @ApiResponse({ 
    status: 403, 
    description: 'No autorizado',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'No autorizado' }
      }
    }
  })
  findCurrentSessionByStore(@Param('storeId') storeId: string) {
    return this.cashSessionService.findOpenSessionByStore(storeId);
  }

  @Get('store/:storeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener sesiones de caja por tienda',
    description: 'Obtiene todas las sesiones de caja de una tienda específica con paginación opcional. Requiere rol USER o ADMIN'
  })
  @ApiParam({ 
    name: 'storeId', 
    description: 'ID de la tienda para obtener las sesiones',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    description: 'Número de página (default: 1)', 
    example: 1 
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    description: 'Cantidad de resultados por página (default: 20)', 
    example: 20 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Sesiones de caja obtenidas exitosamente',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'b2c3d4e5-f6a7-8901-bcde-f23456789012' },
              storeId: { type: 'string', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
              openedAt: { type: 'string', format: 'date-time' },
              closedAt: { type: 'string', format: 'date-time', nullable: true },
              openedById: { type: 'string', example: 'c3d4e5f6-a7b8-9012-cdef-345678901234' },
              closedById: { type: 'string', nullable: true },
              status: { type: 'string', enum: ['OPEN', 'CLOSED'], example: 'CLOSED' },
              openingAmount: { type: 'number', example: 100.50 },
              closingAmount: { type: 'number', example: 250.75 }
            }
          }
        },
        total: { type: 'number', example: 45, description: 'Total de sesiones' },
        page: { type: 'number', example: 1, description: 'Página actual' },
        limit: { type: 'number', example: 20, description: 'Resultados por página' },
        totalPages: { type: 'number', example: 3, description: 'Total de páginas' }
      }
    }
  })
  @ApiResponse({ 
    status: 403, 
    description: 'No autorizado',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'No autorizado' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Tienda no encontrada',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Tienda no encontrada' }
      }
    }
  })
  async findByStore(
    @Param('storeId') storeId: string, 
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20
  ) {
    return this.cashSessionService.findByStore(storeId, page, limit);
  }

  @Get('store/:storeId/open')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener sesión abierta actual de una tienda',
    description: 'Obtiene la sesión de caja actualmente abierta para una tienda específica. Requiere rol USER o ADMIN'
  })
  @ApiResponse({ status: 200, description: 'Sesión abierta obtenida exitosamente' })
  @ApiResponse({ status: 404, description: 'No hay sesión abierta para esta tienda' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  findOpenSessionByStore(@Param('storeId') storeId: string) {
    return this.cashSessionService.findOpenSessionByStore(storeId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener sesión de caja por ID',
    description: 'Obtiene los detalles de una sesión de caja específica por su ID. Requiere rol USER o ADMIN'
  })
  @ApiResponse({ status: 200, description: 'Sesión de caja encontrada exitosamente' })
  @ApiResponse({ status: 404, description: 'Sesión de caja no encontrada' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  findOne(@Param('id') id: string) {
    return this.cashSessionService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Actualizar sesión de caja',
    description: 'Actualiza los datos de una sesión de caja existente. Requiere rol ADMIN'
  })
  @ApiResponse({ status: 200, description: 'Sesión de caja actualizada exitosamente' })
  @ApiResponse({ status: 404, description: 'Sesión de caja no encontrada' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  update(@Param('id') id: string, @Body() updateCashSessionDto: UpdateCashSessionDto) {
    return this.cashSessionService.update(id, updateCashSessionDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Eliminar sesión de caja',
    description: 'Elimina una sesión de caja del sistema. Requiere rol ADMIN'
  })
  @ApiResponse({ status: 200, description: 'Sesión de caja eliminada exitosamente' })
  @ApiResponse({ status: 404, description: 'Sesión de caja no encontrada' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  remove(@Param('id') id: string) {
    return this.cashSessionService.remove(id);
  }

  @Post(':id/close')
  @ApiOperation({
    summary: 'Cerrar sesión de caja',
    description: 'Cierra una sesión de caja y genera el cuadre final. Reiere credenciales del usuario (email y password). Solo el usuario que abrió la sesión o un ADMIN pueden cerrarla.'
  })
  @ApiBody({
    type: CloseCashSessionDto,
    description: 'Credenciales del usuario que cierra la sesión',
    examples: {
      example: {
        value: {
          email: 'usuario@ejemplo.com',
          password: 'contraseña123'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Sesión de caja cerrada exitosamente con cuadre final',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Sesión de caja cerrada exitosamente' },
        cashBalance: {
          type: 'object',
          properties: {
            openingAmount: { type: 'number' },
            totalIngresos: { type: 'number' },
            totalSalidas: { type: 'number' },
            balanceActual: { type: 'number' }
          }
        },
        closingReport: {
          type: 'object',
          properties: {
            openedAt: { type: 'string' },
            closedAt: { type: 'string' },
            openedBy: { type: 'string' },
            closedBy: { type: 'string' },
            openingAmount: { type: 'number' },
            closingAmount: { type: 'number' },
            storeName: { type: 'string' },
            storeAddress: { type: 'string' },
            storePhone: { type: 'string' },
            printedAt: { type: 'string' },
            orders: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  orderNumber: { type: 'string' },
                  quantity: { type: 'number' },
                  description: { type: 'string' },
                  paymentMethod: { type: 'string' },
                  price: { type: 'number' },
                  status: { type: 'string' }
                }
              }
            },
            paymentSummary: {
              type: 'object',
              additionalProperties: { type: 'number' }
            },
            expenses: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  amount: { type: 'number' },
                  time: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 403, description: 'No tienes permisos para cerrar esta sesión' })
  @ApiResponse({ status: 404, description: 'Sesión de caja no encontrada o ya está cerrada' })
  async closeCashSession(
    @Param('id') id: string,
    @Body() closeCashSessionDto: CloseCashSessionDto
  ) {
    // 1. Validar credenciales del usuario
    const user = await this.authService.validateAnyUser(
      closeCashSessionDto.email,
      closeCashSessionDto.password
    );

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 2. Obtener la sesión de caja con información completa
    const cashSession = await this.cashSessionService.findOne(id);
    
    if (!cashSession) {
      throw new NotFoundException('La sesión de caja no existe');
    }

    // 3. Verificar que la sesión esté abierta
    if (cashSession.status !== 'OPEN') {
      throw new BadRequestException('La sesión de caja ya está cerrada');
    }

    // 4. Verificar permisos: solo el usuario que abrió o un ADMIN pueden cerrar
    const isAdmin = user.role === Role.ADMIN;
    const isOwner = cashSession.openedById === user.id;
    
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('Solo el usuario que abrió la sesión o un administrador pueden cerrarla');
    }

    // 5. Obtener el cuadre de caja actual
    const cashBalance = await this.cashMovementService.getCashBalance(id, { 
      userId: user.id, 
      email: user.email, 
      role: user.role 
    });

    // 6. Calcular el monto de cierre (balance actual)
    const closingAmount = cashBalance.balance.balanceActual;

    // 7. Cerrar la sesión de caja
    const updatedSession = await this.cashSessionService.close(
      id, 
      user.id, 
      closingAmount, 
      closeCashSessionDto.declaredAmount
    );

    // 8. Obtener reporte de cierre
    const closingReport = await this.cashSessionService.getClosingReport(id);

    return {
      message: 'Sesión de caja cerrada exitosamente',
      cashBalance: cashBalance.balance,
      closingReport,
    };
  }
}
