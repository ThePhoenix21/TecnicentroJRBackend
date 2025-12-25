import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { TenantFeature } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';

@ApiTags('Analytics')
@ApiBearerAuth('JWT-auth')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('net-profit')
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 3600 }],
  })
  @RequireTenantFeatures(TenantFeature.CASH)
  @ApiOperation({
    summary: 'Ganancia neta (ingresos - egresos)',
    description:
      'Calcula ingresos desde PaymentMethod de órdenes y egresos desde CashMovement (type=EXPENSE), filtrado por tenant y rango de fechas.',
  })
  @ApiQuery({ name: 'from', required: true, example: '2025-01-01' })
  @ApiQuery({ name: 'to', required: true, example: '2025-01-31' })
  @ApiQuery({ name: 'timeZone', required: false, example: 'America/Lima' })
  @ApiResponse({ status: 200, description: 'Análisis de ganancia neta' })
  @ApiResponse({ status: 429, description: 'Demasiadas solicitudes' })
  async getNetProfit(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('timeZone') timeZone?: string,
  ) {
    return this.analyticsService.getNetProfit(req.user, from, to, timeZone);
  }

  @Get('income')
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 3600 }],
  })
  @RequireTenantFeatures(TenantFeature.CASH)
  @ApiOperation({
    summary: 'Ingresos (productos/servicios) y rankings',
    description:
      'Calcula ingresos por productos y servicios en el rango de fechas. Rankings se devuelven solo si el tenant tiene las features PRODUCTS y/o SERVICES.',
  })
  @ApiQuery({ name: 'from', required: true, example: '2025-01-01' })
  @ApiQuery({ name: 'to', required: true, example: '2025-01-31' })
  @ApiQuery({ name: 'timeZone', required: false, example: 'America/Lima' })
  @ApiResponse({ status: 200, description: 'Análisis de ingresos' })
  @ApiResponse({ status: 429, description: 'Demasiadas solicitudes' })
  async getIncome(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('timeZone') timeZone?: string,
  ) {
    return this.analyticsService.getIncome(req.user, from, to, timeZone);
  }

  @Get('payment-methods-summary')
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 30, windowSeconds: 3600 }],
  })
  @RequireTenantFeatures(TenantFeature.CASH)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Resumen de métodos de pago en un rango de fechas',
  })
  @ApiQuery({ name: 'from', required: true, example: '2025-01-01' })
  @ApiQuery({ name: 'to', required: true, example: '2025-01-31' })
  @ApiQuery({ name: 'timeZone', required: false, example: 'America/Lima' })
  @ApiResponse({ status: 200, description: 'Resumen de métodos de pago' })
  @ApiResponse({ status: 429, description: 'Demasiadas solicitudes' })
  async getPaymentMethodsSummary(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('timeZone') timeZone?: string,
  ) {
    return this.analyticsService.getPaymentMethodsSummary(req.user, from, to, timeZone);
  }

  @Get('expenses')
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 3600 }],
  })
  @RequireTenantFeatures(TenantFeature.CASH)
  @ApiOperation({
    summary: 'Egresos',
    description:
      'Obtiene egresos desde CashMovement (type=EXPENSE), filtrado por tenant y rango de fechas.',
  })
  @ApiQuery({ name: 'from', required: true, example: '2025-01-01' })
  @ApiQuery({ name: 'to', required: true, example: '2025-01-31' })
  @ApiQuery({ name: 'timeZone', required: false, example: 'America/Lima' })
  @ApiResponse({ status: 200, description: 'Análisis de egresos' })
  @ApiResponse({ status: 429, description: 'Demasiadas solicitudes' })
  async getExpenses(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('timeZone') timeZone?: string,
  ) {
    return this.analyticsService.getExpenses(req.user, from, to, timeZone);
  }
}
