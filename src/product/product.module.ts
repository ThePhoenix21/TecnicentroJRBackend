import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { StoreProductService } from './store-product.service';
import { StoreProductController } from './store-product.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '60m' },
    }),
    ConfigModule,
  ],
  controllers: [ProductController, StoreProductController],
  providers: [ProductService, StoreProductService],
  exports: [ProductService, StoreProductService],
})
export class ProductModule {}
