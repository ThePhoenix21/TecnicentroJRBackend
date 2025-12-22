import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { UtilityModule } from './common/utility/utility.module';
import { ClientModule } from './client/client.module';
import { OrderModule } from './order/order.module';
import { ProductModule } from './product/product.module';
import { ServiceModule } from './service/service.module';
import { ImageModule } from './image/image.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
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
    PrismaModule,
    AuthModule,
    UsersModule,
    ClientModule,
    OrderModule,
    ProductModule,
    ServiceModule,
    ImageModule,
    MaintenanceModule,
    StoreModule,
    CashSessionModule,
    CashMovementModule,
    ReceiptModule,
    InventoryCountModule,
    InventoryMovementModule,
    DashboardModule,
    TenantModule,
    AnalyticsModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: TenantFeaturesGuard,
    },
  ],
})
export class AppModule {}