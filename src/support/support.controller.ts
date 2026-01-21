import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SupportService } from './support.service';

@ApiTags('Support')
@ApiBearerAuth('JWT-auth')
@Controller('support')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('tickets')
  @ApiOperation({ summary: 'Crear ticket de soporte técnico' })
  @ApiResponse({ status: 201 })
  async createTicket(
    @Req() req: Request & { user: any },
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateSupportTicketDto,
  ) {
    return this.supportService.createTicket(dto, req.user);
  }

  @Get('tickets')
  @ApiOperation({ summary: 'Listar tickets del usuario autenticado' })
  @ApiResponse({ status: 200 })
  async listMyTickets(@Req() req: Request & { user: any }) {
    return this.supportService.listMyTickets(req.user);
  }

  @Get('tickets/user/:userId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Listar tickets por ID de usuario (administrativo)' })
  @ApiResponse({ status: 200 })
  async listTicketsByUserId(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.supportService.listTicketsByUserId(userId);
  }
}
