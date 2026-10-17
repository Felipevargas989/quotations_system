import { Injectable } from '@nestjs/common';
import { HORA_MS, cachePerfiles } from 'src/cache/memoria';
import { UsersRepository } from 'src/users/users.repository';
import { AuthService } from './auth.service';

// LA SESIÓN OPCIONAL DE UNA PUERTA PÚBLICA (17-10-2026).
//
// Una ruta @Public() no pasa por AuthGuard: nadie revisa el pase y no hay
// request.user. GET /quotations/:id es pública por la encuesta, pero la
// abren también el cotizador, la ficha y Post-Venta, con sesión. Para saber
// si quien pregunta es del equipo de la empresa (y puede ver el comentario
// interno), se lee el pase SI VIENE, con las mismas piezas del guardia: el
// pase y el perfil recordados. Nunca rechaza: sin pase, o con uno que no
// vale, la respuesta es "sin sesión" (null) y la puerta sigue abierta.
type Perfil = Awaited<ReturnType<UsersRepository['findOne']>>['data'];

@Injectable()
export class SesionOpcional {
  constructor(
    private readonly authService: AuthService,
    private readonly usersRepository: UsersRepository,
  ) {}

  /** La empresa de quien llama, o null si no trae una sesión válida. */
  async empresaDe(authorization?: string): Promise<number | null> {
    const [tipo, pase] = authorization?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !pase) return null;
    try {
      const { id } = await this.authService.validateToken(pase);
      let perfil = cachePerfiles.get(id) as Perfil | undefined;
      if (!perfil) {
        const { data } = await this.usersRepository.findOne(id);
        perfil = data;
        if (data) cachePerfiles.set(id, data, HORA_MS);
      }
      return perfil?.company_id ?? null;
    } catch {
      return null;
    }
  }
}
