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
  Query,
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
import { ListProvidersDto } from './dto/list-providers.dto';
import { ListProvidersResponseDto } from './dto/list-providers-response.dto';

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

  @Get('lookup')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 120, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Lookup de proveedores (solo id y nombre)' })
  @ApiResponse({
    status: 200,
    description: 'Lista de proveedores simplificada obtenida exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          name: { type: 'string', example: 'Proveedor S.A.' },
        },
      },
    },
  })
  async lookup(@Req() req: Request & { user: any }) {
    return this.providerService.lookup(req.user);
  }

  @Get()
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 120, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Listar proveedores' })
  @ApiResponse({ status: 200, type: ListProvidersResponseDto })
  async list(
    @Req() req: Request & { user: any },
    @Query() query: ListProvidersDto,
  ): Promise<ListProvidersResponseDto> {
    return this.providerService.list(query, req.user);
  }

  @Get('lookup-ruc')
  @Roles(Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 120, windowSeconds: 60 }],
  })
  @ApiOperation({ summary: 'Lookup de RUC de proveedores (solo id y ruc)' })
  @ApiResponse({
    status: 200,
    description: 'Lista de RUC de proveedores obtenida exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          ruc: { type: 'string', example: '20123456789' },
        },
      },
    },
  })
  async lookupRuc(@Req() req: Request & { user: any }) {
    return this.providerService.lookupRuc(req.user);
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
