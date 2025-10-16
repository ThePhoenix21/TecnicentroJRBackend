import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseStorageService } from './supabase-storage.util';

@Module({
  imports: [ConfigModule],
  providers: [SupabaseStorageService],
  exports: [SupabaseStorageService],
})
export class UtilityModule {}
