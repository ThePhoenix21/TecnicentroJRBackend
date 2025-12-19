import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TenantController],
  providers: [TenantService, PrismaService],
})
export class TenantModule {}
