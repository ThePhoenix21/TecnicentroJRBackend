import {
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
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { ProviderService } from './provider.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { SetProviderProductsDto } from './dto/set-provider-products.dto';

@ApiTags('Proveedores')
@ApiBearerAuth('JWT-auth')
@Controller('providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}

  @Post()
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 30, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Crear proveedor' })
  @ApiBody({ type: CreateProviderDto })
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
    dto: CreateProviderDto,
  ) {
    return this.providerService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Editar proveedor (no permite editar RUC)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdateProviderDto })
  @HttpCode(HttpStatus.OK)
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
    dto: UpdateProviderDto,
  ) {
    return this.providerService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 30, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Eliminar proveedor (soft delete)' })
  @ApiParam({ name: 'id' })
  @HttpCode(HttpStatus.OK)
  async softDelete(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.providerService.softDelete(id, req.user);
  }

  @Post(':id/products')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 20, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Editar productos que abastece el proveedor (set list)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: SetProviderProductsDto })
  @HttpCode(HttpStatus.OK)
  async setProviderProducts(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: SetProviderProductsDto,
  ) {
    return this.providerService.setProviderProducts(id, dto, req.user);
  }

  @Get()
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 120, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Listar proveedores' })
  async list(@Req() req: Request & { user: any }) {
    return this.providerService.list(req.user);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Detalle de proveedor (con relaciones)' })
  @ApiParam({ name: 'id' })
  async getDetail(
    @Req() req: Request & { user: any },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.providerService.getDetail(id, req.user);
  }
}
