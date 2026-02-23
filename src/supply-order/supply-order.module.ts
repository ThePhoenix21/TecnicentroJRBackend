import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { SupplyOrderController } from './supply-order.controller';
import { SupplyOrderService } from './supply-order.service';
import { PdfService } from '../common/pdf/pdf.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '60m' },
    }),
    ConfigModule,
    MailModule,
  ],
  controllers: [SupplyOrderController],
  providers: [SupplyOrderService, PdfService],
  exports: [SupplyOrderService],
})
export class SupplyOrderModule {}
