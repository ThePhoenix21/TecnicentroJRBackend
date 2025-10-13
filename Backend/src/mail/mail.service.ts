import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { TemplateService } from './template.service';

@Injectable()
export class MailService {
  private transporter;
  private readonly defaultFrom: string;

  constructor(private readonly templateService: TemplateService) {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '465', 10),
      secure: process.env.EMAIL_SECURE !== 'false', // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    this.defaultFrom = `"${process.env.EMAIL_FROM_NAME || 'Confirmacion de Correo'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`;
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
    } catch (error) {
      console.error('Error al enviar correo de verificación:', error);
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
    } catch (error) {
      console.error('Error al enviar correo de restablecimiento de contraseña:', error);
      throw new Error('No se pudo enviar el correo de restablecimiento de contraseña');
    }
  }
  
}
