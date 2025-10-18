import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { writeFileSync } from 'fs';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);
    const port = process.env.PORT || 3000;
    
    // Configuración de CORS
    app.enableCors({
      origin: process.env.NODE_ENV === 'development' 
        ? 'http://localhost:3000'  // Reemplaza con el puerto de tu frontend local
        : process.env.FRONTEND_URL,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      allowedHeaders: 'Content-Type, Accept, Authorization',
      credentials: true,
    });

    // Configuración de validación global
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // Configuración de Swagger
    const config = new DocumentBuilder()
      .setTitle('API Documentation')
      .setDescription('Documentación de la API de la aplicación')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Ingrese el token JWT',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    
    // Genera el archivo swagger.json
    if (process.env.NODE_ENV === 'development') {
      writeFileSync('./swagger.json', JSON.stringify(document, null, 2));
    }

    // Configuración de Swagger UI
    SwaggerModule.setup('api', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'method',
      },
    });

    await app.listen(port);
    
    logger.log(`🚀 Aplicación ejecutándose en: ${await app.getUrl()}`);
    logger.log(`📚 Documentación de la API: ${await app.getUrl()}/api`);
  } catch (error) {
    logger.error('Error al iniciar la aplicación:', error);
    process.exit(1);
  }
}

bootstrap();
