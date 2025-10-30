import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly configService: ConfigService) {}

  @Get('status')
  getMaintenanceStatus() {
    const maintenanceMode = this.configService.get<string>('MAINTENANCE_MODE') === 'true';
    return { maintenance: maintenanceMode };
  }
}
