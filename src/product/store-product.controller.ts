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
import { StoreProductService } from './store-product.service';
import { CreateStoreProductDto } from './dto/create-store-product.dto';
import { UpdateStoreProductDto } from './dto/update-store-product.dto';
import { StoreProduct } from './entities/store-product.entity';

@ApiTags('Productos en Tienda')
@ApiBearerAuth('JWT')
@Controller('store/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ 
  status: HttpStatus.UNAUTHORIZED, 
  description: 'No autorizado - Token JWT inválido o ausente',
  schema: {
    example: {
      statusCode: 401,
      message: 'Unauthorized',
      error: 'Unauthorized'
    }
  }
})
@ApiResponse({ 
  status: HttpStatus.FORBIDDEN, 
  description: 'No tiene permisos para acceder a esta funcionalidad',
  schema: {
    example: {
      statusCode: 403,
      message: 'Forbidden resource',
      error: 'Forbidden'
    }
  }
})
export class StoreProductController {
  constructor(private readonly storeProductService: StoreProductService) {}

  @Post('create')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Agregar un producto del catálogo a una tienda',
    description: 'Agrega un producto existente del catálogo maestro al inventario de una tienda específica. Cada tienda puede tener diferentes precios, stock y umbrales de alerta para el mismo producto.'
  })
  @ApiBody({
    type: CreateStoreProductDto,
    description: 'Datos para agregar el producto a la tienda',
    examples: {
      ejemploTienda1: {
        summary: 'Agregar producto con precio estándar',
        value: {
          productId: '123e4567-e89b-12d3-a456-426614174000',
          storeId: '456e7890-e12b-34d5-a678-426614174000',
          price: 29.99,
          stock: 50,
          stockThreshold: 5
        }
      },
      ejemploTienda2: {
        summary: 'Agregar mismo producto con precio diferente',
        value: {
          productId: '123e4567-e89b-12d3-a456-426614174000',
          storeId: '789e0123-e45b-67c8-a901-426614174000',
          price: 32.99,
          stock: 30,
          stockThreshold: 3
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Producto agregado a la tienda exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'store-product-id-123' },
        price: { type: 'number', example: 29.99 },
        stock: { type: 'number', example: 50 },
        stockThreshold: { type: 'number', example: 5 },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        productId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Aceite de Motor 10W40' },
            description: { type: 'string', nullable: true },
            basePrice: { type: 'number', nullable: true },
            buyCost: { type: 'number', nullable: true }
          }
        },
        storeId: { type: 'string', example: '456e7890-e12b-34d5-a678-426614174000' },
        store: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Tecnicentro JR - Sucursal Central' },
            address: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true }
          }
        },
        userId: { type: 'string', example: 'user-id-123' },
        user: {
          type: 'object',
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
    status: HttpStatus.BAD_REQUEST,
    description: 'Datos de entrada inválidos o producto ya existe en la tienda',
    schema: {
      examples: {
        productoExistente: {
          summary: 'Producto ya existe en la tienda',
          value: {
            statusCode: 403,
            message: 'Este producto ya está registrado en esta tienda',
            error: 'Forbidden'
          }
        },
        datosInvalidos: {
          summary: 'Datos inválidos',
          value: {
            statusCode: 400,
            message: 'El productId debe ser un UUID válido',
            error: 'Bad Request'
          }
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Producto del catálogo o tienda no encontrados',
    schema: {
      example: {
        statusCode: 404,
        message: 'Producto del catálogo con ID 123e4567-e89b-12d3-a456-426614174000 no encontrado',
        error: 'Not Found'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tienes permisos para agregar productos a esta tienda'
  })
  async create(
    @Req() req: any,
    @Body() createStoreProductDto: CreateStoreProductDto,
  ): Promise<StoreProduct> {
    const userId = req.user?.userId || req.user?.id;
    
    if (!userId) {
      throw new Error('No se pudo obtener el ID del usuario del token JWT');
    }
    
    return this.storeProductService.create(userId, createStoreProductDto);
  }

  @Get('my-products')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Obtener los productos del usuario autenticado en sus tiendas',
    description: 'Retorna una lista de todos los productos que el usuario autenticado ha agregado a las tiendas donde tiene acceso. Incluye información completa del producto del catálogo y de la tienda.'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de productos del usuario obtenida exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'store-product-id-123' },
          price: { type: 'number', example: 29.99 },
          stock: { type: 'number', example: 50 },
          stockThreshold: { type: 'number', example: 5 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          productId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          product: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string', example: 'Aceite de Motor 10W40' },
              description: { type: 'string', nullable: true },
              basePrice: { type: 'number', nullable: true },
              buyCost: { type: 'number', nullable: true }
            }
          },
          storeId: { type: 'string', example: '456e7890-e12b-34d5-a678-426614174000' },
          store: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string', example: 'Tecnicentro JR - Sucursal Central' },
              address: { type: 'string', nullable: true },
              phone: { type: 'string', nullable: true }
            }
          },
          userId: { type: 'string', example: 'user-id-123' },
          user: {
            type: 'object',
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
  async findMyProducts(@Req() req: any): Promise<StoreProduct[]> {
    return this.storeProductService.findByUser(req.user.userId);
  }

  @Get('store/:storeId')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Obtener todos los productos de una tienda específica',
    description: 'Retorna una lista completa de todos los productos disponibles en el inventario de una tienda específica. Incluye información del producto del catálogo y datos específicos de la tienda como precio y stock.'
  })
  @ApiParam({ 
    name: 'storeId', 
    description: 'UUID de la tienda a consultar',
    example: '456e7890-e12b-34d5-a678-426614174000'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de productos de la tienda obtenida exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'store-product-id-123' },
          price: { type: 'number', example: 29.99 },
          stock: { type: 'number', example: 50 },
          stockThreshold: { type: 'number', example: 5 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          productId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          product: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string', example: 'Aceite de Motor 10W40' },
              description: { type: 'string', nullable: true },
              basePrice: { type: 'number', nullable: true },
              buyCost: { type: 'number', nullable: true }
            }
          },
          storeId: { type: 'string', example: '456e7890-e12b-34d5-a678-426614174000' },
          store: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string', example: 'Tecnicentro JR - Sucursal Central' },
              address: { type: 'string', nullable: true },
              phone: { type: 'string', nullable: true }
            }
          },
          userId: { type: 'string', example: 'user-id-123' },
          user: {
            type: 'object',
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
    status: HttpStatus.NOT_FOUND,
    description: 'Tienda no encontrada',
    schema: {
      example: {
        statusCode: 404,
        message: 'Tienda con ID 456e7890-e12b-34d5-a678-426614174000 no encontrada',
        error: 'Not Found'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'ID de tienda inválido - debe ser un UUID válido'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado - Token JWT inválido o ausente'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para ver productos de esta tienda'
  })
  async findByStore(@Param('storeId') storeId: string): Promise<StoreProduct[]> {
    return this.storeProductService.findByStore(storeId);
  }

  @Get('findOne/:id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Obtener un producto en tienda por ID',
    description: 'Retorna la información detallada de un producto específico en una tienda usando su UUID. Incluye información completa del producto del catálogo, datos de la tienda y del usuario responsable.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'UUID del producto en tienda a consultar',
    example: 'store-product-id-123'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Producto en tienda encontrado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'store-product-id-123' },
        price: { type: 'number', example: 29.99 },
        stock: { type: 'number', example: 50 },
        stockThreshold: { type: 'number', example: 5 },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        productId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Aceite de Motor 10W40' },
            description: { type: 'string', nullable: true },
            basePrice: { type: 'number', nullable: true },
            buyCost: { type: 'number', nullable: true }
          }
        },
        storeId: { type: 'string', example: '456e7890-e12b-34d5-a678-426614174000' },
        store: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Tecnicentro JR - Sucursal Central' },
            address: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true }
          }
        },
        userId: { type: 'string', example: 'user-id-123' },
        user: {
          type: 'object',
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
    description: 'Producto en tienda no encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Producto en tienda con ID store-product-id-123 no encontrado',
        error: 'Not Found'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'ID del producto en tienda inválido - debe ser un UUID válido'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado - Token JWT inválido o ausente'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos para ver este producto'
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StoreProduct> {  
    return this.storeProductService.findOne(id);
  }

  @Patch('update/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ 
    summary: 'Actualizar un producto en tienda',
    description: 'Actualiza la información de un producto existente en una tienda. Solo los administradores pueden realizar esta operación. Permite modificar precio, stock y umbrales de alerta del producto en esa tienda específica.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'UUID del producto en tienda a actualizar',
    example: 'store-product-id-123'
  })
  @ApiBody({ 
    type: UpdateStoreProductDto,
    description: 'Datos del producto en tienda a actualizar',
    examples: {
      actualizarPrecio: {
        summary: 'Actualizar precio y stock',
        value: {
          price: 32.99,
          stock: 75,
          stockThreshold: 10
        }
      },
      reabastecer: {
        summary: 'Reabastecer inventario',
        value: {
          stock: 100,
          stockThreshold: 5
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Producto en tienda actualizado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'store-product-id-123' },
        price: { type: 'number', example: 32.99 },
        stock: { type: 'number', example: 75 },
        stockThreshold: { type: 'number', example: 10 },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        productId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
        product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Aceite de Motor 10W40' },
            description: { type: 'string', nullable: true },
            basePrice: { type: 'number', nullable: true },
            buyCost: { type: 'number', nullable: true }
          }
        },
        storeId: { type: 'string', example: '456e7890-e12b-34d5-a678-426614174000' },
        store: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Tecnicentro JR - Sucursal Central' },
            address: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true }
          }
        },
        userId: { type: 'string', example: 'user-id-123' },
        user: {
          type: 'object',
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
    description: 'Producto en tienda no encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Producto en tienda con ID store-product-id-123 no encontrado',
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
    description: 'No tiene permisos de administrador o no es el propietario del producto'
  })
  async update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateData: UpdateStoreProductDto,
  ): Promise<StoreProduct> {
    const userId = req.user?.userId || req.user?.id;
    const isAdmin = req.user?.role === Role.ADMIN;
    
    return this.storeProductService.update(userId, id, updateData, isAdmin);
  }

  @Delete('remove/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ 
    summary: 'Eliminar un producto de una tienda',
    description: 'Elimina permanentemente un producto del inventario de una tienda. Esta operación solo puede realizarla un administrador. **ADVERTENCIA**: Si existen órdenes que referencian este producto en tienda, estas referencias se volverán inválidas.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'UUID del producto en tienda a eliminar',
    example: 'store-product-id-123'
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Producto en tienda eliminado exitosamente (sin contenido en respuesta)'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Producto en tienda no encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Producto en tienda con ID store-product-id-123 no encontrado',
        error: 'Not Found'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'ID del producto en tienda inválido'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'No autorizado - Token JWT inválido o ausente'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'No tiene permisos de administrador o no es el propietario del producto',
    schema: {
      example: {
        statusCode: 403,
        message: 'No tienes permiso para eliminar este producto',
        error: 'Forbidden'
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'No se puede eliminar el producto porque está siendo utilizado en órdenes',
    schema: {
      example: {
        statusCode: 409,
        message: 'No se puede eliminar el producto porque existen órdenes asociadas',
        error: 'Conflict'
      }
    }
  })
  async remove(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const userId = req.user?.userId || req.user?.id;
    const isAdmin = req.user?.role === Role.ADMIN;
    
    return this.storeProductService.remove(userId, id, isAdmin);
  }
}
