import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { UtilityModule } from './common/utility/utility.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { RateLimitInterceptor } from './common/rate-limit/rate-limit.interceptor';
import { ClientModule } from './client/client.module';
import { OrderModule } from './order/order.module';
import { ProductModule } from './product/product.module';
import { ServiceModule } from './service/service.module';
import { ImageModule } from './image/image.module';
import { StoreModule } from './store/store.module';
import { CashSessionModule } from './cash-session/cash-session.module';
import { CashMovementModule } from './cash-movement/cash-movement.module';
import { ReceiptModule } from './receipt/receipt.module';
import { InventoryCountModule } from './inventory-count/inventory-count.module';
import { InventoryMovementModule } from './inventory-movement/inventory-movement.module';
import { TenantModule } from './tenant/tenant.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TenantFeaturesGuard } from './tenant/guards/tenant-features.guard';
import { AnalyticsModule } from './analytics/analytics.module';
import { ApiMetricsModule } from './common/api-metrics/api-metrics.module';
import { ApiMetricsInterceptor } from './common/api-metrics/api-metrics.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      expandVariables: true,
      cache: true,
    }),
    
    // Asegurarse de que el módulo de utilidades se cargue después de ConfigModule
    // para que las variables de entorno estén disponibles
    UtilityModule,
    RateLimitModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    ClientModule,
    OrderModule,
    ProductModule,
    ServiceModule,
    ImageModule,
    StoreModule,
    CashSessionModule,
    CashMovementModule,
    ReceiptModule,
    InventoryCountModule,
    InventoryMovementModule,
    DashboardModule,
    TenantModule,
    AnalyticsModule,
    ApiMetricsModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: TenantFeaturesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RateLimitInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiMetricsInterceptor,
    },
  ],
})
export class AppModule {}