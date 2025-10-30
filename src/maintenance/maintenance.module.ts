import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
