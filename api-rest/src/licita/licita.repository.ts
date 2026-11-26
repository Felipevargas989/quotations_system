import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';

/** Lo que Auth sabe de la persona (Google lo llena al entrar). */
export type PersonaDeAuth = {
  id: string;
  email: string | null;
  metadata: Record<string, unknown>;
};

// LO QUE EL ALTA DE LICITA LEE DE AUTH (25-11). Con la llave de servicio
// (`auth.admin`), que no le pega ninguna sesión al cliente compartido del
// motor (ver la nota de `UsersRepository.createAuthUser`). La empresa y la
// persona se crean con los repositorios de siempre.
@Injectable()
export class LicitaRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LicitaRepository.name);
  }

  async personaDeAuth(id: string): Promise<PersonaDeAuth | null> {
    this.logger.info(`personaDeAuth ${id}`);
    const { data, error } =
      await this.supabase.client.auth.admin.getUserById(id);
    if (error) throw error;
    const usuario = data?.user;
    if (!usuario) return null;
    return {
      id: usuario.id,
      email: usuario.email ?? null,
      metadata: (usuario.user_metadata ?? {}) as Record<string, unknown>,
    };
  }
}
