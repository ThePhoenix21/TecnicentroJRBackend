import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseStorageService } from '../common/utility/supabase-storage.util';

@Module({
  imports: [ConfigModule],
  providers: [SupabaseStorageService],
  exports: [SupabaseStorageService],
})
export class SupabaseStorageModule {}
