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
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiOperation,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { Role } from '../auth/enums/role.enum';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { ValidationPipe } from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateCatalogProductDto } from './dto/create-catalog-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CatalogProduct } from './entities/catalog-product.entity';
import { TenantFeature } from '@prisma/client';
import { StoreProductStockDto } from './dto/store-product-stock.dto';
import { AdminCredentialsDto } from './dto/admin-credentials.dto';

@RequireTenantFeatures(TenantFeature.PRODUCTS)
@Controller('catalog/products')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post('create')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.MANAGE_PRODUCTS, PERMISSIONS.MANAGE_PRICES)
  @ApiOperation({ summary: 'Crear producto en catálogo' })
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
    
    return this.productService.create(createCatalogProductDto, req.user);
  }

  @Get('all')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS)
  @ApiOperation({ summary: 'Listar productos de catálogo' })
  async findAll(@Req() req: any): Promise<CatalogProduct[]> {
    return this.productService.findAll(req.user);
  }

  @Get('store-stock')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Stock por tienda' })
  async getStoreStock(
    @Req() req: any,
    @Query('storeId', ParseUUIDPipe) storeId: string,
  ): Promise<StoreProductStockDto[]> {
    const perms: string[] = req.user?.permissions || [];
    const canViewProducts = perms.includes(PERMISSIONS.VIEW_PRODUCTS);
    const canViewInventory = perms.includes(PERMISSIONS.VIEW_INVENTORY);

    if (!canViewProducts && !canViewInventory) {
      throw new ForbiddenException('No tienes permisos para ver el stock por tienda');
    }

    return this.productService.getStoreStock(req.user, storeId);
  }

  @Get('lookup')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.VIEW_INVENTORY)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 200, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Lookup de productos de catálogo' })
  async lookup(
    @Req() req: any,
    @Query('search') search?: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.productService.lookup(req.user, search);
  }

  @Get('findOne/:id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS)
  @ApiOperation({ summary: 'Obtener producto de catálogo por ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ): Promise<CatalogProduct> {  
    return this.productService.findOne(id, req.user);
  }

  @Patch('update/:id')
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.MANAGE_PRODUCTS, PERMISSIONS.MANAGE_PRICES)
  @ApiOperation({ summary: 'Actualizar producto de catálogo' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Req() req: any,
  ): Promise<CatalogProduct> {
    return this.productService.update(id, updateProductDto, req.user);
  }

  @Delete('remove/:id')
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.MANAGE_PRODUCTS)
  @ApiOperation({ summary: 'Eliminar producto de catálogo (registra movimientos de salida en tiendas y almacenes)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() credentials: AdminCredentialsDto,
    @Req() req: any,
  ): Promise<CatalogProduct> {
    return this.productService.remove(id, credentials, req.user);
  }
}
