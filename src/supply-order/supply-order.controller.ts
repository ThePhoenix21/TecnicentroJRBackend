import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { Role } from '../auth/enums/role.enum';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { RequireTenantFeatures } from '../tenant/decorators/tenant-features.decorator';
import { TenantFeature } from '@prisma/client';
import { SupplyOrderService } from './supply-order.service';
import { CreateSupplyOrderDto } from './dto/create-supply-order.dto';
import { ReceiveSupplyOrderDto } from './dto/receive-supply-order.dto';

@ApiTags('Órdenes de Suministro')
@ApiBearerAuth()
@RequireTenantFeatures(TenantFeature.INVENTORY)
@Controller('supply-orders')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class SupplyOrderController {
  constructor(private readonly supplyOrderService: SupplyOrderService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.MANAGE_INVENTORY)
  @ApiOperation({ summary: 'Crear orden de suministro' })
  @ApiBody({ type: CreateSupplyOrderDto })
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 30, windowSeconds: 60 }],
  })
  async create(
    @Req() req: any,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateSupplyOrderDto,
  ) {
    return this.supplyOrderService.create(dto, req.user);
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.MANAGE_INVENTORY)
  @ApiOperation({ summary: 'Registrar recepción de orden de suministro' })
  @ApiBody({ type: ReceiveSupplyOrderDto })
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 20, windowSeconds: 60 }],
  })
  async receive(
    @Param('id') id: string,
    @Req() req: any,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: ReceiveSupplyOrderDto,
  ) {
    return this.supplyOrderService.receive(id, dto, req.user);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.MANAGE_INVENTORY)
  @ApiOperation({ summary: 'Aprobar orden de suministro' })
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 20, windowSeconds: 60 }],
  })
  async approve(@Param('id') id: string, @Req() req: any) {
    return this.supplyOrderService.approve(id, req.user);
  }
}
