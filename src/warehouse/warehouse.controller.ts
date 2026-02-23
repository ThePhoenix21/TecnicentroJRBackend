import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Put,
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
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseService } from './warehouse.service';

@ApiTags('Warehouses')
@ApiBearerAuth('JWT-auth')
@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Editar almacén' })
  @ApiResponse({ status: 200 })
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
    dto: UpdateWarehouseDto,
  ) {
    return this.warehouseService.update(id, dto, req.user);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear almacén' })
  @ApiResponse({ status: 201 })
  async create(
    @Req() req: Request & { user: any },
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateWarehouseDto,
  ) {
    return this.warehouseService.create(dto, req.user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar almacén (soft delete)' })
  @ApiResponse({ status: 200 })
  async remove(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.warehouseService.softDelete(id, req.user);
  }

  @Get()
  @ApiOperation({ summary: 'Listar almacenes del tenant' })
  @ApiResponse({ status: 200 })
  async list(@Req() req: Request & { user: any }) {
    return this.warehouseService.list(req.user);
  }

  @Get('simple')
  @ApiOperation({ summary: 'Listar almacenes del tenant (solo IDs y nombres)' })
  @ApiResponse({ status: 200 })
  async listSimple(@Req() req: Request & { user: any }) {
    return this.warehouseService.listSimple(req.user);
  }

  @Get('lookup')
  @ApiOperation({ summary: 'Lookup de almacenes (solo id y nombre)' })
  @ApiResponse({ status: 200 })
  async lookup(@Req() req: Request & { user: any }) {
    return this.warehouseService.lookup(req.user);
  }

  @Put(':id/stores')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Editar lista de tiendas abastecidas por un warehouse' })
  @ApiResponse({ status: 200 })
  async updateStores(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: { storeIds: string[] },
  ) {
    return this.warehouseService.updateStores(id, dto.storeIds, req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalles completos de un almacén' })
  @ApiResponse({ status: 200 })
  async getDetails(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.warehouseService.getDetails(id, req.user);
  }
}
