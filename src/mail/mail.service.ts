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

      console.log("DefaultFrom: ",this.defaultFrom);
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

  async sendCustomEmail(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({
        from: this.defaultFrom,
        to,
        subject,
        html,
      });
      this.logger.log(`Correo personalizado enviado a ${to}`);
    } catch (error) {
      this.logger.error('Error al enviar correo personalizado:', error);
      throw new Error('No se pudo enviar el correo');
    }
  }
}
