import { Body, Controller, Post, UsePipes, ValidationPipe, Logger, BadRequestException } from '@nestjs/common';
import { MailService } from './mail.service';
import escape from 'escape-html';
import { ContactDto } from './dto/contact.dto';

@Controller('contact')
export class MailController {
  private readonly logger = new Logger(MailController.name);

  constructor(private readonly mailService: MailService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async sendContactEmail(@Body() contactData: ContactDto) {
    try {
      const { nombre, apellido, email, asunto, mensaje, toEmail } = contactData;

      // Escapamos HTML para seguridad
      const emailContent = `
        <h2>Nuevo mensaje de contacto</h2>
        <p><strong>De:</strong> ${escape(nombre)} ${escape(apellido)} (${escape(email)})</p>
        <p><strong>Asunto:</strong> ${escape(asunto)}</p>
        <h4>Mensaje:</h4>
        <p>${escape(mensaje).replace(/\n/g, '<br>')}</p>
      `;

      await this.mailService.sendCustomEmail(
        toEmail, // ahora se usa el correo del DTO
        `Contacto: ${escape(asunto)}`,
        emailContent
      );

      this.logger.log(`Mensaje de contacto enviado de ${email} a ${toEmail}`);
      
      return { success: true, message: 'Mensaje enviado correctamente' };
    } catch (error) {
      this.logger.error('Error al enviar mensaje de contacto:', error);
      throw new BadRequestException('No se pudo enviar el mensaje. Por favor, intente nuevamente más tarde.');
    }
  }
}