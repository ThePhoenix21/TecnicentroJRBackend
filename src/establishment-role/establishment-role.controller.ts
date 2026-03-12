import { Controller, Get, Delete, Param, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EstablishmentRoleService } from './establishment-role.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Role } from '../auth/enums/role.enum';
import { PERMISSIONS } from '../auth/permissions';

@ApiTags('Establishment Roles')
@ApiBearerAuth()
@Controller('establishment-roles')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class EstablishmentRoleController {
  constructor(private readonly service: EstablishmentRoleService) {}

  @Get('lookup')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_EMPLOYEES)
  @ApiOperation({ summary: 'Listar roles de establecimiento activos' })
  async lookup(@Req() req: any) {
    return this.service.lookup(req.user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.MANAGE_EMPLOYEES)
  @ApiOperation({ summary: 'Eliminar rol (soft delete) con advertencias' })
  async softDelete(@Param('id') id: string, @Req() req: any) {
    return this.service.softDelete(id, req.user);
  }
}
