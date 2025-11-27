import { PartialType } from '@nestjs/swagger';
import { CreateCashSessionDto } from './create-cash-session.dto';

export class UpdateCashSessionDto extends PartialType(CreateCashSessionDto) {}
