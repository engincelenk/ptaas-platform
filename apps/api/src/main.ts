import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  // Pino structured logging
  app.useLogger(app.get(Logger));

  // Cookie parser (needed for httpOnly refresh token cookie)
  app.use(cookieParser());

  // Security headers — full CSP hardening (ISO-DEV-04)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: [],
        },
        // API-only: no inline scripts, no unsafe-inline
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      permittedCrossDomainPolicies: false,
    }),
  );

  // Global validation pipe — Zod runs per-endpoint, class-validator for DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — restricted to frontend origin in production
  const configService = app.get(ConfigService);
  const isDev = configService.get('NODE_ENV') !== 'production';
  app.enableCors({
    origin: isDev ? '*' : configService.get('FRONTEND_URL'),
    credentials: true,
  });

  // Global API prefix
  app.setGlobalPrefix('api/v1');

  // Scalar / OpenAPI docs (dev only)
  if (isDev) {
    const config = new DocumentBuilder()
      .setTitle('PTaaS API')
      .setDescription('PTaaS Platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('API_PORT') ?? 3001;
  await app.listen(port);
}

bootstrap();
