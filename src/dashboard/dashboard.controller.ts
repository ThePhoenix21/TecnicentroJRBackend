import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
    description: 'Devuelve métricas resumidas del dashboard filtradas por tenant.'
  })
  @ApiResponse({
    status: 200,
    description: 'Resumen del dashboard obtenido exitosamente'
  })
  async getSummary(@Req() req: any) {
    return this.dashboardService.getSummary(req.user);
  }
}
