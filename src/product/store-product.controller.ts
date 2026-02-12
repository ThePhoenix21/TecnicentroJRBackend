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
import { ApiOperation } from '@nestjs/swagger';
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
import { BasePaginationDto } from '../common/dto/base-pagination.dto';

@RequireTenantFeatures(TenantFeature.INVENTORY)
@Controller('store/products')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class StoreProductController {
  constructor(private readonly storeProductService: StoreProductService) {}

  private stripSensitiveFields<T>(value: T, user: any): T {
    const perms: string[] = user?.permissions || [];
    const canViewPrices = perms.includes(PERMISSIONS.VIEW_PRODUCT_PRICES);
    const canViewCost = perms.includes(PERMISSIONS.VIEW_PRODUCT_COST);

    const visit = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      if (!canViewPrices) {
        if ('price' in obj) delete obj.price;
        if ('basePrice' in obj) delete obj.basePrice;
      }

      if (!canViewCost) {
        if ('buyCost' in obj) delete obj.buyCost;
      }

      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (Array.isArray(v)) {
          v.forEach(visit);
        } else if (v && typeof v === 'object') {
          visit(v);
        }
      }
    };

    const clone = JSON.parse(JSON.stringify(value));
    visit(clone);
    return clone;
  }

  @Get('list')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS)
  @ApiOperation({ summary: 'Listar productos en tienda' })
  list(@Query() query: ListStoreProductsDto, @Req() req: any): Promise<ListStoreProductsResponseDto> {
    return this.storeProductService.list(query, req.user).then((res) => this.stripSensitiveFields(res, req.user));
  }

  @Post('create')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.MANAGE_PRODUCTS)
  @ApiOperation({ summary: 'Crear producto en tienda' })
  async create(
    @Req() req: any,
    @Body() createStoreProductDto: CreateStoreProductDto,
  ): Promise<StoreProduct[]> {
    const userId = req.user?.userId || req.user?.id;
    const tenantId = req.user?.tenantId;
    const userPermissions: string[] = req.user?.permissions || [];
    const canManagePrices = userPermissions.includes(PERMISSIONS.MANAGE_PRICES);
    const canViewCost = userPermissions.includes(PERMISSIONS.VIEW_PRODUCT_COST);
    
    if (!userId) {
      throw new Error('No se pudo obtener el ID del usuario del token JWT');
    }

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    // Si se están enviando campos de precio, verificar permiso MANAGE_PRICES
    const touchesAnyPriceFields =
      createStoreProductDto.price !== undefined ||
      createStoreProductDto.basePrice !== undefined;

    const touchesBuyCost = createStoreProductDto.buyCost !== undefined;

    if (touchesAnyPriceFields && !canManagePrices) {
      throw new ForbiddenException('No tienes permisos para establecer precios al crear un producto en tienda');
    }

    if (touchesBuyCost && (!canManagePrices || !canViewCost)) {
      throw new ForbiddenException('No tienes permisos para establecer el costo de compra (buyCost)');
    }

    const res = await this.storeProductService.create(userId, tenantId, createStoreProductDto);
    return this.stripSensitiveFields(res, req.user);
  }

  @Get('lookup')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Lookup de productos en tienda' })
  async lookup(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('storeId') storeId?: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.storeProductService.lookup(req.user, search, storeId);
  }

  @Get('my-products')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS)
  @ApiOperation({ summary: 'Listar mis productos en tienda' })
  async findMyProducts(@Req() req: any): Promise<StoreProduct[]> {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId || req.user?.id;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    const res = await this.storeProductService.findByUser(tenantId, userId);
    return this.stripSensitiveFields(res, req.user);
  }

  @Get('store/:storeId')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Listar productos por tienda' })
  async findByStore(
    @Req() req: any,
    @Param('storeId') storeId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search: string = ''
  ): Promise<any> {
    const perms: string[] = req.user?.permissions || [];
    const canViewProducts = perms.includes(PERMISSIONS.VIEW_PRODUCTS);
    const canViewInventory = perms.includes(PERMISSIONS.VIEW_INVENTORY);

    if (!canViewProducts && !canViewInventory) {
      throw new ForbiddenException('No tienes permisos para ver productos de la tienda');
    }

    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    const res = await this.storeProductService.findByStore(tenantId, storeId, Number(page), Number(limit), search);
    return this.stripSensitiveFields(res, req.user);
  }

  @Get('store/:storeId/simple')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS)
  @ApiOperation({ summary: 'Listar productos simples por tienda' })
  async findByStoreSimple(
    @Req() req: any,
    @Param('storeId') storeId: string,
    @Query() pagination: BasePaginationDto,
    @Query('search') search: string = ''
  ): Promise<any> {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    const res = await this.storeProductService.findByStoreSimple(tenantId, storeId, pagination.page, pagination.pageSize, search);
    return this.stripSensitiveFields(res, req.user);
  }

  @Patch(':id/stock')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.MANAGE_PRODUCTS)
  @ApiOperation({ summary: 'Actualizar stock en tienda' })
  async updateStock(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('stock') stock: number
  ): Promise<StoreProduct> {
    const userId = req.user?.userId || req.user?.id;
    const tenantId = req.user?.tenantId;
    const isAdmin = req.user?.role === Role.ADMIN;
    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }
    
    // Validar que el stock no sea negativo
    if (stock < 0) {
      throw new Error('El stock no puede ser negativo');
    }
    
    // Ya validamos permisos aquí, podemos omitir la restricción de propietario en el servicio.
    const res = await this.storeProductService.updateStock(tenantId, userId, id, stock, isAdmin, true);
    return this.stripSensitiveFields(res, req.user);
  }

  @Get('findOne/:id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS)
  @ApiOperation({ summary: 'Obtener producto en tienda' })
  async findOne(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StoreProductDetailDto> {  
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    const res = await this.storeProductService.findOneDetail(tenantId, id);
    return this.stripSensitiveFields(res, req.user);
  }

  @Patch('update/:id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS)
  @ApiOperation({ summary: 'Actualizar producto en tienda' })
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
    const canViewCost = userPermissions.includes(PERMISSIONS.VIEW_PRODUCT_COST);

    // Debe tener al menos uno de estos permisos para usar este endpoint
    if (!canManageProducts && !canManagePrices) {
      throw new ForbiddenException('Debes tener al menos uno de los permisos MANAGE_PRODUCTS o MANAGE_PRICES para actualizar este producto');
    }

    const touchesCatalogFields =
      updateData.name !== undefined ||
      updateData.description !== undefined;

    const touchesAnyPriceFields =
      updateData.price !== undefined ||
      updateData.basePrice !== undefined;

    const touchesBuyCost = updateData.buyCost !== undefined;
    const touchesStockThreshold = updateData.stockThreshold !== undefined;

    // Cambios de catálogo requieren MANAGE_PRODUCTS
    if (touchesCatalogFields && !canManageProducts) {
      throw new ForbiddenException('No tienes permisos para modificar datos del catálogo');
    }

    if (touchesStockThreshold && !canManageProducts) {
      throw new ForbiddenException('No tienes permisos para modificar el stock mínimo');
    }

    // Cambios de precios requieren MANAGE_PRICES
    if (touchesAnyPriceFields && !canManagePrices) {
      throw new ForbiddenException('No tienes permisos para modificar precios');
    }

    if (touchesBuyCost && (!canManagePrices || !canViewCost)) {
      throw new ForbiddenException('No tienes permisos para modificar el costo de compra (buyCost)');
    }

    // Ya validamos a nivel de controlador qué campos puede tocar según permisos,
    // por lo que podemos permitir que usuarios con MANAGE_INVENTORY / MANAGE_PRICES
    // actualicen aunque no sean el "propietario" original del storeProduct.
    const res = await this.storeProductService.update(
      userId,
      tenantId,
      id,
      updateData,
      isAdmin,
      true,
      {
        allowCatalogFields: canManageProducts,
        allowCatalogPriceFields: canManagePrices,
      },
    );
    return this.stripSensitiveFields(res, req.user);
  }

  @Delete('remove/:id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.DELETE_PRODUCTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar producto en tienda' })
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
