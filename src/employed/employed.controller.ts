import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { EmployedService } from './employed.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { CreateEmployedDto } from './dto/create-employed.dto';
import { UpdateEmployedDto } from './dto/update-employed.dto';
import { ChangeEmployedStatusDto } from './dto/change-employed-status.dto';
import { ReassignEmployedDto } from './dto/reassign-employed.dto';

@ApiTags('Empleados')
@ApiBearerAuth('JWT-auth')
@Controller('employed')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployedController {
  constructor(private readonly employedService: EmployedService) {}

  @Post()
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 30, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Crear empleado' })
  @ApiBody({ type: CreateEmployedDto })
  @ApiResponse({ status: 201 })
  async create(
    @Req() req: Request & { user: { userId: string; email: string; role: string; tenantId?: string } },
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateEmployedDto,
  ) {
    return this.employedService.create(dto, req.user as any);
  }

  @Get()
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 120, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Listar empleados' })
  async list(@Req() req: Request & { user: any }) {
    return this.employedService.list(req.user);
  }

  @Get('deleted')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Listar empleados eliminados (deletedAt != null)' })
  async listDeleted(@Req() req: Request & { user: any }) {
    return this.employedService.listDeleted(req.user);
  }

  @Get(':id/simple')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 120, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Obtener empleado simple' })
  @ApiParam({ name: 'id' })
  async getSimple(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.employedService.getSimple(id, req.user);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 120, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Obtener empleado completo' })
  @ApiParam({ name: 'id' })
  async getFull(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.employedService.getFull(id, req.user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Editar empleado (no permite editar DNI)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdateEmployedDto })
  async update(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: UpdateEmployedDto,
  ) {
    return this.employedService.update(id, dto, req.user);
  }

  @Post(':id/recreate')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 10, windowSeconds: 60 }],
  })
  @ApiOperation({
    summary: 'Corregir DNI (soft delete + crear nuevo empleado)',
    description: 'No se puede editar DNI; para corregirlo se inactiva el empleado y se crea uno nuevo.',
  })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: CreateEmployedDto })
  async softDeleteAndRecreate(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateEmployedDto,
  ) {
    return this.employedService.softDeleteAndRecreate(id, dto, req.user);
  }

  @Post(':id/documents')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 10, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Guardar documentos del empleado en Supabase' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id' })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiResponse({ status: 200 })
  async uploadDocuments(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg']);

    const invalid = (files || []).find((f) => !allowed.has(f.mimetype));
    if (invalid) {
      throw new BadRequestException('Formato inválido. Solo se permiten: pdf, png, jpg');
    }

    return this.employedService.uploadDocuments(id, files as any, req.user);
  }

  @Post(':id/terminate')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 20, windowSeconds: 60 }],
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terminar contrato (despedir)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: ChangeEmployedStatusDto })
  async terminate(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: ChangeEmployedStatusDto,
  ) {
    return this.employedService.terminate(id, dto.reason, req.user);
  }

  @Post(':id/suspend')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 30, windowSeconds: 60 }],
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender empleado' })
  @ApiParam({ name: 'id' })
  async suspend(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.employedService.suspend(id, req.user);
  }

  @Post(':id/activate')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 30, windowSeconds: 60 }],
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar / reactivar empleado' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: ChangeEmployedStatusDto })
  async activate(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: ChangeEmployedStatusDto,
  ) {
    return this.employedService.activate(id, dto.reason, req.user);
  }

  @Post(':id/reassign')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 30, windowSeconds: 60 }],
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reasignar empleado a tienda o almacén' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: ReassignEmployedDto })
  async reassign(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: ReassignEmployedDto,
  ) {
    return this.employedService.reassign(id, dto, req.user);
  }
}
