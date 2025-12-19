import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Stores')
@Controller('store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Crear nueva tienda',
    description: 'Crea una nueva tienda en el sistema. Requiere autenticación JWT con rol ADMIN y credenciales válidas del administrador (email y password).'
  })
  @ApiBody({
    description: 'Datos de la tienda y credenciales del administrador',
    type: CreateStoreDto,
    examples: {
      example: {
        value: {
          name: 'Tienda Principal',
          address: 'Av. Principal 123',
          phone: '+123456789',
          adminEmail: 'admin@ejemplo.com',
          adminPassword: 'contraseñaSegura123'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Tienda creada exitosamente',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Tienda creada exitosamente' },
        store: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            address: { type: 'string' },
            phone: { type: 'string' },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' },
            createdById: { type: 'string' },
            createdBy: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string' }
              }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 401, description: 'Credenciales de administrador inválidas' })
  @ApiResponse({ status: 403, description: 'No autorizado - se requiere rol ADMIN' })
  @ApiResponse({ status: 409, description: 'Ya existe una tienda con ese nombre' })
  create(@Body() createStoreDto: CreateStoreDto) {
    return this.storeService.create(createStoreDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtener todas las tiendas',
    description: 'Obtiene una lista de tiendas del tenant del usuario autenticado con información del creador'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de tiendas obtenida exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
          name: { type: 'string', example: 'Tienda Principal' },
          address: { type: 'string', example: 'Av. Principal 123' },
          phone: { type: 'string', example: '+123456789' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          createdById: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' },
          createdBy: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' },
              name: { type: 'string', example: 'Administrador' },
              email: { type: 'string', example: 'admin@ejemplo.com' },
              role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'ADMIN' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'No autorizado - token inválido o expirado' })
  findAll(@Req() req: any) {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    return this.storeService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener tienda por ID',
    description: 'Obtiene los detalles de una tienda específica por su ID incluyendo información del creador'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Tienda encontrada exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
        name: { type: 'string', example: 'Tienda Principal' },
        address: { type: 'string', example: 'Av. Principal 123' },
        phone: { type: 'string', example: '+123456789' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        createdById: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' },
        createdBy: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' },
            name: { type: 'string', example: 'Administrador' },
            email: { type: 'string', example: 'admin@ejemplo.com' },
            role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'ADMIN' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Tienda no encontrada' })
  findOne(@Param('id') id: string) {
    return this.storeService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Actualizar tienda',
    description: 'Actualiza los datos de una tienda existente. Requiere rol ADMIN. Solo se actualizarán los campos proporcionados en el body.'
  })
  @ApiBody({
    description: 'Datos parciales de la tienda a actualizar. Todos los campos son opcionales.',
    type: UpdateStoreDto,
    examples: {
      updateName: {
        summary: 'Actualizar nombre de la tienda',
        value: {
          name: 'Tienda Actualizada'
        }
      },
      updateAddress: {
        summary: 'Actualizar dirección y teléfono',
        value: {
          address: 'Calle Nueva 456',
          phone: '+987654321'
        }
      },
      updateAll: {
        summary: 'Actualizar todos los campos',
        value: {
          name: 'Tienda Completa',
          address: 'Av. Central 789',
          phone: '+555123456'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Tienda actualizada exitosamente',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Tienda actualizada exitosamente' },
        store: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' },
            name: { type: 'string', example: 'Tienda Actualizada' },
            address: { type: 'string', example: 'Calle Nueva 456' },
            phone: { type: 'string', example: '+987654321' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            createdById: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440002' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 404, description: 'Tienda no encontrada' })
  @ApiResponse({ status: 403, description: 'No autorizado - se requiere rol ADMIN' })
  update(@Param('id') id: string, @Body() updateStoreDto: UpdateStoreDto) {
    return this.storeService.update(id, updateStoreDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Eliminar tienda',
    description: 'Elimina una tienda del sistema permanentemente. Esta acción no se puede deshacer. Requiere rol ADMIN.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Tienda eliminada exitosamente',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Tienda eliminada exitosamente' },
        storeId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440001' }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Tienda no encontrada' })
  @ApiResponse({ status: 403, description: 'No autorizado - se requiere rol ADMIN' })
  @ApiResponse({ status: 409, description: 'No se puede eliminar la tienda - tiene dependencias activas' })
  remove(@Param('id') id: string) {
    return this.storeService.remove(id);
  }
}
