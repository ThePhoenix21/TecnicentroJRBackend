import { Body, Controller, Get, HttpStatus, Patch, Post, Req, Res, UnauthorizedException, UseGuards, UseInterceptors, UploadedFile, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantFeature } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/enums/role.enum';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';

@ApiTags('tenants')
@Controller('tenant')
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly authService: AuthService,
  ) {}

  @Get('debug-features')
  @ApiOperation({ summary: 'Debug TenantFeature enum' })
  debugFeatures() {
    return {
      features: Object.values(TenantFeature),
      count: Object.keys(TenantFeature).length
    };
  }

  @Get('features')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Obtener features del tenant actual',
    description: 'Retorna las features habilitadas para el tenant del usuario autenticado (solo requiere JWT).',
  })
  async getTenantFeatures(@Req() req: any) {
    const tenantId: string | undefined = req.user?.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant no encontrado en el token');
    }

    return this.tenantService.getFeatures(tenantId);
  }

  @Get('default-service')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Obtener defaultService del tenant actual',
    description: 'Retorna únicamente el campo defaultService del tenant del usuario autenticado (solo requiere JWT).',
  })
  async getDefaultService(@Req() req: any) {
    const tenantId: string | undefined = req.user?.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant no encontrado en el token');
    }

    return this.tenantService.getDefaultService(tenantId);
  }

  @Get('stores/count')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Obtener cantidad de tiendas del tenant actual',
    description: 'Devuelve el número de tiendas asociadas al tenant del usuario autenticado (solo requiere JWT).',
  })
  async countStores(@Req() req: any) {
    const tenantId: string | undefined = req.user?.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant no encontrado en el token');
    }

    return this.tenantService.countStores(tenantId);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear tenant (empresa) con admin y tienda inicial',
    description: 'Crea un tenant con admin y tienda inicial. Si no envías currency, se usa PEN.',
  })
  @UseInterceptors(FileInterceptor('logo', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        return cb(new Error('Solo se permiten archivos de imagen (jpg, jpeg, png, gif, webp)'), false);
      }
      cb(null, true);
    },
  }))
  async create(
    @Req() req: any,
    @Res() res: Response,
    @Body() createTenantDto: CreateTenantDto,
    @UploadedFile() logo?: Express.Multer.File,
  ) {
    const { tenant, adminUser, store } = await this.tenantService.create(createTenantDto, logo);

    const ipAddress =
      req.ip ||
      req.headers['x-forwarded-for'] ||
      req.connection?.remoteAddress;

    const loginResult = await this.authService.login(
      { ...adminUser, tenantId: tenant.id },
      ipAddress,
      res,
    );

    return res.status(HttpStatus.CREATED).json({
      ...loginResult,
      tenant,
      store,
    });
  }

  @Patch('logo')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.CHANGE_STORE_LOGO)
  @ApiOperation({ summary: 'Actualizar logo del tenant' })
  @UseInterceptors(FileInterceptor('logo', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        return cb(new Error('Solo se permiten archivos de imagen (jpg, jpeg, png, gif, webp)'), false);
      }
      cb(null, true);
    },
  }))
  async updateLogo(
    @Req() req: any,
    @UploadedFile() logo?: Express.Multer.File,
  ) {
    if (!logo) {
      throw new BadRequestException('El archivo del logo es obligatorio');
    }

    const tenantId: string | undefined = req.user?.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant no encontrado en el token');
    }

    return this.tenantService.updateLogo(tenantId, logo);
  }

  @Patch('disable')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Desactivar tenant actual' })
  async disableTenant(@Req() req: any) {
    const tenantId: string | undefined = req.user?.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant no encontrado en el token');
    }

    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Solo administradores pueden desactivar el tenant');
    }

    return this.tenantService.disableTenant(tenantId);
  }

  @Patch('enable')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Activar tenant actual' })
  async enableTenant(@Req() req: any) {
    const tenantId: string | undefined = req.user?.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant no encontrado en el token');
    }

    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Solo administradores pueden activar el tenant');
    }

    return this.tenantService.enableTenant(tenantId);
  }
}
