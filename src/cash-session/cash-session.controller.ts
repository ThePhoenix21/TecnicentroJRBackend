import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CashSessionService } from './cash-session.service';
import { CreateCashSessionDto } from './dto/create-cash-session.dto';
import { UpdateCashSessionDto } from './dto/update-cash-session.dto';

@Controller('cash-session')
export class CashSessionController {
  constructor(private readonly cashSessionService: CashSessionService) {}

  @Post()
  create(@Body() createCashSessionDto: CreateCashSessionDto) {
    return this.cashSessionService.create(createCashSessionDto);
  }

  @Get()
  findAll() {
    return this.cashSessionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cashSessionService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCashSessionDto: UpdateCashSessionDto) {
    return this.cashSessionService.update(+id, updateCashSessionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cashSessionService.remove(+id);
  }
}
