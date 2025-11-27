import { Injectable } from '@nestjs/common';
import { CreateCashSessionDto } from './dto/create-cash-session.dto';
import { UpdateCashSessionDto } from './dto/update-cash-session.dto';

@Injectable()
export class CashSessionService {
  create(createCashSessionDto: CreateCashSessionDto) {
    return 'This action adds a new cashSession';
  }

  findAll() {
    return `This action returns all cashSession`;
  }

  findOne(id: number) {
    return `This action returns a #${id} cashSession`;
  }

  update(id: number, updateCashSessionDto: UpdateCashSessionDto) {
    return `This action updates a #${id} cashSession`;
  }

  remove(id: number) {
    return `This action removes a #${id} cashSession`;
  }
}
