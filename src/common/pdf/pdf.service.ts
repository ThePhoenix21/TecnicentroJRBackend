import { Injectable, Logger } from '@nestjs/common';
import { SupplyOrderStatus } from '@prisma/client';
import PDFDocument = require('pdfkit');

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

  async generateSupplyOrderPdf(supplyOrder: SupplyOrderData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const statusText = this.getStatusText(supplyOrder.status);
        const location = supplyOrder.warehouse?.name || supplyOrder.store?.name || 'N/A';
        const totalProducts = supplyOrder.products.reduce((sum, p) => sum + p.quantity, 0);

        const primaryColor = '#0B5ED7';
        const lightGray = '#F8F9FA';
        const darkGray = '#495057';
        const borderColor = '#DEE2E6';

        doc
          .rect(40, 40, 515, 80)
          .fillAndStroke(primaryColor, primaryColor);

        doc
          .fontSize(24)
          .fillColor('#FFFFFF')
          .font('Helvetica-Bold')
          .text('ORDEN DE SUMINISTRO', 40, 60, { align: 'center', width: 515 });

        doc
          .fontSize(11)
          .fillColor('#FFFFFF')
          .font('Helvetica')
          .text(`Código: ${supplyOrder.code}`, 40, 90, { align: 'center', width: 515 });

        doc.moveDown(2);
        let currentY = 140;

        doc
          .rect(40, currentY, 515, 30)
          .fillAndStroke(lightGray, borderColor);

        doc
          .fontSize(11)
          .fillColor(darkGray)
          .font('Helvetica-Bold')
          .text('INFORMACIÓN DE LA ORDEN', 50, currentY + 10);

        currentY += 40;

        doc.fontSize(10).fillColor('#000000').font('Helvetica');
        
        const infoData = [
          { label: 'Estado', value: statusText },
          { label: 'Fecha de Emisión', value: supplyOrder.createdAt.toLocaleDateString('es-PE') },
          { label: 'Destino', value: location },
          { label: 'Solicitado por', value: `${supplyOrder.createdBy.name} (${supplyOrder.createdBy.email})` },
        ];

        infoData.forEach((item, index) => {
          const y = currentY + index * 25;
          doc.font('Helvetica-Bold').text(`${item.label}:`, 50, y, { width: 120, lineBreak: false });
          doc.font('Helvetica').text(item.value, 175, y, { width: 380, lineBreak: false });
        });

        currentY += infoData.length * 25 + 30;

        doc
          .rect(40, currentY, 515, 30)
          .fillAndStroke(lightGray, borderColor);

        doc
          .fontSize(11)
          .fillColor(darkGray)
          .font('Helvetica-Bold')
          .text('PRODUCTOS SOLICITADOS', 50, currentY + 10);

        currentY += 40;

        const tableHeaders = [
          { text: 'Producto', x: 50, width: 280 },
          { text: 'Cantidad', x: 340, width: 80, align: 'center' },
          { text: 'Nota', x: 430, width: 125 },
        ];

        doc
          .rect(40, currentY, 515, 25)
          .fillAndStroke('#E9ECEF', borderColor);

        tableHeaders.forEach((header) => {
          doc
            .fontSize(10)
            .fillColor('#000000')
            .font('Helvetica-Bold')
            .text(header.text, header.x, currentY + 8, {
              width: header.width,
              align: (header.align as any) || 'left',
            });
        });

        currentY += 25;

        doc.fontSize(9).font('Helvetica');

        supplyOrder.products.forEach((p, index) => {
          const rowHeight = 22;
          const bgColor = index % 2 === 0 ? '#FFFFFF' : '#F8F9FA';

          doc.rect(40, currentY, 515, rowHeight).fillAndStroke(bgColor, borderColor);

          doc.fillColor('#000000');
          doc.text(p.product.name, 50, currentY + 6, { width: 280, ellipsis: true });
          doc.text(String(p.quantity), 340, currentY + 6, { width: 80, align: 'center' });
          doc.text(p.note || '-', 430, currentY + 6, { width: 125, ellipsis: true });

          currentY += rowHeight;
        });

        currentY += 15;

        doc
          .fontSize(11)
          .fillColor('#000000')
          .font('Helvetica-Bold')
          .text(`Total de productos: ${totalProducts} unidades`, 50, currentY);

        currentY += 30;

        if (supplyOrder.description) {
          doc
            .rect(40, currentY, 515, 30)
            .fillAndStroke(lightGray, borderColor);

          doc
            .fontSize(11)
            .fillColor(darkGray)
            .font('Helvetica-Bold')
            .text('OBSERVACIONES', 50, currentY + 10);

          currentY += 40;

          doc
            .fontSize(10)
            .fillColor('#000000')
            .font('Helvetica')
            .text(supplyOrder.description, 50, currentY, { width: 495, align: 'justify' });

          currentY += 40;
        }

        const footerY = doc.page.height - 60;
        doc
          .fontSize(8)
          .fillColor('#6C757D')
          .font('Helvetica')
          .text(
            `Generado el ${new Date().toLocaleString('es-PE')} | Documento generado automáticamente`,
            40,
            footerY,
            { align: 'center', width: 515 }
          );

        doc.end();
      } catch (err) {
        this.logger.error('Error generando PDF:', err);
        reject(err);
      }
    });
  }

  generateSupplyOrderEmailHtml(supplyOrder: SupplyOrderData, tenantName: string): string {
    const statusText = this.getStatusText(supplyOrder.status);
    const totalProducts = supplyOrder.products.reduce((sum, p) => sum + p.quantity, 0);
    const location = supplyOrder.warehouse?.name || supplyOrder.store?.name || 'N/A';

    const productsRows = supplyOrder.products
      .map(
        (product) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${this.escapeHtml(product.product.name)}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${product.quantity}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${product.note ? this.escapeHtml(product.note) : '-'}</td>
      </tr>`,
      )
      .join('');

    const approverName = supplyOrder.createdBy?.name ? this.escapeHtml(supplyOrder.createdBy.name) : '';

    const safeTenantName = tenantName ? this.escapeHtml(tenantName) : '';

    // Nota: deliberadamente NO incluimos datos del proveedor en el body del correo.
    return `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Solicitud de suministro - ${this.escapeHtml(supplyOrder.code)}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 760px; margin: 0 auto; padding: 24px;">
        <div style="background: #0B5ED7; color: white; padding: 18px 20px; border-radius: 6px 6px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">Orden de Suministro</h2>
          <div style="margin-top: 6px; font-size: 13px; opacity: 0.95;">Código: <strong>${this.escapeHtml(supplyOrder.code)}</strong></div>
        </div>

        <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 6px 6px;">
          <p style="margin-top: 0;">Estimados,</p>

          <p>
            Por medio de la presente, solicitamos su amable atención para el abastecimiento de los productos detallados a continuación.
            Agradeceremos nos confirmen la disponibilidad y el plazo de entrega a la brevedad posible.
          </p>

          <div style="background: #fff; padding: 14px 16px; border-radius: 6px; border-left: 4px solid #0B5ED7; margin: 16px 0;">
            <div style="font-weight: bold; margin-bottom: 8px;">Datos de la Orden</div>
            <div><strong>Estado:</strong> ${this.escapeHtml(statusText)}</div>
            <div><strong>Fecha:</strong> ${supplyOrder.createdAt.toLocaleDateString('es-PE')}</div>
            <div><strong>Almacén/Tienda:</strong> ${this.escapeHtml(location)}</div>
            ${approverName ? `<div><strong>Solicitado por:</strong> ${approverName}</div>` : ''}
          </div>

          <div style="background: #fff; padding: 14px 16px; border-radius: 6px; margin: 16px 0;">
            <div style="font-weight: bold; margin-bottom: 10px;">Productos solicitados</div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr>
                  <th style="padding: 8px; border: 1px solid #ddd; background: #f2f2f2; text-align: left;">Producto</th>
                  <th style="padding: 8px; border: 1px solid #ddd; background: #f2f2f2; text-align: center; width: 90px;">Cantidad</th>
                  <th style="padding: 8px; border: 1px solid #ddd; background: #f2f2f2; text-align: left;">Nota</th>
                </tr>
              </thead>
              <tbody>
                ${productsRows}
              </tbody>
            </table>
            <div style="margin-top: 10px; font-weight: bold;">Total: ${totalProducts} unidades</div>
          </div>

          ${
            supplyOrder.description
              ? `<div style="background: #fff; padding: 14px 16px; border-radius: 6px; margin: 16px 0;">
                  <div style="font-weight: bold; margin-bottom: 8px;">Descripción / Observaciones</div>
                  <div>${this.escapeHtml(supplyOrder.description)}</div>
                </div>`
              : ''
          }

          <p>
            Se adjunta en PDF la orden para su revisión.
          </p>

          <p style="margin-bottom: 0;">
            Sin otro particular, quedamos atentos a su pronta respuesta.
          </p>

          <div style="margin-top: 18px;">
            <div>ATTE.</div>
            <div style="font-weight: bold;">${safeTenantName}</div>
          </div>

          <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid #e6e6e6; font-size: 12px; color: #666;">
            Este es un mensaje automático generado por el sistema.
          </div>
        </div>
      </body>
    </html>
    `;
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
