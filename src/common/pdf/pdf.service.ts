import { Injectable, Logger } from '@nestjs/common';
import { SupplyOrderStatus } from '@prisma/client';

interface SupplyOrderData {
  id: string;
  code: string;
  status: SupplyOrderStatus;
  description: string | null;
  createdAt: Date;
  provider: {
    name: string;
    ruc: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  warehouse?: {
    name: string;
    address: string | null;
    phone: string | null;
  } | null;
  store?: {
    name: string;
    address: string | null;
    phone: string | null;
  } | null;
  createdBy: {
    name: string;
    email: string;
  };
  products: Array<{
    product: {
      name: string;
    };
    quantity: number;
    note: string | null;
  }>;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  async generateSupplyOrderPdf(supplyOrder: SupplyOrderData): Promise<string> {
    try {
      return this.generateHtmlContent(supplyOrder);
    } catch (error) {
      this.logger.error('Error generating PDF HTML:', error);
      throw error;
    }
  }

  private generateHtmlContent(supplyOrder: SupplyOrderData): string {
    const statusText = this.getStatusText(supplyOrder.status);
    const totalProducts = supplyOrder.products.reduce((sum, p) => sum + p.quantity, 0);
    const location = supplyOrder.warehouse?.name || supplyOrder.store?.name || 'N/A';

    const productsRows = supplyOrder.products.map(product => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${this.escapeHtml(product.product.name)}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${product.quantity}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${this.escapeHtml(product.note || '')}</td>
      </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Orden de Suministro - ${supplyOrder.code}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            line-height: 1.4;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .section {
            margin-bottom: 25px;
        }
        .section-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 10px;
            border-bottom: 2px solid #333;
            padding-bottom: 5px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 10px;
        }
        .info-item {
            margin-bottom: 5px;
        }
        .info-label {
            font-weight: bold;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        th, td {
            padding: 8px;
            border: 1px solid #ddd;
            text-align: left;
        }
        th {
            background-color: #f5f5f5;
            font-weight: bold;
        }
        .totals {
            margin-top: 15px;
            font-weight: bold;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ccc;
            text-align: center;
            font-size: 12px;
            color: #666;
        }
        .description {
            background-color: #f9f9f9;
            padding: 15px;
            border-radius: 5px;
            margin-top: 10px;
        }
        @media print {
            body { margin: 0; }
            .footer { position: fixed; bottom: 0; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">ORDEN DE SUMINISTRO</div>
    </div>

    <div class="section">
        <div class="section-title">Datos Básicos</div>
        <div class="info-grid">
            <div class="info-item"><span class="info-label">Código:</span> ${this.escapeHtml(supplyOrder.code)}</div>
            <div class="info-item"><span class="info-label">Estado:</span> ${this.escapeHtml(statusText)}</div>
            <div class="info-item"><span class="info-label">Fecha de Emisión:</span> ${supplyOrder.createdAt.toLocaleDateString('es-DO')}</div>
            <div class="info-item"><span class="info-label">Almacén/Tienda:</span> ${this.escapeHtml(location)}</div>
        </div>
        <div class="info-item">
            <span class="info-label">Creado por:</span> 
            ${this.escapeHtml(supplyOrder.createdBy.name)} (${this.escapeHtml(supplyOrder.createdBy.email)})
        </div>
    </div>

    <div class="section">
        <div class="section-title">Datos del Proveedor</div>
        <div class="info-grid">
            <div class="info-item"><span class="info-label">Nombre:</span> ${this.escapeHtml(supplyOrder.provider.name)}</div>
            ${supplyOrder.provider.ruc ? `<div class="info-item"><span class="info-label">RUC:</span> ${this.escapeHtml(supplyOrder.provider.ruc)}</div>` : ''}
            ${supplyOrder.provider.phone ? `<div class="info-item"><span class="info-label">Teléfono:</span> ${this.escapeHtml(supplyOrder.provider.phone)}</div>` : ''}
            ${supplyOrder.provider.email ? `<div class="info-item"><span class="info-label">Email:</span> ${this.escapeHtml(supplyOrder.provider.email)}</div>` : ''}
        </div>
        ${supplyOrder.provider.address ? `<div class="info-item"><span class="info-label">Dirección:</span> ${this.escapeHtml(supplyOrder.provider.address)}</div>` : ''}
    </div>

    <div class="section">
        <div class="section-title">Productos</div>
        <table>
            <thead>
                <tr>
                    <th style="width: 50%;">Producto</th>
                    <th style="width: 15%; text-align: center;">Cantidad</th>
                    <th style="width: 35%;">Nota</th>
                </tr>
            </thead>
            <tbody>
                ${productsRows}
            </tbody>
        </table>
        <div class="totals">
            Total de Productos: ${totalProducts} unidades
        </div>
    </div>

    ${supplyOrder.description ? `
    <div class="section">
        <div class="section-title">Descripción/Notas</div>
        <div class="description">
            ${this.escapeHtml(supplyOrder.description)}
        </div>
    </div>
    ` : ''}

    <div class="footer">
        Documento generado automáticamente - Sistema de Gestión<br>
        Generado el ${new Date().toLocaleString('es-DO')}
    </div>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  private getStatusText(status: SupplyOrderStatus): string {
    const statusMap = {
      [SupplyOrderStatus.ISSUED]: 'Emitida',
      [SupplyOrderStatus.PENDING]: 'Pendiente',
      [SupplyOrderStatus.PARTIAL]: 'Parcial',
      [SupplyOrderStatus.RECEIVED]: 'Recibida',
      [SupplyOrderStatus.PARTIALLY_RECEIVED]: 'Parcialmente Recibida',
      [SupplyOrderStatus.ANNULLATED]: 'Anulada',
    };
    return statusMap[status] || status;
  }
}
