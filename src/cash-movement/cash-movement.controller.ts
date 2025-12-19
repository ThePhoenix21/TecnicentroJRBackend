import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query } from '@nestjs/common';
import { CashMovementService } from './cash-movement.service';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { UpdateCashMovementDto } from './dto/update-cash-movement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiQuery, ApiParam } from '@nestjs/swagger';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { TenantFeature } from '@prisma/client';

@ApiTags('Cash Movements')
@Controller('cash-movement')
@RequireTenantFeatures(TenantFeature.CASH)
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
        summary: 'Movimiento de ingreso',
        description: 'Ejemplo de un movimiento de ingreso por venta',
        value: {
          cashSessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          amount: 100.50,
          type: 'INCOME',
          description: 'Venta de productos varios'
        }
      },
      salida: {
        summary: 'Movimiento de egreso',
        description: 'Ejemplo de un movimiento de egreso por gastos',
        value: {
          cashSessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          amount: 25.00,
          type: 'EXPENSE',
          description: 'Gastos de oficina'
        }
      },
      con_orden: {
        summary: 'Movimiento asociado a orden',
        description: 'Ejemplo de un movimiento manual asociado a una orden existente',
        value: {
          cashSessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          amount: 50.00,
          type: 'INCOME',
          description: 'Pago parcial de orden #123',
          orderId: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
          clientId: 'c3d4e5f6-a7b8-9012-cdef-345678901234'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Movimiento de caja creado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'd4e5f6a7-b8c9-0123-def0-456789012345' },
        cashSessionId: { type: 'string', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
        amount: { type: 'number', example: 100.50 },
        type: { type: 'string', enum: ['INCOME', 'EXPENSE'], example: 'INCOME' },
        description: { type: 'string', example: 'Venta de productos varios' },
        orderId: { type: 'string', example: 'b2c3d4e5-f6a7-8901-bcde-f23456789012' },
        clientId: { type: 'string', example: 'c3d4e5f6-a7b8-9012-cdef-345678901234' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Datos de entrada inválidos',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Datos de entrada inválidos' },
        details: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', example: 'amount' },
              message: { type: 'string', example: 'El monto debe ser un número' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'No autorizado - Token JWT inválido o ausente',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  @ApiResponse({ 
    status: 403, 
    description: 'No tienes permisos para realizar movimientos en esta sesión',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'No tienes permisos para realizar movimientos en esta sesión' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'La sesión de caja especificada no existe',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'La sesión de caja especificada no existe' }
      }
    }
  })
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
  @ApiParam({ 
    name: 'cashSessionId', 
    description: 'ID de la sesión de caja a consultar',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Cuadre de caja obtenido exitosamente',
    schema: {
      type: 'object',
      properties: {
        cashSessionId: { type: 'string', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
        initialBalance: { type: 'number', example: 500.00, description: 'Balance inicial de la sesión' },
        totalIncome: { type: 'number', example: 1250.75, description: 'Total de ingresos' },
        totalExpense: { type: 'number', example: 150.25, description: 'Total de egresos' },
        currentBalance: { type: 'number', example: 1600.50, description: 'Balance actual' },
        movementsCount: { type: 'number', example: 15, description: 'Cantidad total de movimientos' },
        movements: {
          type: 'array',
          description: 'Lista de todos los movimientos de la sesión',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'd4e5f6a7-b8c9-0123-def0-456789012345' },
              amount: { type: 'number', example: 100.50 },
              type: { type: 'string', enum: ['INCOME', 'EXPENSE'], example: 'INCOME' },
              description: { type: 'string', example: 'Venta de productos' },
              orderId: { type: 'string', example: 'b2c3d4e5-f6a7-8901-bcde-f23456789012' },
              clientId: { type: 'string', example: 'c3d4e5f6-a7b8-9012-cdef-345678901234' },
              createdAt: { type: 'string', format: 'date-time' }
            }
          }
        },
        sessionInfo: {
          type: 'object',
          description: 'Información adicional de la sesión',
          properties: {
            storeId: { type: 'string', example: 'e5f6a7b8-c9d0-1234-ef01-567890123456' },
            storeName: { type: 'string', example: 'Tienda Principal' },
            userId: { type: 'string', example: 'f6a7b8c9-d0e1-2345-f012-678901234567' },
            userName: { type: 'string', example: 'Juan Pérez' },
            openedAt: { type: 'string', format: 'date-time' },
            closedAt: { type: 'string', format: 'date-time', nullable: true }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'No autorizado - Token JWT inválido o ausente',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  @ApiResponse({ 
    status: 403, 
    description: 'No tienes permisos para ver esta sesión de caja',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'No tienes permisos para ver esta sesión de caja' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'La sesión de caja especificada no existe',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'La sesión de caja especificada no existe' }
      }
    }
  })
  async getCashBalance(@Param('cashSessionId') cashSessionId: string, @Req() req: any) {
    return this.cashMovementService.getCashBalance(cashSessionId, req.user);
  }

  @Get('session/:sessionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener movimientos por sesión',
    description: 'Obtiene todos los movimientos de una sesión de caja específica con paginación opcional. Requiere rol USER o ADMIN'
  })
  @ApiParam({ 
    name: 'sessionId', 
    description: 'ID de la sesión de caja para obtener sus movimientos',
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
    description: 'Cantidad de resultados por página (default: 50)', 
    example: 50 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Movimientos obtenidos exitosamente',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'd4e5f6a7-b8c9-0123-def0-456789012345' },
              cashSessionId: { type: 'string', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
              amount: { type: 'number', example: 100.50 },
              type: { type: 'string', enum: ['INCOME', 'EXPENSE'], example: 'INCOME' },
              description: { type: 'string', example: 'Venta de productos varios' },
              orderId: { type: 'string', example: 'b2c3d4e5-f6a7-8901-bcde-f23456789012', nullable: true },
              clientId: { type: 'string', example: 'c3d4e5f6-a7b8-9012-cdef-345678901234', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' }
            }
          }
        },
        total: { type: 'number', example: 125, description: 'Total de movimientos' },
        page: { type: 'number', example: 1, description: 'Página actual' },
        limit: { type: 'number', example: 50, description: 'Resultados por página' },
        totalPages: { type: 'number', example: 3, description: 'Total de páginas' }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'No autorizado - Token JWT inválido o ausente',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  @ApiResponse({ 
    status: 403, 
    description: 'No tienes permisos para ver los movimientos de esta sesión',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'No tienes permisos para ver los movimientos de esta sesión' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'La sesión de caja especificada no existe',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'La sesión de caja especificada no existe' }
      }
    }
  })
  async findBySession(
    @Param('sessionId') sessionId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Req() req: any
  ) {
    return this.cashMovementService.findBySession(sessionId, page, limit, req.user);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener todos los movimientos de caja',
    description: 'Obtiene una lista de todos los movimientos de caja registrados. Requiere rol ADMIN'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de movimientos obtenida exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'd4e5f6a7-b8c9-0123-def0-456789012345' },
          cashSessionId: { type: 'string', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
          amount: { type: 'number', example: 100.50 },
          type: { type: 'string', enum: ['INCOME', 'EXPENSE'], example: 'INCOME' },
          description: { type: 'string', example: 'Venta de productos varios' },
          orderId: { type: 'string', example: 'b2c3d4e5-f6a7-8901-bcde-f23456789012', nullable: true },
          clientId: { type: 'string', example: 'c3d4e5f6-a7b8-9012-cdef-345678901234', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          cashSession: {
            type: 'object',
            description: 'Información de la sesión de caja asociada',
            properties: {
              id: { type: 'string', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
              storeId: { type: 'string', example: 'e5f6a7b8-c9d0-1234-ef01-567890123456' },
              userId: { type: 'string', example: 'f6a7b8c9-d0e1-2345-f012-678901234567' },
              openedAt: { type: 'string', format: 'date-time' },
              closedAt: { type: 'string', format: 'date-time', nullable: true }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 403, 
    description: 'No autorizado - Se requiere rol ADMIN',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'No autorizado - Se requiere rol ADMIN' }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'No autorizado - Token JWT inválido o ausente',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  findAll(@Req() req: any) {
    return this.cashMovementService.findAll(req.user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener movimiento por ID',
    description: 'Obtiene los detalles de un movimiento específico por su ID. Requiere rol USER o ADMIN'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID del movimiento a consultar',
    example: 'd4e5f6a7-b8c9-0123-def0-456789012345'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Movimiento encontrado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'd4e5f6a7-b8c9-0123-def0-456789012345' },
        cashSessionId: { type: 'string', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
        amount: { type: 'number', example: 100.50 },
        type: { type: 'string', enum: ['INCOME', 'EXPENSE'], example: 'INCOME' },
        description: { type: 'string', example: 'Venta de productos varios' },
        orderId: { type: 'string', example: 'b2c3d4e5-f6a7-8901-bcde-f23456789012', nullable: true },
        clientId: { type: 'string', example: 'c3d4e5f6-a7b8-9012-cdef-345678901234', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        cashSession: {
          type: 'object',
          description: 'Información de la sesión de caja asociada',
          properties: {
            id: { type: 'string', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
            storeId: { type: 'string', example: 'e5f6a7b8-c9d0-1234-ef01-567890123456' },
            userId: { type: 'string', example: 'f6a7b8c9-d0e1-2345-f012-678901234567' },
            openedAt: { type: 'string', format: 'date-time' },
            closedAt: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        order: {
          type: 'object',
          description: 'Información de la orden asociada (si aplica)',
          nullable: true,
          properties: {
            id: { type: 'string', example: 'b2c3d4e5-f6a7-8901-bcde-f23456789012' },
            orderNumber: { type: 'string', example: 'ORD-2025-001' },
            totalAmount: { type: 'number', example: 150.75 },
            clientId: { type: 'string', example: 'c3d4e5f6-a7b8-9012-cdef-345678901234' }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Movimiento no encontrado',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Movimiento no encontrado' }
      }
    }
  })
  @ApiResponse({ 
    status: 403, 
    description: 'No tienes permisos para ver este movimiento',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'No tienes permisos para ver este movimiento' }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'No autorizado - Token JWT inválido o ausente',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.cashMovementService.findOne(id, req.user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Actualizar movimiento',
    description: 'Actualiza los datos de un movimiento existente. Requiere rol ADMIN'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID del movimiento a actualizar',
    example: 'd4e5f6a7-b8c9-0123-def0-456789012345'
  })
  @ApiBody({
    description: 'Datos del movimiento a actualizar (todos los campos son opcionales)',
    type: UpdateCashMovementDto,
    examples: {
      actualizar_monto: {
        summary: 'Actualizar monto y descripción',
        description: 'Ejemplo para corregir el monto y descripción de un movimiento',
        value: {
          amount: 120.75,
          description: 'Venta de productos corregida'
        }
      },
      cambiar_tipo: {
        summary: 'Cambiar tipo de movimiento',
        description: 'Ejemplo para cambiar un movimiento de INCOME a EXPENSE',
        value: {
          type: 'EXPENSE',
          description: 'Gasto de oficina corregido'
        }
      },
      actualizar_completo: {
        summary: 'Actualizar todos los campos',
        description: 'Ejemplo para actualizar todos los campos posibles',
        value: {
          cashSessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          amount: 85.00,
          type: 'INCOME',
          description: 'Venta de accesorios',
          orderId: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
          clientId: 'c3d4e5f6-a7b8-9012-cdef-345678901234'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Movimiento actualizado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'd4e5f6a7-b8c9-0123-def0-456789012345' },
        cashSessionId: { type: 'string', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
        amount: { type: 'number', example: 120.75 },
        type: { type: 'string', enum: ['INCOME', 'EXPENSE'], example: 'INCOME' },
        description: { type: 'string', example: 'Venta de productos corregida' },
        orderId: { type: 'string', example: 'b2c3d4e5-f6a7-8901-bcde-f23456789012', nullable: true },
        clientId: { type: 'string', example: 'c3d4e5f6-a7b8-9012-cdef-345678901234', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Movimiento no encontrado',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Movimiento no encontrado' }
      }
    }
  })
  @ApiResponse({ 
    status: 403, 
    description: 'No autorizado - Se requiere rol ADMIN',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'No autorizado - Se requiere rol ADMIN' }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'No autorizado - Token JWT inválido o ausente',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Datos de entrada inválidos',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Datos de entrada inválidos' },
        details: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', example: 'amount' },
              message: { type: 'string', example: 'El monto debe ser un número' }
            }
          }
        }
      }
    }
  })
  update(@Param('id') id: string, @Body() updateCashMovementDto: UpdateCashMovementDto, @Req() req: any) {
    return this.cashMovementService.update(id, updateCashMovementDto, req.user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Eliminar movimiento',
    description: 'Elimina un movimiento del sistema. Requiere rol ADMIN. Esta acción es irreversible.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'ID del movimiento a eliminar',
    example: 'd4e5f6a7-b8c9-0123-def0-456789012345'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Movimiento eliminado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'd4e5f6a7-b8c9-0123-def0-456789012345' },
        cashSessionId: { type: 'string', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
        amount: { type: 'number', example: 100.50 },
        type: { type: 'string', enum: ['INCOME', 'EXPENSE'], example: 'INCOME' },
        description: { type: 'string', example: 'Venta de productos varios' },
        deletedAt: { type: 'string', format: 'date-time', description: 'Fecha de eliminación' },
        message: { type: 'string', example: 'Movimiento eliminado exitosamente' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Movimiento no encontrado',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Movimiento no encontrado' }
      }
    }
  })
  @ApiResponse({ 
    status: 403, 
    description: 'No autorizado - Se requiere rol ADMIN',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'No autorizado - Se requiere rol ADMIN' }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'No autorizado - Token JWT inválido o ausente',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.cashMovementService.remove(id, req.user);
  }
}
