import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import { Injectable, Logger } from '@nestjs/common';

type HandlebarsTemplateDelegate = handlebars.TemplateDelegate;

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);
  private readonly templatesDir = path.join(process.cwd(), 'src', 'mail', 'templates');
  private readonly compiledTemplates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor() {
    // Registrar helpers personalizados de Handlebars si son necesarios
    this.registerHelpers();
  }

  private registerHelpers() {
    // Ejemplo de helper personalizado
    handlebars.registerHelper('formatDate', (date: Date) => {
      return new Date(date).toLocaleDateString();
    });
  }

  private getTemplatePath(templateName: string): string {
    return path.join(this.templatesDir, `${templateName}.hbs`);
  }

  private async compileTemplate(templateName: string): Promise<HandlebarsTemplateDelegate> {
    const templatePath = this.getTemplatePath(templateName);
    
    try {
      this.logger.debug(`Compilando plantilla: ${templatePath}`);
      const templateContent = await fs.promises.readFile(templatePath, 'utf-8');
      return handlebars.compile(templateContent);
    } catch (error) {
      this.logger.error(`Error al compilar la plantilla ${templateName}:`, error);
      throw new Error(`Error al compilar la plantilla ${templateName}: ${error.message}`);
    }
  }

  private async getCompiledTemplate(templateName: string): Promise<HandlebarsTemplateDelegate> {
    if (this.compiledTemplates.has(templateName)) {
      return this.compiledTemplates.get(templateName)!;
    }

    const compiledTemplate = await this.compileTemplate(templateName);
    this.compiledTemplates.set(templateName, compiledTemplate);
    return compiledTemplate;
  }

  public async renderTemplate<T extends object>(
    templateName: string,
    context: T
  ): Promise<string> {
    try {
      this.logger.debug(`Renderizando plantilla: ${templateName}`);
      const template = await this.getCompiledTemplate(templateName);
      const defaultContext = {
        appName: process.env.APP_NAME || 'Confirmacion de Correo',
        currentYear: new Date().getFullYear(),
        ...context
      };
      return template(defaultContext);
    } catch (error) {
      this.logger.error(`Error al renderizar la plantilla ${templateName}:`, error);
      throw new Error(`No se pudo renderizar la plantilla: ${templateName}`);
    }
  }
}
