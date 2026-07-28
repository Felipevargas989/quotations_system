import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { validateEnv } from './config/validate-env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  // Fase 2: sin configuración crítica el servidor NO parte (lanza acá,
  // con mensaje claro en el log del deploy). Las importantes-no-vitales
  // solo se advierten, más abajo, cuando el logger ya existe.
  const faltantes = validateEnv();
  // Railway pone un proxy adelante: sin esto, todas las peticiones
  // parecerían venir de LA MISMA IP y el límite de frecuencia (Fase 3)
  // castigaría a todos los usuarios juntos.
  (
    app.getHttpAdapter().getInstance() as {
      set: (k: string, v: number) => void;
    }
  ).set('trust proxy', 1);
  const configService = app.get(ConfigService);
  // Enable CORS
  app.enableCors({
    origin: [
      configService.get('FRONTEND_URL'), // React dev server
      // Dominio productivo y alias Netlify: ambos aceptados SIEMPRE para
      // que el switchover de DNS (Plan B) no corte a nadie a mitad de
      // camino, apunte donde apunte FRONTEND_URL.
      'https://www.eventi-app.com',
      'https://eventia-dev.netlify.app',
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
  if (faltantes.length > 0) {
    app
      .get(Logger)
      .warn(
        `⚠️ CONFIGURACIÓN INCOMPLETA (el servidor parte igual, pero algo va a fallar): faltan ${faltantes.join(', ')}`,
      );
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(configService.get('PORT')!);
}
void bootstrap();
