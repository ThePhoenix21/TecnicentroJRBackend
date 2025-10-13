import { Module } from '@nestjs/common';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';
import { TemplateService } from './template.service';

@Module({
  controllers: [MailController],
  providers: [MailService, TemplateService],
  exports: [MailService],
})
export class MailModule {}
