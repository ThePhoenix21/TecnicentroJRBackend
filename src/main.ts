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

    // Maintenance Mode global (sin endpoints dedicados ni polling)
    // Se ejecuta antes de guards/interceptors/controllers.
    app.use((req: any, res: any, next: any) => {
      const maintenanceEnabled = process.env.MAINTENANCE_MODE === 'true';
      if (!maintenanceEnabled) return next();

      const url = String(req?.originalUrl ?? req?.url ?? '');
      const path = url.split('?')[0] || '';

      const allowlist: Array<string | RegExp> = [
        /^\/health(?:\/|$)/,
        /^\/api(?:\/|$)/,
        /^\/metrics(?:\/|$)/,
        /^\/internal(?:\/|$)/,
        /^\/auth\/login-bootstrap(?:\/|$)/,
      ];

      const isAllowed = allowlist.some((rule) =>
        typeof rule === 'string' ? path === rule : rule.test(path),
      );

      if (isAllowed) return next();

      return res.status(503).json({ maintenance: true });
    });

    app.getHttpAdapter().getInstance().set('trust proxy', 1);

    app.getHttpAdapter().getInstance().disable('x-powered-by');

    app.use(require('express').json({ limit: '1mb' }));
    app.use(require('express').urlencoded({ extended: true, limit: '1mb' }));
    
    // Configuración de CORS
    app.enableCors({
      origin: (origin, callback) => {
        const allowedOrigins = [
          'http://localhost:3000',  // Desarrollo local
          'https://tecnicentro-jr-frontend.vercel.app',  // Producción
          'https://tecnicentro-jr-frontend.vercel.app/'  // Por si acaso
        ];

        // En producción, verifica el origen
        if (process.env.NODE_ENV === 'production') {
          if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/\/$/, '')))) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        } 
        // En desarrollo, permite localhost
        else {
          callback(null, true);
        }
      },
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
