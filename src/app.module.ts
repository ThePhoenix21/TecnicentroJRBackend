import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductModule } from './product/product.module';
import { ServiceModule } from './service/service.module';
import { SaleModule } from './sale/sale.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule, 
    UsersModule, 
    ProductModule, 
    ServiceModule, 
    SaleModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}