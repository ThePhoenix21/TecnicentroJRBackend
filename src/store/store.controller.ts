import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

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
  @ApiOperation({
    summary: 'Obtener todas las tiendas',
    description: 'Obtiene una lista de todas las tiendas registradas en el sistema'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de tiendas obtenida exitosamente'
  })
  findAll() {
    return this.storeService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener tienda por ID',
    description: 'Obtiene los detalles de una tienda específica por su ID'
  })
  @ApiResponse({ status: 200, description: 'Tienda encontrada exitosamente' })
  @ApiResponse({ status: 404, description: 'Tienda no encontrada' })
  findOne(@Param('id') id: string) {
    return this.storeService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Actualizar tienda',
    description: 'Actualiza los datos de una tienda existente. Requiere rol ADMIN'
  })
  @ApiResponse({ status: 200, description: 'Tienda actualizada exitosamente' })
  @ApiResponse({ status: 404, description: 'Tienda no encontrada' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  update(@Param('id') id: string, @Body() updateStoreDto: UpdateStoreDto) {
    return this.storeService.update(id, updateStoreDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Eliminar tienda',
    description: 'Elimina una tienda del sistema. Requiere rol ADMIN'
  })
  @ApiResponse({ status: 200, description: 'Tienda eliminada exitosamente' })
  @ApiResponse({ status: 404, description: 'Tienda no encontrada' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  remove(@Param('id') id: string) {
    return this.storeService.remove(id);
  }
}
