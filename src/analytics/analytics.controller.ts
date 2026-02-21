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

  @Get('overview')
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 3600 }],
  })
  @RequireTenantFeatures(TenantFeature.CASH)
  @ApiOperation({
    summary: 'Resumen analitico para dashboard con graficas',
    description:
      'Entrega KPIs y bloques para graficos en un rango de fechas, con filtros opcionales por tienda y comparacion de periodos.',
  })
  @ApiQuery({ name: 'from', required: true, example: '2025-01-01' })
  @ApiQuery({ name: 'to', required: true, example: '2025-01-31' })
  @ApiQuery({ name: 'timeZone', required: false, example: 'America/Lima' })
  @ApiQuery({ name: 'storeId', required: false, example: 'uuid-store' })
  @ApiQuery({ name: 'compareFrom', required: false, example: '2024-12-01' })
  @ApiQuery({ name: 'compareTo', required: false, example: '2024-12-31' })
  @ApiResponse({ status: 200, description: 'Resumen analitico del dashboard' })
  async getOverview(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('timeZone') timeZone?: string,
    @Query('storeId') storeId?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
  ) {
    return this.analyticsService.getOverview(req.user, from, to, timeZone, storeId, compareFrom, compareTo);
  }

  @Get('income-timeseries')
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 3600 }],
  })
  @RequireTenantFeatures(TenantFeature.CASH)
  @ApiOperation({
    summary: 'Serie temporal de ingresos',
    description: 'Serie para graficas de linea/barra de ingresos por dia en el rango seleccionado.',
  })
  @ApiQuery({ name: 'from', required: true, example: '2025-01-01' })
  @ApiQuery({ name: 'to', required: true, example: '2025-01-31' })
  @ApiQuery({ name: 'timeZone', required: false, example: 'America/Lima' })
  @ApiQuery({ name: 'storeId', required: false, example: 'uuid-store' })
  @ApiResponse({ status: 200, description: 'Serie temporal de ingresos' })
  async getIncomeTimeSeries(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('timeZone') timeZone?: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.analyticsService.getIncomeTimeSeries(req.user, from, to, timeZone, storeId);
  }

  @Get('net-profit')
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 3600 }],
  })
  @RequireTenantFeatures(TenantFeature.CASH)
  @ApiOperation({
    summary: 'Ganancia neta (ingresos - egresos)',
    description:
      'Calcula ingresos desde PaymentMethod de ordenes y egresos desde CashMovement (type=EXPENSE), filtrado por tenant y rango de fechas.',
  })
  @ApiQuery({ name: 'from', required: true, example: '2025-01-01' })
  @ApiQuery({ name: 'to', required: true, example: '2025-01-31' })
  @ApiQuery({ name: 'timeZone', required: false, example: 'America/Lima' })
  @ApiQuery({ name: 'storeId', required: false, example: 'uuid-store' })
  @ApiQuery({ name: 'compareFrom', required: false, example: '2024-12-01' })
  @ApiQuery({ name: 'compareTo', required: false, example: '2024-12-31' })
  @ApiResponse({ status: 200, description: 'Analisis de ganancia neta' })
  @ApiResponse({ status: 429, description: 'Demasiadas solicitudes' })
  async getNetProfit(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('timeZone') timeZone?: string,
    @Query('storeId') storeId?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
  ) {
    return this.analyticsService.getNetProfit(req.user, from, to, timeZone, storeId, compareFrom, compareTo);
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
  @ApiQuery({ name: 'storeId', required: false, example: 'uuid-store' })
  @ApiQuery({ name: 'compareFrom', required: false, example: '2024-12-01' })
  @ApiQuery({ name: 'compareTo', required: false, example: '2024-12-31' })
  @ApiResponse({ status: 200, description: 'Analisis de ingresos' })
  @ApiResponse({ status: 429, description: 'Demasiadas solicitudes' })
  async getIncome(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('timeZone') timeZone?: string,
    @Query('storeId') storeId?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
  ) {
    return this.analyticsService.getIncome(req.user, from, to, timeZone, storeId, compareFrom, compareTo);
  }

  @Get('payment-methods-summary')
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 100, windowSeconds: 3600 }],
    cooldownSeconds: 600,
  })
  @RequireTenantFeatures(TenantFeature.CASH)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Resumen de metodos de pago en un rango de fechas',
  })
  @ApiQuery({ name: 'from', required: true, example: '2025-01-01' })
  @ApiQuery({ name: 'to', required: true, example: '2025-01-31' })
  @ApiQuery({ name: 'timeZone', required: false, example: 'America/Lima' })
  @ApiQuery({ name: 'storeId', required: false, example: 'uuid-store' })
  @ApiResponse({ status: 200, description: 'Resumen de metodos de pago' })
  @ApiResponse({ status: 429, description: 'Demasiadas solicitudes' })
  async getPaymentMethodsSummary(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('timeZone') timeZone?: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.analyticsService.getPaymentMethodsSummary(req.user, from, to, timeZone, storeId);
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
  @ApiQuery({ name: 'storeId', required: false, example: 'uuid-store' })
  @ApiQuery({ name: 'compareFrom', required: false, example: '2024-12-01' })
  @ApiQuery({ name: 'compareTo', required: false, example: '2024-12-31' })
  @ApiResponse({ status: 200, description: 'Analisis de egresos' })
  @ApiResponse({ status: 429, description: 'Demasiadas solicitudes' })
  async getExpenses(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('timeZone') timeZone?: string,
    @Query('storeId') storeId?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
  ) {
    return this.analyticsService.getExpenses(req.user, from, to, timeZone, storeId, compareFrom, compareTo);
  }
}
