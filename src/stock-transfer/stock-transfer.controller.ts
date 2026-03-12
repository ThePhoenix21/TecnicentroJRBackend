import {
  Body,
  Controller,
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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantFeature } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { Role } from '../auth/enums/role.enum';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { StockTransferService } from './stock-transfer.service';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { UpdateStockTransferDto } from './dto/update-stock-transfer.dto';
import { ReceiveStockTransferDto } from './dto/receive-stock-transfer.dto';
import { AnnulStockTransferDto } from './dto/annul-stock-transfer.dto';
import { ListStockTransfersDto } from './dto/list-stock-transfers.dto';

@ApiTags('Transferencias de Stock')
@ApiBearerAuth()
@RequireTenantFeatures(TenantFeature.INVENTORY)
@Controller('stock-transfers')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class StockTransferController {
  constructor(private readonly stockTransferService: StockTransferService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_STOCK_TRANSFERS)
  @RateLimit({ keyType: 'user', rules: [{ limit: 60, windowSeconds: 60 }] })
  @ApiOperation({ summary: 'Listar transferencias de stock de un establecimiento (storeId o warehouseId requerido)' })
  list(@Req() req: any, @Query() query: ListStockTransfersDto) {
    return this.stockTransferService.list(query, req.user);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_STOCK_TRANSFERS)
  @RateLimit({ keyType: 'user', rules: [{ limit: 60, windowSeconds: 60 }] })
  @ApiOperation({ summary: 'Obtener detalle de una transferencia de stock' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.stockTransferService.findOne(id, req.user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.CREATE_STOCK_TRANSFER)
  @RateLimit({ keyType: 'user', rules: [{ limit: 20, windowSeconds: 60 }] })
  @ApiOperation({ summary: 'Crear transferencia de stock (queda en estado ISSUED)' })
  create(
    @Req() req: any,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: CreateStockTransferDto,
  ) {
    return this.stockTransferService.create(dto, req.user);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.EDIT_STOCK_TRANSFER)
  @RateLimit({ keyType: 'user', rules: [{ limit: 20, windowSeconds: 60 }] })
  @ApiOperation({ summary: 'Editar transferencia en estado ISSUED (solo establecimiento origen)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateStockTransferDto,
  ) {
    return this.stockTransferService.update(id, dto, req.user);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.CONFIRM_STOCK_TRANSFER)
  @RateLimit({ keyType: 'user', rules: [{ limit: 20, windowSeconds: 60 }] })
  @ApiOperation({ summary: 'Confirmar transferencia (ISSUED → PENDING), descuenta stock del origen' })
  confirm(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.stockTransferService.confirm(id, req.user);
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.RECEIVE_STOCK_TRANSFER)
  @RateLimit({ keyType: 'user', rules: [{ limit: 20, windowSeconds: 60 }] })
  @ApiOperation({ summary: 'Recepcionar productos (PENDING/PARTIAL → PARTIAL/COMPLETED), agrega stock al destino' })
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: ReceiveStockTransferDto,
  ) {
    return this.stockTransferService.receive(id, dto, req.user);
  }

  @Post(':id/close-partial')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.RECEIVE_STOCK_TRANSFER)
  @RateLimit({ keyType: 'user', rules: [{ limit: 10, windowSeconds: 60 }] })
  @ApiOperation({ summary: 'Cerrar transferencia como PARTIALLY_RECEIVED (solo cuando está en PARTIAL)' })
  closePartial(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.stockTransferService.closePartial(id, req.user);
  }

  @Post(':id/annul')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.CANCEL_STOCK_TRANSFER)
  @RateLimit({ keyType: 'user', rules: [{ limit: 10, windowSeconds: 60 }] })
  @ApiOperation({ summary: 'Anular transferencia (solo en ISSUED o PENDING; restaura stock si PENDING)' })
  annul(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: AnnulStockTransferDto,
  ) {
    return this.stockTransferService.annul(id, dto, req.user);
  }
}
