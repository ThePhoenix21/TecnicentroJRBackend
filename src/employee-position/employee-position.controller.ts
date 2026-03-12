import { Controller, Get, Delete, Param, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmployeePositionService } from './employee-position.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Role } from '../auth/enums/role.enum';
import { PERMISSIONS } from '../auth/permissions';

@ApiTags('Employee Positions')
@ApiBearerAuth()
@Controller('employee-positions')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class EmployeePositionController {
  constructor(private readonly service: EmployeePositionService) {}

  @Get('lookup')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.USER)
  @RequirePermissions(PERMISSIONS.VIEW_EMPLOYEES)
  @ApiOperation({ summary: 'Listar posiciones de empleados activas' })
  async lookup(@Req() req: any) {
    return this.service.lookup(req.user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN)
  @RequirePermissions(PERMISSIONS.MANAGE_EMPLOYEES)
  @ApiOperation({ summary: 'Eliminar posición (soft delete) con advertencias' })
  async softDelete(@Param('id') id: string, @Req() req: any) {
    return this.service.softDelete(id, req.user);
  }
}
