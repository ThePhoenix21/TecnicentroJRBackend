import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { TemplateService } from './template.service';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private transporter: any;
  private readonly defaultFrom: string;
  private readonly logger = new Logger(MailService.name);
  private readonly useResend: boolean;

  constructor(private readonly templateService: TemplateService) {
    // Decide si usamos Resend o Nodemailer
    this.useResend = !!process.env.RESEND_API_KEY;

    if (this.useResend) {
      // Configuración para Resend
      const resend = new Resend(process.env.RESEND_API_KEY!);      
      this.transporter = {
        sendMail: async (mailOptions: any) => {
          console.log("MailOptions: ",mailOptions);
          return await resend.emails.send({
            from: mailOptions.from || process.env.RESEND_FROM!,
            to: mailOptions.to,
            subject: mailOptions.subject,
            html: mailOptions.html,
          });
        },
      };
      this.defaultFrom = process.env.RESEND_FROM || 'onboarding@resend.dev';
    } else {
      // Configuración para Nodemailer (desarrollo)
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT || '465', 10),
        secure: process.env.EMAIL_SECURE !== 'false', // true for 465
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
      this.defaultFrom = `"${process.env.EMAIL_FROM_NAME || 'Nuestra Aplicación'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`;
    }
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
