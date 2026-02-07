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
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { StoreProductService } from './store-product.service';
import { CreateStoreProductDto } from './dto/create-store-product.dto';
import { UpdateStoreProductDto } from './dto/update-store-product.dto';
import { StoreProduct } from './entities/store-product.entity';
import { TenantFeature } from '@prisma/client';
import { ListStoreProductsDto } from './dto/list-store-products.dto';
import { ListStoreProductsResponseDto } from './dto/list-store-products-response.dto';
import { StoreProductDetailDto } from './dto/store-product-detail.dto';

@ApiTags('Productos en Tienda')
@RequireTenantFeatures(TenantFeature.INVENTORY)
@Controller('store/products')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class StoreProductController {
  constructor(private readonly storeProductService: StoreProductService) {}

  @Get('list')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_INVENTORY)
  @ApiOperation({ summary: 'Listar productos de una tienda (paginado)' })
  list(@Query() query: ListStoreProductsDto, @Req() req: any): Promise<ListStoreProductsResponseDto> {
    return this.storeProductService.list(query, req.user);
  }

  @Post('create')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_PRODUCTS)
  @ApiOperation({ summary: 'Agregar producto a todas las tiendas' })
  async create(
    @Req() req: any,
    @Body() createStoreProductDto: CreateStoreProductDto,
  ): Promise<StoreProduct[]> {
    const userId = req.user?.userId || req.user?.id;
    const tenantId = req.user?.tenantId;
    const userPermissions: string[] = req.user?.permissions || [];
    const canManagePrices = userPermissions.includes(PERMISSIONS.MANAGE_PRICES);
    
    if (!userId) {
      throw new Error('No se pudo obtener el ID del usuario del token JWT');
    }

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    // Si se están enviando campos de precio, verificar permiso MANAGE_PRICES
    const touchesPriceFields =
      createStoreProductDto.price !== undefined ||
      createStoreProductDto.basePrice !== undefined ||
      createStoreProductDto.buyCost !== undefined;

    if (touchesPriceFields && !canManagePrices) {
      throw new ForbiddenException('No tienes permisos para establecer precios al crear un producto en tienda');
    }

    return this.storeProductService.create(userId, tenantId, createStoreProductDto);
  }

  @Get('my-products')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_INVENTORY)
  @ApiOperation({ summary: 'Listar productos creados por el usuario autenticado' })
  async findMyProducts(@Req() req: any): Promise<StoreProduct[]> {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId || req.user?.id;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    return this.storeProductService.findByUser(tenantId, userId);
  }

  @Get('store/:storeId')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_INVENTORY)
  @ApiOperation({ summary: 'Listar productos de una tienda específica' })
  async findByStore(
    @Req() req: any,
    @Param('storeId') storeId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search: string = ''
  ): Promise<any> {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    return this.storeProductService.findByStore(tenantId, storeId, Number(page), Number(limit), search);
  }

  @Get('store/:storeId/simple')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_INVENTORY)
  @ApiOperation({ summary: 'Listar productos simples de una tienda' })
  async findByStoreSimple(
    @Req() req: any,
    @Param('storeId') storeId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search: string = ''
  ): Promise<any> {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    return this.storeProductService.findByStoreSimple(tenantId, storeId, Number(page), Number(limit), search);
  }

  @Patch(':id/stock')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Actualizar stock de un producto en tienda' })
  async updateStock(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('stock') stock: number
  ): Promise<StoreProduct> {
    const userId = req.user?.userId || req.user?.id;
    const tenantId = req.user?.tenantId;
    const isAdmin = req.user?.role === Role.ADMIN;
    const userPermissions: string[] = req.user?.permissions || [];

    // ADMIN siempre puede actualizar stock. Para USER, requerimos MANAGE_PRODUCTS.
    const canManageProducts = userPermissions.includes(PERMISSIONS.MANAGE_PRODUCTS);

    if (!isAdmin && !canManageProducts) {
      throw new ForbiddenException('No tienes permisos para modificar el stock de productos');
    }

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }
    
    // Validar que el stock no sea negativo
    if (stock < 0) {
      throw new Error('El stock no puede ser negativo');
    }
    
    // Ya validamos permisos aquí, podemos omitir la restricción de propietario en el servicio.
    return this.storeProductService.updateStock(tenantId, userId, id, stock, isAdmin, true);
  }

  @Get('findOne/:id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_INVENTORY)
  @ApiOperation({ summary: 'Obtener un producto en tienda por ID' })
  async findOne(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StoreProductDetailDto> {  
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    return this.storeProductService.findOneDetail(tenantId, id);
  }

  @Patch('update/:id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Actualizar datos de un producto en tienda' })
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
    const tenantId = req.user?.tenantId;
    const isAdmin = req.user?.role === Role.ADMIN;

    const userPermissions: string[] = req.user?.permissions || [];
    const canManageProducts = userPermissions.includes(PERMISSIONS.MANAGE_PRODUCTS);
    const canManagePrices = userPermissions.includes(PERMISSIONS.MANAGE_PRICES);

    // Debe tener al menos uno de estos permisos para usar este endpoint
    if (!canManageProducts && !canManagePrices) {
      throw new ForbiddenException('Debes tener al menos uno de los permisos MANAGE_PRODUCTS o MANAGE_PRICES para actualizar este producto');
    }

    const touchesCatalogFields =
      updateData.name !== undefined ||
      updateData.description !== undefined;

    const touchesPriceFields =
      updateData.price !== undefined ||
      updateData.basePrice !== undefined ||
      updateData.buyCost !== undefined;

    // Cambios de catálogo requieren MANAGE_PRODUCTS
    if (touchesCatalogFields && !canManageProducts) {
      throw new ForbiddenException('No tienes permisos para modificar datos del catálogo');
    }

    // Cambios de precios requieren MANAGE_PRICES
    if (touchesPriceFields && !canManagePrices) {
      throw new ForbiddenException('No tienes permisos para modificar precios');
    }

    // Ya validamos a nivel de controlador qué campos puede tocar según permisos,
    // por lo que podemos permitir que usuarios con MANAGE_INVENTORY / MANAGE_PRICES
    // actualicen aunque no sean el "propietario" original del storeProduct.
    return this.storeProductService.update(userId, tenantId, id, updateData, isAdmin, true);
  }

  @Delete('remove/:id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_INVENTORY)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un producto de una tienda' })
  async remove(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const userId = req.user?.userId || req.user?.id;
    const tenantId = req.user?.tenantId;
    const isAdmin = req.user?.role === Role.ADMIN;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }
    
    return this.storeProductService.remove(tenantId, userId, id, isAdmin);
  }
}
