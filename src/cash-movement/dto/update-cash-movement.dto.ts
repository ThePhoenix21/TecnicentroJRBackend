import { PartialType } from '@nestjs/swagger';
import { CreateCashMovementDto } from './create-cash-movement.dto';

export class UpdateCashMovementDto extends PartialType(CreateCashMovementDto) {}
