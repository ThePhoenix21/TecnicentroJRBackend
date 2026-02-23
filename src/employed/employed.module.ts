import { Module } from '@nestjs/common';
import { EmployedController } from './employed.controller';
import { EmployedService } from './employed.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UtilityModule } from '../common/utility/utility.module';

@Module({
  imports: [PrismaModule, UtilityModule],
  controllers: [EmployedController],
  providers: [EmployedService],
  exports: [EmployedService],
})
export class EmployedModule {}
