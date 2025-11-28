import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  HttpStatus,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ProductService } from './product.service';
import { CreateCatalogProductDto } from './dto/create-catalog-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CatalogProduct } from './entities/catalog-product.entity';

@ApiTags('Catálogo de Productos')
@ApiBearerAuth('JWT')
@Controller('catalog/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'No autorizado' })
@ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No tiene permisos' })
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post('create')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Crear un nuevo producto en el catálogo maestro',
    description: 'Crea un nuevo producto en el catálogo maestro que estará disponible para ser agregado a cualquier tienda. Este producto contiene la información básica como nombre, descripción, precios de referencia y costos.'
  })
  @ApiBody({
    type: CreateCatalogProductDto,
    description: 'Datos del producto a crear en el catálogo maestro',
    examples: {
      ejemploMotor: {
        summary: 'Producto para automóvil',
        value: {
          name: 'Aceite de Motor 10W40',
          description: 'Aceite sintético de alta calidad para motores de gasolina y diésel',
          basePrice: 29.99,
          buyCost: 20.50
        }
      },
      ejemploAccesorio: {
        summary: 'Accesorio para vehículo',
        value: {
          name: 'Filtro de Aire Universal',
          description: 'Filtro de aire de alto flujo para vehículos de pasajeros',
          basePrice: 15.99,
          buyCost: 8.75
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'El producto del catálogo ha sido creado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        name: { type: 'string', example: 'Aceite de Motor 10W40' },
        description: { type: 'string', nullable: true, example: 'Aceite sintético de alta calidad' },
        basePrice: { type: 'number', nullable: true, example: 29.99 },
        buyCost: { type: 'number', nullable: true, example: 20.50 },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        createdById: { type: 'string', nullable: true, example: 'user-id-123' },
        createdBy: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Datos de entrada inválidos o producto duplicado',
    schema: {
      example: {
        statusCode: 400,
        message: 'El nombre del producto ya está en uso',
        error: 'Bad Request'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado - Token JWT inválido o ausente'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para crear productos'
  })
  async create(
    @Req() req: any,
    @Body() createCatalogProductDto: CreateCatalogProductDto,
  ): Promise<CatalogProduct> {
    const userId = req.user?.userId || req.user?.id;
    
    if (!userId) {
      throw new Error('No se pudo obtener el ID del usuario del token JWT');
    }
    
    // Agregar el ID del usuario que crea el producto
    createCatalogProductDto.createdById = userId;
    
    return this.productService.create(createCatalogProductDto);
  }

  @Get('all')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Obtener todos los productos del catálogo',
    description: 'Retorna una lista completa de todos los productos registrados en el catálogo maestro, ordenados por fecha de creación descendente. Incluye información del usuario que creó cada producto.'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de productos del catálogo obtenida exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          name: { type: 'string', example: 'Aceite de Motor 10W40' },
          description: { type: 'string', nullable: true, example: 'Aceite sintético de alta calidad' },
          basePrice: { type: 'number', nullable: true, example: 29.99 },
          buyCost: { type: 'number', nullable: true, example: 20.50 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          createdById: { type: 'string', nullable: true, example: 'user-id-123' },
          createdBy: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string' },
              name: { type: 'string', example: 'Juan Pérez' },
              email: { type: 'string', example: 'juan@ejemplo.com' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado - Token JWT inválido o ausente'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para ver productos'
  })
  async findAll(): Promise<CatalogProduct[]> {
    return this.productService.findAll();
  }

  @Get('findOne/:id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Obtener un producto del catálogo por ID',
    description: 'Retorna la información detallada de un producto específico del catálogo maestro usando su UUID. Incluye información del usuario que lo creó.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'UUID del producto a consultar',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Producto del catálogo encontrado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        name: { type: 'string', example: 'Aceite de Motor 10W40' },
        description: { type: 'string', nullable: true, example: 'Aceite sintético de alta calidad' },
        basePrice: { type: 'number', nullable: true, example: 29.99 },
        buyCost: { type: 'number', nullable: true, example: 20.50 },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        createdById: { type: 'string', nullable: true, example: 'user-id-123' },
        createdBy: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Juan Pérez' },
            email: { type: 'string', example: 'juan@ejemplo.com' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Producto del catálogo no encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Producto del catálogo con ID 123e4567-e89b-12d3-a456-426614174000 no encontrado',
        error: 'Not Found'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'ID del producto inválido - debe ser un UUID válido'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado - Token JWT inválido o ausente'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para ver productos'
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CatalogProduct> {  
    return this.productService.findOne(id);
  }

  @Patch('update/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ 
    summary: 'Actualizar un producto del catálogo',
    description: 'Actualiza la información de un producto existente en el catálogo maestro. Solo los administradores pueden realizar esta operación. Los cambios afectan al producto base pero no a los inventarios existentes en las tiendas.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'UUID del producto a actualizar',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @ApiBody({ 
    type: UpdateProductDto,
    description: 'Datos del producto a actualizar',
    examples: {
      actualizarNombre: {
        summary: 'Actualizar nombre y descripción',
        value: {
          name: 'Aceite de Motor 10W40 Premium',
          description: 'Aceite sintético de alta calidad con aditivos de protección'
        }
      },
      actualizarPrecios: {
        summary: 'Actualizar precios de referencia',
        value: {
          basePrice: 32.99,
          buyCost: 22.75
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Producto del catálogo actualizado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        name: { type: 'string', example: 'Aceite de Motor 10W40 Premium' },
        description: { type: 'string', nullable: true, example: 'Aceite sintético con aditivos' },
        basePrice: { type: 'number', nullable: true, example: 32.99 },
        buyCost: { type: 'number', nullable: true, example: 22.75 },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        createdById: { type: 'string', nullable: true, example: 'user-id-123' },
        createdBy: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Juan Pérez' },
            email: { type: 'string', example: 'juan@ejemplo.com' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Producto del catálogo no encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Producto del catálogo con ID 123e4567-e89b-12d3-a456-426614174000 no encontrado',
        error: 'Not Found'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Datos de entrada inválidos o ID de producto inválido'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado - Token JWT inválido o ausente'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos de administrador para actualizar productos'
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductDto: UpdateProductDto,
  ): Promise<CatalogProduct> {
    return this.productService.update(id, updateProductDto);
  }

  @Delete('remove/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ 
    summary: 'Eliminar un producto del catálogo (Soft Delete)',
    description: 'Marca un producto del catálogo como eliminado (soft delete). Esta operación solo puede realizarla un administrador. El producto no se elimina físicamente, solo se marca como eliminado y ya no aparecerá en las consultas normales.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'UUID del producto a marcar como eliminado',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Producto del catálogo marcado como eliminado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        name: { type: 'string', example: 'Aceite de Motor 10W40' },
        description: { type: 'string', nullable: true, example: 'Aceite sintético de alta calidad' },
        basePrice: { type: 'number', nullable: true, example: 29.99 },
        buyCost: { type: 'number', nullable: true, example: 20.50 },
        isDeleted: { type: 'boolean', example: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        createdById: { type: 'string', nullable: true, example: 'user-id-123' },
        createdBy: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Juan Pérez' },
            email: { type: 'string', example: 'juan@ejemplo.com' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Producto del catálogo no encontrado o ya está eliminado',
    schema: {
      examples: {
        noEncontrado: {
          summary: 'Producto no encontrado',
          value: {
            statusCode: 404,
            message: 'Producto del catálogo con ID 123e4567-e89b-12d3-a456-426614174000 no encontrado',
            error: 'Not Found'
          }
        },
        yaEliminado: {
          summary: 'Producto ya eliminado',
          value: {
            statusCode: 404,
            message: 'Producto del catálogo con ID 123e4567-e89b-12d3-a456-426614174000 ya está eliminado',
            error: 'Not Found'
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'ID del producto inválido'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado - Token JWT inválido o ausente'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos de administrador para eliminar productos'
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CatalogProduct> {
    return this.productService.remove(id);
  }
}
