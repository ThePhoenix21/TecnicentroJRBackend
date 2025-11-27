import { Module } from '@nestjs/common';
import { CashSessionService } from './cash-session.service';
import { CashSessionController } from './cash-session.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [CashSessionController],
  providers: [CashSessionService, PrismaService],
})
export class CashSessionModule {}
