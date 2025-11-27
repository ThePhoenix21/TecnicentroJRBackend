import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Req, UnauthorizedException, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CashSessionService } from './cash-session.service';
import { CreateCashSessionDto } from './dto/create-cash-session.dto';
import { UpdateCashSessionDto } from './dto/update-cash-session.dto';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { CashMovementService } from '../cash-movement/cash-movement.service';

@ApiTags('Cash Sessions')
@Controller('cash-session')
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

  @Get('store/:storeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener sesiones de caja por tienda',
    description: 'Obtiene todas las sesiones de caja de una tienda específica. Requiere rol USER o ADMIN'
  })
  @ApiResponse({ status: 200, description: 'Sesiones de caja obtenidas exitosamente' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  findByStore(@Param('storeId') storeId: string) {
    return this.cashSessionService.findByStore(storeId);
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
        cashSession: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            openedAt: { type: 'string' },
            closedAt: { type: 'string' },
            openedById: { type: 'string' },
            closedById: { type: 'string' },
            status: { type: 'string', example: 'CLOSED' },
            openingAmount: { type: 'number' },
            closingAmount: { type: 'number' }
          }
        },
        cashBalance: {
          type: 'object',
          properties: {
            openingAmount: { type: 'number' },
            totalIngresos: { type: 'number' },
            totalSalidas: { type: 'number' },
            balanceActual: { type: 'number' }
          }
        },
        movements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              amount: { type: 'number' },
              description: { type: 'string' },
              clientName: { type: 'string' },
              createdAt: { type: 'string' }
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
    const updatedSession = await this.cashSessionService.close(id, user.id, closingAmount);

    return {
      message: 'Sesión de caja cerrada exitosamente',
      cashSession: updatedSession,
      cashBalance: cashBalance.balance,
      movements: cashBalance.movements
    };
  }
}
