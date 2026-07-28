import { Controller, Get } from '@nestjs/common';
import { Public } from 'src/auth/public.decorator';

// Fase 2 (Bloque A): comprobación de salud PÚBLICA. Sirve para saber en
// un segundo si el backend está vivo y QUÉ versión exacta corre, sin
// iniciar sesión y sin adivinar. Railway inyecta el commit en
// RAILWAY_GIT_COMMIT_SHA; en local se responde "desarrollo".
//
// No toca la base ni expone datos: solo estado, versión y tiempo arriba.
const STARTED_AT = Date.now();

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      version: (process.env.RAILWAY_GIT_COMMIT_SHA || 'desarrollo').slice(
        0,
        7,
      ),
      uptime_seconds: Math.round((Date.now() - STARTED_AT) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
