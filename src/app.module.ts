import { Module } from '@nestjs/common';
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
import { SaleModule } from './sale/sale.module';

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
    SaleModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}