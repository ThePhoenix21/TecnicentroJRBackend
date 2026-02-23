import {
  Body,
  Controller,
  Delete,
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
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Role } from '../auth/enums/role.enum';
import { PERMISSIONS } from '../auth/permissions';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SupportService } from './support.service';

@ApiTags('Support')
@ApiBearerAuth('JWT-auth')
@Controller('support')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('tickets')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_SUPPORT)
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
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_SUPPORT)
  @ApiOperation({ summary: 'Listar tickets del usuario autenticado' })
  @ApiResponse({ status: 200 })
  async listMyTickets(@Req() req: Request & { user: any }) {
    return this.supportService.listMyTickets(req.user);
  }

  @Get('tickets/:id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_SUPPORT)
  @ApiOperation({ summary: 'Obtener detalles de un ticket por ID' })
  @ApiResponse({ status: 200 })
  async getTicketById(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.supportService.getTicketById(id, req.user);
  }

  @Get('tickets/user/:userId')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_SUPPORT)
  @ApiOperation({ summary: 'Listar tickets por ID de usuario (administrativo)' })
  @ApiResponse({ status: 200 })
  async listTicketsByUserId(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.supportService.listTicketsByUserId(userId);
  }

  @Get('tickets/all')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_SUPPORT)
  @ApiOperation({ summary: 'Listar todos los tickets de todos los usuarios (administrativo)' })
  @ApiResponse({ status: 200 })
  async listAllTickets() {
    return this.supportService.listAllTickets();
  }

  @Delete('tickets/:id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_SUPPORT)
  @ApiOperation({ summary: 'Cancelar ticket de soporte (cambiar status a CANCELLED)' })
  @ApiResponse({ status: 200 })
  async cancelTicket(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.supportService.cancelTicket(id, req.user);
  }
}
