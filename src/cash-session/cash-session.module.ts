import { Module } from '@nestjs/common';
import { CashSessionService } from './cash-session.service';
import { CashSessionController } from './cash-session.controller';

@Module({
  controllers: [CashSessionController],
  providers: [CashSessionService],
})
export class CashSessionModule {}
