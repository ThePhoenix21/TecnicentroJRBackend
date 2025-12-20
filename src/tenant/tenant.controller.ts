import { Body, Controller, Get, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('tenants')
@Controller('tenant')
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly authService: AuthService,
  ) {}

  @Get('features')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Obtener features del tenant actual',
    description: 'Retorna las features habilitadas para el tenant del usuario autenticado (solo requiere JWT).',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Features obtenidas exitosamente' })
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
  @ApiResponse({ status: HttpStatus.OK, description: 'Default service obtenido exitosamente' })
  async getDefaultService(@Req() req: any) {
    const tenantId: string | undefined = req.user?.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant no encontrado en el token');
    }

    return this.tenantService.getDefaultService(tenantId);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear tenant (empresa) con admin y tienda inicial',
    description:
      'Crea un tenant, un usuario ADMIN asociado al tenant y una tienda genérica inicial (con relación StoreUsers y StoreProducts).',
  })
  @ApiBody({ type: CreateTenantDto })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Tenant creado exitosamente' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Conflicto: RUC/email/username ya existen' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Datos de entrada inválidos' })
  async create(@Req() req: any, @Res() res: Response, @Body() createTenantDto: CreateTenantDto) {
    const { tenant, adminUser, store } = await this.tenantService.create(createTenantDto);

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
}
