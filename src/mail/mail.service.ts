import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { TemplateService } from './template.service';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private transporter: any;
  private readonly defaultFrom: string;
  private readonly logger = new Logger(MailService.name);
  private readonly mailService: string;

  constructor(private readonly templateService: TemplateService) {
    if (!process.env.MAIL_SERVICE) {
      throw new Error('La variable de entorno MAIL_SERVICE no está configurada. Debe ser "resend" o "gmail"');
    }
    
    this.mailService = process.env.MAIL_SERVICE.toLowerCase();
    this.logger.log(`Configurando servicio de correo con proveedor: ${this.mailService}`);

    switch (this.mailService) {
      case 'resend':
        if (!process.env.RESEND_API_KEY) {
          throw new Error('RESEND_API_KEY no está configurado en las variables de entorno');
        }
        const resend = new Resend(process.env.RESEND_API_KEY);
        this.transporter = {
          sendMail: async (mailOptions: any) => {
            this.logger.debug(`Enviando correo a través de Resend a: ${mailOptions.to}`);
            return await resend.emails.send({
              from: mailOptions.from || process.env.RESEND_FROM!,
              to: mailOptions.to,
              subject: mailOptions.subject,
              html: mailOptions.html,
            });
          },
        };
        this.defaultFrom = process.env.RESEND_FROM || 'onboarding@resend.dev';
        break;

      case 'gmail':
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
          throw new Error('EMAIL_USER y EMAIL_PASS son requeridos para el servicio Gmail');
        }
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });
        this.defaultFrom = `"${process.env.EMAIL_FROM_NAME || 'Nuestra Aplicación'}" <${process.env.EMAIL_USER}>`;
        break;

      default:
        throw new Error(`Proveedor de correo no soportado: ${this.mailService}`);
    }

    this.logger.log(`Servicio de correo configurado con remitente: ${this.defaultFrom}`);
  }

  async sendVerificationEmail(to: string, token: string | null, name: string = 'Usuario') {
    try {
      const verificationUrl = `${process.env.APP_URL}/auth/verify?token=${token}`;
      const html = await this.templateService.renderTemplate('auth/verification-email', {
        name,
        verificationUrl,
      });

      await this.transporter.sendMail({
        from: this.defaultFrom,
        to,
        subject: 'Verificación de Correo Electrónico',
        html,
      });

      this.logger.log(`Correo de verificación enviado a ${to}`);
    } catch (error) {
      this.logger.error('Error al enviar correo de verificación:', error);
      throw new Error('No se pudo enviar el correo de verificación');
    }
  }

  async sendPasswordResetEmail(to: string, token: string) {
    try {
      const resetUrl = `${process.env.APP_URL}/auth/reset-password?token=${token}`;
      const html = await this.templateService.renderTemplate('auth/password-reset', {
        resetUrl,
      });

      await this.transporter.sendMail({
        from: this.defaultFrom,
        to,
        subject: 'Restablecimiento de Contraseña',
        html,
      });

      this.logger.log(`Correo de restablecimiento enviado a ${to}`);
    } catch (error) {
      this.logger.error('Error al enviar correo de restablecimiento de contraseña:', error);
      throw new Error('No se pudo enviar el correo de restablecimiento de contraseña');
    }
  }

  async sendCustomEmail(to: string, subject: string, html: string, attachments?: any[]) {
    try {
      await this.transporter.sendMail({
        from: this.defaultFrom,
        to,
        subject,
        html,
        attachments,
      });
      this.logger.log(`Correo personalizado enviado a ${to}`);
    } catch (error) {
      this.logger.error('Error al enviar correo personalizado:', error);
      throw new Error('No se pudo enviar el correo');
    }
  }

  async sendSupplyOrderApprovalEmail(to: string, orderCode: string, htmlContent: string) {
    try {
      const subject = `Orden de Suministro Aprobada - ${orderCode}`;
      
      const emailHtml = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Aprobación de Orden de Suministro</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .header {
                    background-color: #007bff;
                    color: white;
                    padding: 20px;
                    text-align: center;
                    border-radius: 5px 5px 0 0;
                }
                .content {
                    background-color: #f9f9f9;
                    padding: 30px;
                    border-radius: 0 0 5px 5px;
                }
                .order-info {
                    background-color: white;
                    padding: 20px;
                    border-radius: 5px;
                    margin: 20px 0;
                    border-left: 4px solid #007bff;
                }
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #ddd;
                    font-size: 12px;
                    color: #666;
                }
                .button {
                    display: inline-block;
                    background-color: #007bff;
                    color: white;
                    padding: 12px 24px;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 20px 0;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Orden de Suministro Aprobada</h1>
            </div>
            
            <div class="content">
                <p>Estimado proveedor,</p>
                
                <p>Le informamos que su orden de suministro ha sido aprobada y está lista para ser procesada.</p>
                
                <div class="order-info">
                    <h3>Datos de la Orden</h3>
                    <p><strong>Código:</strong> ${orderCode}</p>
                    <p><strong>Estado:</strong> Aprobada</p>
                    <p><strong>Fecha de aprobación:</strong> ${new Date().toLocaleDateString('es-DO')}</p>
                </div>
                
                <p>Adjunto encontrará el documento PDF con todos los detalles de la orden aprobada.</p>
                
                <p>Por favor, revise los detalles y proceda con la preparación de los productos según lo acordado.</p>
                
                <p>Si tiene alguna pregunta o necesita información adicional, no dude en contactarnos.</p>
                
                <p>Atentamente,<br>
                El equipo de Gestión</p>
            </div>
            
            <div class="footer">
                <p>Este es un mensaje automático generado por el Sistema de Gestión</p>
                <p>© ${new Date().getFullYear()} Todos los derechos reservados</p>
            </div>
        </body>
        </html>
      `;

      const attachments = [
        {
          filename: `orden-suministro-${orderCode}.html`,
          content: htmlContent,
          contentType: 'text/html',
        }
      ];

      await this.transporter.sendMail({
        from: this.defaultFrom,
        to,
        subject,
        html: emailHtml,
        attachments,
      });

      this.logger.log(`Correo de aprobación de orden enviado a ${to}`);
    } catch (error) {
      this.logger.error('Error al enviar correo de aprobación de orden:', error);
      throw new Error('No se pudo enviar el correo de aprobación de orden');
    }
  }
}
