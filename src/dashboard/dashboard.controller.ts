import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { TenantFeature } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
@RequireTenantFeatures(TenantFeature.DASHBOARD)
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Roles(Role.USER, Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 120, windowSeconds: 3600 }],
  })
  @ApiOperation({
    summary: 'Resumen del dashboard',
    description: 'Devuelve metricas resumidas del dashboard filtradas por tenant y opcionalmente por tienda/rango.',
  })
  @ApiQuery({ name: 'from', required: false, example: '2025-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2025-01-31' })
  @ApiQuery({ name: 'timeZone', required: false, example: 'America/Lima' })
  @ApiQuery({ name: 'storeId', required: false, example: 'uuid-store' })
  @ApiQuery({ name: 'compareFrom', required: false, example: '2024-12-01' })
  @ApiQuery({ name: 'compareTo', required: false, example: '2024-12-31' })
  @ApiResponse({
    status: 200,
    description: 'Resumen del dashboard obtenido exitosamente',
  })
  async getSummary(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('timeZone') timeZone?: string,
    @Query('storeId') storeId?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
  ) {
    return this.dashboardService.getSummary(req.user, from, to, timeZone, storeId, compareFrom, compareTo);
  }

  @Get('charts')
  @Roles(Role.USER, Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 120, windowSeconds: 3600 }],
  })
  @ApiOperation({
    summary: 'Graficas del dashboard',
    description: 'Entrega datasets listos para charts del dashboard profesional.',
  })
  @ApiQuery({ name: 'from', required: true, example: '2025-01-01' })
  @ApiQuery({ name: 'to', required: true, example: '2025-01-31' })
  @ApiQuery({ name: 'timeZone', required: false, example: 'America/Lima' })
  @ApiQuery({ name: 'storeId', required: false, example: 'uuid-store' })
  @ApiResponse({
    status: 200,
    description: 'Graficas del dashboard obtenidas exitosamente',
  })
  async getCharts(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('timeZone') timeZone?: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.dashboardService.getCharts(req.user, from, to, timeZone, storeId);
  }
}
