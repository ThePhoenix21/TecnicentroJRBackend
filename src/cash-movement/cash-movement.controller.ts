import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query } from '@nestjs/common';
import { CashMovementService } from './cash-movement.service';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { UpdateCashMovementDto } from './dto/update-cash-movement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiQuery } from '@nestjs/swagger';

@ApiTags('Cash Movements')
@Controller('cash-movement')
export class CashMovementController {
  constructor(private readonly cashMovementService: CashMovementService) {}

  @Post('manual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({
    summary: 'Crear movimiento manual de caja',
    description: 'Crea un movimiento de caja manual (fuera de órdenes). Requiere autenticación JWT y rol USER o ADMIN.'
  })
  @ApiBody({
    description: 'Datos para crear el movimiento manual',
    type: CreateCashMovementDto,
    examples: {
      ingreso: {
        value: {
          cashSessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          amount: 100.50,
          type: 'INCOME',
          description: 'Venta de productos varios'
        }
      },
      salida: {
        value: {
          cashSessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          amount: 25.00,
          type: 'EXPENSE',
          description: 'Gastos de oficina'
        }
      }
    }
  })
  @ApiResponse({ status: 201, description: 'Movimiento de caja creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'No tienes permisos para realizar movimientos en esta sesión' })
  @ApiResponse({ status: 404, description: 'La sesión de caja especificada no existe' })
  async createManual(@Body() createCashMovementDto: CreateCashMovementDto, @Req() req: any) {
    return this.cashMovementService.createManual(createCashMovementDto, req.user);
  }

  @Get('balance/:cashSessionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener cuadre de caja',
    description: 'Obtiene el cuadre de caja de una sesión específica con todos los movimientos y balance actual. Requiere rol USER o ADMIN.'
  })
  @ApiResponse({ status: 200, description: 'Cuadre de caja obtenido exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'No tienes permisos para ver esta sesión de caja' })
  @ApiResponse({ status: 404, description: 'La sesión de caja especificada no existe' })
  async getCashBalance(@Param('cashSessionId') cashSessionId: string, @Req() req: any) {
    return this.cashMovementService.getCashBalance(cashSessionId, req.user);
  }

  @Get('session/:sessionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener movimientos por sesión',
    description: 'Obtiene todos los movimientos de una sesión de caja específica. Requiere rol USER o ADMIN'
  })
  @ApiResponse({ status: 200, description: 'Movimientos obtenidos exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  findBySession(@Param('sessionId') sessionId: string) {
    return this.cashMovementService.findBySession(sessionId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener todos los movimientos de caja',
    description: 'Obtiene una lista de todos los movimientos de caja registrados. Requiere rol ADMIN'
  })
  @ApiResponse({ status: 200, description: 'Lista de movimientos obtenida exitosamente' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  findAll() {
    return this.cashMovementService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener movimiento por ID',
    description: 'Obtiene los detalles de un movimiento específico por su ID. Requiere rol USER o ADMIN'
  })
  @ApiResponse({ status: 200, description: 'Movimiento encontrado exitosamente' })
  @ApiResponse({ status: 404, description: 'Movimiento no encontrado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  findOne(@Param('id') id: string) {
    return this.cashMovementService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Actualizar movimiento',
    description: 'Actualiza los datos de un movimiento existente. Requiere rol ADMIN'
  })
  @ApiResponse({ status: 200, description: 'Movimiento actualizado exitosamente' })
  @ApiResponse({ status: 404, description: 'Movimiento no encontrado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  update(@Param('id') id: string, @Body() updateCashMovementDto: UpdateCashMovementDto) {
    return this.cashMovementService.update(id, updateCashMovementDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Eliminar movimiento',
    description: 'Elimina un movimiento del sistema. Requiere rol ADMIN'
  })
  @ApiResponse({ status: 200, description: 'Movimiento eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Movimiento no encontrado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  remove(@Param('id') id: string) {
    return this.cashMovementService.remove(id);
  }
}
