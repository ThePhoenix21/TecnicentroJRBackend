import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { BulkChangeEmployedStatusDto } from './dto/bulk-change-employed-status.dto';
import { UpdateEmployedDto } from './dto/update-employed.dto';
import { ChangeEmployedStatusDto } from './dto/change-employed-status.dto';
import { ReassignEmployedDto } from './dto/reassign-employed.dto';
import { ListEmployedDto } from './dto/list-employed.dto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import * as path from 'path';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';

@ApiTags('Empleados')
@ApiBearerAuth('JWT-auth')
@Controller('employed')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployedController {
  constructor(private readonly employedService: EmployedService) {}

  private parseAndValidatePayload(payload: any): CreateEmployedDto {
    let parsed: any = payload;
    if (typeof payload === 'string') {
      try {
        parsed = JSON.parse(payload);
      } catch {
        throw new BadRequestException('payload debe ser un JSON válido');
      }
    }

    const dto = plainToInstance(CreateEmployedDto, parsed);
    const errors = validateSync(dto as any, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      throw new BadRequestException('payload inválido');
    }

    return dto;
  }

  private validateDocuments(files: Array<Express.Multer.File>) {
    const maxFiles = 6;
    const maxPerFile = 10 * 1024 * 1024;
    const maxTotal = 40 * 1024 * 1024;

    if (!files || files.length === 0) return;

    if (files.length > maxFiles) {
      throw new BadRequestException(`Máximo ${maxFiles} archivos`);
    }

    const allowed = new Map<string, Set<string>>([
      ['application/pdf', new Set(['.pdf'])],
      ['image/jpeg', new Set(['.jpg', '.jpeg'])],
      ['image/png', new Set(['.png'])],
      ['image/webp', new Set(['.webp'])],
      ['application/msword', new Set(['.doc'])],
      ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', new Set(['.docx'])],
      ['application/zip', new Set(['.zip'])],
      ['text/plain', new Set(['.txt'])],
    ]);

    let totalSize = 0;
    for (const f of files) {
      totalSize += f.size ?? 0;
      if ((f.size ?? 0) > maxPerFile) {
        throw new BadRequestException('Archivo excede el tamaño máximo de 10MB');
      }

      const ext = path.extname(f.originalname || '').toLowerCase();
      const exts = allowed.get(f.mimetype);
      if (!exts || !exts.has(ext)) {
        throw new BadRequestException('Formato inválido para documentos');
      }
    }

    if (totalSize > maxTotal) {
      throw new BadRequestException('Tamaño total excede 40MB');
    }
  }

  @Post()
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_EMPLOYEES)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 30, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Crear empleado (con documentos opcionales)' })
  @UseInterceptors(
    FilesInterceptor('documents', 6, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async create(
    @Req() req: Request & { user: { userId: string; email: string; role: string; tenantId?: string } },
    @Body('payload') payload: any,
    @UploadedFiles() documents: Array<Express.Multer.File>,
  ) {
    const dto = this.parseAndValidatePayload(payload);
    this.validateDocuments(documents || []);

    return this.employedService.createWithDocuments(dto as any, documents as any, req.user as any);
  }

  @Get()
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_EMPLOYEES)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 120, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Listar empleados' })
  async list(@Req() req: Request & { user: any }, @Query() query: ListEmployedDto) {
    return this.employedService.list(query, req.user);
  }

  @Get('lookup')
  @Roles(Role.ADMIN, Role.USER)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 120, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Lookup de empleados (id, nombres)' })
  async lookup(@Req() req: Request & { user: any }) {
    return this.employedService.lookup(req.user);
  }

  @Get('lookup-position')
  @Roles(Role.ADMIN, Role.USER)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 120, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Lookup de cargos de empleados' })
  async lookupPositions(@Req() req: Request & { user: any }) {
    return this.employedService.lookupPositions(req.user);
  }

  @Get('lookup-status')
  @Roles(Role.ADMIN, Role.USER)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 120, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Lookup de estados de empleados' })
  async lookupStatus() {
    return this.employedService.lookupStatus();
  }

  @Get('deleted')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_EMPLOYEES)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Listar empleados eliminados (deletedAt != null)' })
  async listDeleted(@Req() req: Request & { user: any }) {
    return this.employedService.listDeleted(req.user);
  }

  @Post('bulk/status')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_EMPLOYEES)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 10, windowSeconds: 60 }],
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cambiar estado de empleados en grupo',
    description: 'Aplica un status a una lista de empleados del tenant. Si el status es INACTIVE se cierra el historial abierto con updatedByUserId.',
  })
  @ApiBody({ type: BulkChangeEmployedStatusDto })
  async bulkChangeStatus(
    @Req() req: Request & { user: any },
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: BulkChangeEmployedStatusDto,
  ) {
    return this.employedService.bulkChangeStatus(dto, req.user);
  }

  @Get(':id/simple')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_EMPLOYEES)
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
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_EMPLOYEES)
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
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_EMPLOYEES)
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
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_EMPLOYEES, PERMISSIONS.RECREATE_EMPLOYEE)
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
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_EMPLOYEES)
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
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_EMPLOYEES)
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
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_EMPLOYEES)
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
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_EMPLOYEES)
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
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_EMPLOYEES)
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

  @Delete(':id')
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.MANAGE_EMPLOYEES)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 10, windowSeconds: 60 }],
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar empleado (soft delete)',
    description: 'Marca el empleado como eliminado (deletedAt) y cierra su historial laboral si está abierto.',
  })
  @ApiParam({ name: 'id' })
  @ApiBody({
    type: ChangeEmployedStatusDto,
    description: 'Razón opcional de la eliminación',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Empleado eliminado correctamente' })
  @ApiResponse({ status: 404, description: 'Empleado no encontrado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  async softDelete(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto?: ChangeEmployedStatusDto,
  ) {
    return this.employedService.softDelete(id, dto?.reason, req.user);
  }
}
