import { Module } from '@nestjs/common';
import { ApiMetricsController } from './api-metrics.controller';
import { ApiMetricsInterceptor } from './api-metrics.interceptor';
import { ApiMetricsService } from './api-metrics.service';
import { BasicAuthGuard } from './basic-auth.guard';

@Module({
  controllers: [ApiMetricsController],
  providers: [ApiMetricsService, ApiMetricsInterceptor, BasicAuthGuard],
  exports: [ApiMetricsService, ApiMetricsInterceptor],
})
export class ApiMetricsModule {}
