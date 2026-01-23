import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { SupplyOrderController } from './supply-order.controller';
import { SupplyOrderService } from './supply-order.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '60m' },
    }),
    ConfigModule,
  ],
  controllers: [SupplyOrderController],
  providers: [SupplyOrderService],
  exports: [SupplyOrderService],
})
export class SupplyOrderModule {}
