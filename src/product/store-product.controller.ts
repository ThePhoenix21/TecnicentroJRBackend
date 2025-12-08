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
  Query,
  ValidationPipe,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { StoreProductService } from './store-product.service';
import { CreateStoreProductDto } from './dto/create-store-product.dto';
import { UpdateStoreProductDto } from './dto/update-store-product.dto';
import { StoreProduct } from './entities/store-product.entity';

@ApiTags('Productos en Tienda')
@ApiBearerAuth('JWT')
@Controller('store/products')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
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
  @RequirePermissions(PERMISSIONS.MANAGE_PRODUCTS)
  @ApiOperation({ 
    summary: 'Agregar producto a todas las tiendas',
    description: 'Agrega un producto al inventario de todas las tiendas del sistema. La tienda especificada recibirá el producto con el precio y stock indicados, mientras que las demás tiendas recibirán el mismo producto con precio=0 y stock=0. Puede usar un producto existente del catálogo o crear uno nuevo. Requiere que el usuario tenga acceso a la tienda especificada.'
  })
  @ApiBody({
    type: CreateStoreProductDto,
    description: 'Datos para agregar producto a tienda (existente o nuevo)',
    examples: {
      productoExistente: {
        summary: 'Agregar producto existente del catálogo',
        description: 'Usa un producto que ya existe en el catálogo maestro',
        value: {
          productId: '123e4567-e89b-12d3-a456-426614174000',
          createNewProduct: false,
          storeId: '456e7890-e12b-34d5-a678-426614174000',
          price: 29.99,
          stock: 50,
          stockThreshold: 5
        }
      },
      productoNuevo: {
        summary: 'Crear nuevo producto y agregar a tienda',
        description: 'Crea un nuevo producto en el catálogo y lo agrega directamente a la tienda',
        value: {
          createNewProduct: true,
          name: 'Filtro de Aceite Premium',
          description: 'Filtro de aceite de alta eficiencia para vehículos modernos',
          basePrice: 15.99,
          buyCost: 8.75,
          storeId: '456e7890-e12b-34d5-a678-426614174000',
          price: 18.99,
          stock: 25,
          stockThreshold: 3
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Producto agregado a todas las tiendas exitosamente',
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
    status: HttpStatus.BAD_REQUEST,
    description: 'Datos de entrada inválidos o producto ya existe en todas las tiendas',
    schema: {
      examples: {
        productoExistenteTodasTiendas: {
          summary: 'Producto ya existe en todas las tiendas',
          value: {
            statusCode: 403,
            message: 'Este producto ya está registrado en todas las tiendas',
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
  ): Promise<StoreProduct[]> {
    const userId = req.user?.userId || req.user?.id;
    const userPermissions: string[] = req.user?.permissions || [];
    const canManagePrices = userPermissions.includes(PERMISSIONS.MANAGE_PRICES);
    
    if (!userId) {
      throw new Error('No se pudo obtener el ID del usuario del token JWT');
    }

    // Si se están enviando campos de precio, verificar permiso MANAGE_PRICES
    const touchesPriceFields =
      createStoreProductDto.price !== undefined ||
      createStoreProductDto.basePrice !== undefined ||
      createStoreProductDto.buyCost !== undefined;

    if (touchesPriceFields && !canManagePrices) {
      throw new ForbiddenException('No tienes permisos para establecer precios al crear un producto en tienda');
    }

    return this.storeProductService.create(userId, createStoreProductDto);
  }

  @Get('my-products')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_INVENTORY)
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
  @RequirePermissions(PERMISSIONS.VIEW_INVENTORY)
  @ApiOperation({ 
    summary: 'Obtener todos los productos de una tienda específica',
    description: 'Retorna una lista paginada de todos los productos disponibles en el inventario de una tienda específica. Incluye información del producto del catálogo y datos específicos de la tienda como precio y stock. Soporta búsqueda por nombre de producto.'
  })
  @ApiParam({ 
    name: 'storeId', 
    description: 'UUID de la tienda a consultar',
    example: '456e7890-e12b-34d5-a678-426614174000'
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
  @ApiQuery({ 
    name: 'search', 
    required: false, 
    description: 'Buscar productos por nombre', 
    example: 'aceite' 
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de productos de la tienda obtenida exitosamente',
    schema: {
      type: 'object',
      properties: {
        data: {
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
        },
        total: { type: 'number', example: 45, description: 'Total de productos' },
        page: { type: 'number', example: 1, description: 'Página actual' },
        limit: { type: 'number', example: 20, description: 'Resultados por página' },
        totalPages: { type: 'number', example: 3, description: 'Total de páginas' }
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
  async findByStore(
    @Param('storeId') storeId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search: string = ''
  ): Promise<any> {
    return this.storeProductService.findByStore(storeId, page, limit, search);
  }

  @Patch(':id/stock')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Actualizar stock de un producto en tienda',
    description: 'Actualiza únicamente el stock de un producto específico en una tienda. Permite reabastecer inventario rápidamente. Requiere permisos de administrador o ser el propietario del producto.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'UUID del producto en tienda a actualizar stock',
    example: 'store-product-id-123'
  })
  @ApiBody({ 
    description: 'Nuevo stock del producto',
    examples: {
      reabastecer: {
        summary: 'Reabastecer inventario',
        value: {
          stock: 100
        }
      },
      reducirStock: {
        summary: 'Reducir stock por venta',
        value: {
          stock: 25
        }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Stock actualizado exitosamente',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'store-product-id-123' },
        price: { type: 'number', example: 29.99 },
        stock: { type: 'number', example: 100 },
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
    description: 'Datos de entrada inválidos o stock negativo',
    schema: {
      examples: {
        stockNegativo: {
          summary: 'Stock negativo no permitido',
          value: {
            statusCode: 400,
            message: 'El stock no puede ser negativo',
            error: 'Bad Request'
          }
        },
        datosInvalidos: {
          summary: 'Datos inválidos',
          value: {
            statusCode: 400,
            message: 'El stock debe ser un número válido',
            error: 'Bad Request'
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
    description: 'No tiene permisos para actualizar este producto',
    schema: {
      example: {
        statusCode: 403,
        message: 'No tienes permisos para actualizar este producto',
        error: 'Forbidden'
      }
    }
  })
  async updateStock(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('stock') stock: number
  ): Promise<StoreProduct> {
    const userId = req.user?.userId || req.user?.id;
    const isAdmin = req.user?.role === Role.ADMIN;
    const userPermissions: string[] = req.user?.permissions || [];

    // ADMIN siempre puede actualizar stock. Para USER, requerimos MANAGE_PRODUCTS.
    const canManageProducts = userPermissions.includes(PERMISSIONS.MANAGE_PRODUCTS);

    if (!isAdmin && !canManageProducts) {
      throw new ForbiddenException('No tienes permisos para modificar el stock de productos');
    }
    
    // Validar que el stock no sea negativo
    if (stock < 0) {
      throw new Error('El stock no puede ser negativo');
    }
    
    // Ya validamos permisos aquí, podemos omitir la restricción de propietario en el servicio.
    return this.storeProductService.updateStock(userId, id, stock, isAdmin, true);
  }

  @Get('findOne/:id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_INVENTORY)
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
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ 
    summary: 'Actualizar un producto en tienda',
    description: 'Actualiza la información de un producto existente en una tienda. Los usuarios pueden actualizar sus propios productos (solo campos de tienda) y los administradores pueden actualizar cualquier producto (incluyendo campos del catálogo). **Permisos:**\n\n**Usuarios (USER):** Solo pueden modificar:\n- price: Precio de venta en la tienda\n- stock: Cantidad en inventario\n- stockThreshold: Umbral de alerta\n\n**Administradores (ADMIN):** Pueden modificar todo lo anterior más:\n- name: Nombre del producto (catálogo)\n- description: Descripción del producto (catálogo)\n- buyCost: Costo de compra (catálogo)\n- basePrice: Precio base de referencia (catálogo)'
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
      usuarioNormal: {
        summary: 'Usuario actualizando campos de tienda',
        description: 'Un usuario normal solo puede modificar precio, stock y umbral de alerta',
        value: {
          price: 32.99,
          stock: 75,
          stockThreshold: 10
        }
      },
      administradorTienda: {
        summary: 'Administrador actualizando campos de tienda',
        description: 'Un administrador puede modificar los campos de la tienda',
        value: {
          price: 35.99,
          stock: 100,
          stockThreshold: 15
        }
      },
      administradorCatalogo: {
        summary: 'Administrador actualizando catálogo y tienda',
        description: 'Un administrador puede modificar tanto el catálogo como los campos de la tienda',
        value: {
          name: 'Aceite de Motor 10W40 Premium',
          description: 'Aceite sintético de alta calidad con aditivos de protección',
          buyCost: 22.75,
          basePrice: 32.99,
          price: 35.99,
          stock: 100,
          stockThreshold: 15
        }
      },
      soloCatalogo: {
        summary: 'Administrador actualizando solo catálogo',
        description: 'Un administrador puede modificar solo los campos del catálogo',
        value: {
          name: 'Filtro de Aceite Premium Plus',
          description: 'Filtro de aceite de mayor duración y eficiencia',
          buyCost: 12.50,
          basePrice: 18.99
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
    description: 'No tiene permisos de administrador o no es el propietario del producto',
    schema: {
      examples: {
        noPropietario: {
          summary: 'Usuario no es propietario del producto',
          value: {
            statusCode: 403,
            message: 'No tienes permiso para actualizar este producto',
            error: 'Forbidden'
          }
        },
        camposAdmin: {
          summary: 'Usuario intentando modificar campos de administrador',
          value: {
            statusCode: 403,
            message: 'Solo los administradores pueden modificar los campos: name, description',
            error: 'Forbidden'
          }
        }
      }
    }
  })
  async update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe({ 
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true 
    })) updateData: UpdateStoreProductDto,
  ): Promise<StoreProduct> {
    const userId = req.user?.userId || req.user?.id;
    const isAdmin = req.user?.role === Role.ADMIN;

    const userPermissions: string[] = req.user?.permissions || [];
    const canManageProducts = userPermissions.includes(PERMISSIONS.MANAGE_PRODUCTS);
    const canManagePrices = userPermissions.includes(PERMISSIONS.MANAGE_PRICES);

    // Debe tener al menos uno de estos permisos para usar este endpoint
    if (!canManageProducts && !canManagePrices) {
      throw new ForbiddenException('Debes tener al menos uno de los permisos MANAGE_PRODUCTS o MANAGE_PRICES para actualizar este producto');
    }

    const touchesStockFields =
      updateData.stock !== undefined ||
      updateData.stockThreshold !== undefined;

    const touchesPriceFields =
      updateData.price !== undefined ||
      updateData.basePrice !== undefined ||
      updateData.buyCost !== undefined;

    // Cambios de stock/stockThreshold requieren MANAGE_PRODUCTS
    if (touchesStockFields && !canManageProducts) {
      throw new ForbiddenException('No tienes permisos para modificar el stock de productos');
    }

    // Cambios de precios requieren MANAGE_PRICES
    if (touchesPriceFields && !canManagePrices) {
      throw new ForbiddenException('No tienes permisos para modificar precios');
    }

    // Ya validamos a nivel de controlador qué campos puede tocar según permisos,
    // por lo que podemos permitir que usuarios con MANAGE_INVENTORY / MANAGE_PRICES
    // actualicen aunque no sean el "propietario" original del storeProduct.
    return this.storeProductService.update(userId, id, updateData, isAdmin, true);
  }

  @Delete('remove/:id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_INVENTORY)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ 
    summary: 'Eliminar un producto de una tienda',
    description: 'Elimina permanentemente un producto del inventario de una tienda. Los usuarios pueden eliminar sus propios productos y los administradores pueden eliminar cualquier producto. **ADVERTENCIA**: Si existen órdenes que referencian este producto en tienda, estas referencias se volverán inválidas.'
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
