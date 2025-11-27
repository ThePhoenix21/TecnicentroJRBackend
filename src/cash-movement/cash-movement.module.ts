import { Module } from '@nestjs/common';
import { CashMovementService } from './cash-movement.service';
import { CashMovementController } from './cash-movement.controller';

@Module({
  controllers: [CashMovementController],
  providers: [CashMovementService],
})
export class CashMovementModule {}
