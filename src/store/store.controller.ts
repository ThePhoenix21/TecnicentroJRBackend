import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ApiTags } from '@nestjs/swagger';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { TenantFeature } from '@prisma/client';

@ApiTags('Stores')
@Controller('store')
@RequireTenantFeatures(TenantFeature.STORE)
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Post()
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS)
  create(@Body() createStoreDto: CreateStoreDto) {
    return this.storeService.create(createStoreDto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS)
  findAll(@Req() req: any) {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    return this.storeService.findAll(tenantId);
  }

  @Get('simple')
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS)
  findAllSimple(@Req() req: any) {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    return this.storeService.findAllSimple(tenantId);
  }

  @Get('lookup')
  @Roles(Role.ADMIN, Role.USER)
  lookup(@Req() req: any) {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException('TenantId no encontrado en el token');
    }

    return this.storeService.lookup(tenantId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS)
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.storeService.findOne(id, req.user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS)
  update(@Param('id') id: string, @Body() updateStoreDto: UpdateStoreDto, @Req() req: any) {
    return this.storeService.update(id, updateStoreDto, req.user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.DELETE_PRODUCTS)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.storeService.remove(id, req.user);
  }
}
