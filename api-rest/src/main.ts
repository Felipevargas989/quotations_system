import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Enable CORS
  app.enableCors({
    origin: [
      'http://localhost:3000', // React dev server
      'http://localhost:5173', // Vite dev server
      'http://localhost:4173', // Vite preview
      'http://127.0.0.1:5173', // Alternative localhost
      'http://127.0.0.1:3000', // Alternative localhost
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Cache-Control',
    ],
    credentials: true, // Allow cookies and authorization headers
  });

  app.useLogger(app.get(Logger));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const configService = app.get(ConfigService);
  await app.listen(configService.get('PORT') || 3000);
}
bootstrap();
