import { Module } from '@nestjs/common';
import { EmployeePositionController } from './employee-position.controller';
import { EmployeePositionService } from './employee-position.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EmployeePositionController],
  providers: [EmployeePositionService],
  exports: [EmployeePositionService],
})
export class EmployeePositionModule {}
