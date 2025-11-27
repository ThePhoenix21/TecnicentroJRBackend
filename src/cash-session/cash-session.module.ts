import { Module } from '@nestjs/common';
import { CashSessionService } from './cash-session.service';
import { CashSessionController } from './cash-session.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { CashMovementModule } from '../cash-movement/cash-movement.module';

@Module({
  imports: [AuthModule, CashMovementModule],
  controllers: [CashSessionController],
  providers: [CashSessionService, PrismaService],
})
export class CashSessionModule {}
