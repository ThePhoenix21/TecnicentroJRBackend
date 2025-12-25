import { Controller, Get, Param, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ReceiptService } from './receipt.service';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';

@ApiTags('Receipts')
@ApiBearerAuth('JWT')
@Controller('receipts')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'No autorizado. Se requiere autenticación JWT' })
@ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Acceso denegado. Se requieren permisos adecuados' })
@ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Error interno del servidor' })
export class ReceiptController {
  constructor(private readonly receiptService: ReceiptService) {}

  @Get('service/:orderId')
  @Roles(Role.USER, Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 3600 }],
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener recibo de venta de servicios',
    description: 'Genera un recibo con toda la información necesaria para el PDF de una venta de servicios'
  })
  @ApiParam({ 
    name: 'orderId', 
    required: true, 
    type: 'string',
    format: 'uuid',
    description: 'ID de la orden que contiene servicios',
    example: '123e4567-e89b-12d3-a456-426614174001'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Recibo de servicios generado exitosamente',
    schema: {
      type: 'object',
      properties: {
        receipt: {
          type: 'object',
          properties: {
            businessName: { type: 'string', example: 'Tecnicentro JR' },
            address: { type: 'string', example: 'Av. Principal 123' },
            phone: { type: 'string', example: '+1234567890' },
            currentDate: { type: 'string', example: '01/12/2025' },
            currentTime: { type: 'string', example: '15:30:45' },
            orderNumber: { type: 'string', example: '001-20251201-CIW0Y8NQ' },
            sellerName: { type: 'string', example: 'Juan Vendedor' },
            clientName: { type: 'string', example: 'Carlos Cliente' },
            clientDni: { type: 'string', example: '12345678' },
            clientPhone: { type: 'string', example: '987654321' },
            paidAmount: { type: 'number', example: 350.00 }
          }
        },
        services: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'service-uuid' },
              name: { type: 'string', example: 'Reparación de teclado' },
              price: { type: 'number', example: 350.00 },
              payments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', example: 'EFECTIVO' },
                    amount: { type: 'number', example: 10.00 }
                  }
                }
              }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Orden no encontrada o no contiene servicios',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Orden no encontrada' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  async getServiceReceipt(@Param('orderId') orderId: string, @Req() req: any) {
    return this.receiptService.getServiceReceipt(orderId, req.user);
  }

  @Get('product/:orderId')
  @Roles(Role.USER, Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 3600 }],
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener recibo de venta de productos',
    description: 'Genera un recibo con toda la información necesaria para el PDF de una venta de productos'
  })
  @ApiParam({ 
    name: 'orderId', 
    required: true, 
    type: 'string',
    format: 'uuid',
    description: 'ID de la orden que contiene productos',
    example: '123e4567-e89b-12d3-a456-426614174001'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Recibo de productos generado exitosamente'
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Orden no encontrada o no contiene productos'
  })
  async getProductReceipt(@Param('orderId') orderId: string, @Req() req: any) {
    return this.receiptService.getProductReceipt(orderId, req.user);
  }

  @Get('advance/:serviceId')
  @Roles(Role.USER, Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 3600 }],
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener recibo de adelanto de servicio',
    description: 'Genera un recibo para un adelanto de pago de servicio'
  })
  @ApiParam({ 
    name: 'serviceId', 
    required: true, 
    type: 'string',
    format: 'uuid',
    description: 'ID del servicio con adelanto',
    example: '123e4567-e89b-12d3-a456-426614174001'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Recibo de adelanto generado exitosamente'
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Servicio no encontrado'
  })
  async getAdvanceReceipt(@Param('serviceId') serviceId: string, @Req() req: any) {
    return this.receiptService.getAdvanceReceipt(serviceId, req.user);
  }

  @Get('completion/:serviceId')
  @Roles(Role.USER, Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 3600 }],
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener recibo de servicio finalizado',
    description: 'Genera un recibo para un servicio completado'
  })
  @ApiParam({ 
    name: 'serviceId', 
    required: true, 
    type: 'string',
    format: 'uuid',
    description: 'ID del servicio completado',
    example: '123e4567-e89b-12d3-a456-426614174001'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Recibo de finalización generado exitosamente'
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Servicio no encontrado o no está completado'
  })
  async getCompletionReceipt(@Param('serviceId') serviceId: string, @Req() req: any) {
    return this.receiptService.getCompletionReceipt(serviceId, req.user);
  }

  @Get('cash-close/:sessionId')
  @Roles(Role.USER, Role.ADMIN)
  @RateLimit({
    keyType: 'user',
    rules: [{ limit: 60, windowSeconds: 3600 }],
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener recibo de cierre de caja',
    description: 'Genera un recibo para el cierre de una sesión de caja'
  })
  @ApiParam({ 
    name: 'sessionId', 
    required: true, 
    type: 'string',
    format: 'uuid',
    description: 'ID de la sesión de caja cerrada',
    example: '123e4567-e89b-12d3-a456-426614174001'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Recibo de cierre de caja generado exitosamente'
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Sesión de caja no encontrada o no está cerrada'
  })
  async getCashCloseReceipt(@Param('sessionId') sessionId: string, @Req() req: any) {
    return this.receiptService.getCashCloseReceipt(sessionId, req.user);
  }
}
