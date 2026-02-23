import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { AuthModule } from '../auth/auth.module';
import { SupabaseStorageService } from '../common/utility/supabase-storage.util';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [AuthModule, ConfigModule],
  controllers: [TenantController],
  providers: [TenantService, PrismaService, SupabaseStorageService],
})
export class TenantModule {}
