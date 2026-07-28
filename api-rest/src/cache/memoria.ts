// FASE VELOCIDAD (28-07) — memoria simple en RAM con vencimiento.
// Tres usos, todos con su seguro contra datos viejos:
//  - Pases (tokens) ya verificados: se recuerdan hasta que EXPIRAN
//    solos (los emite Supabase con vencimiento de 1 hora). Ahorra una
//    llamada HTTP a Supabase en CADA petición.
//  - Perfiles de usuario: 1 hora, pero si alguien edita un usuario se
//    olvida su ficha AL INSTANTE (users.service llama olvidarPerfil).
//  - Panel de análisis: 1 hora, pero CUALQUIER cambio de cotización,
//    pago o reembolso borra el panel de esa empresa al instante
//    (invalidarPanelEmpresa) — nunca se ven números viejos.
// La memoria vive en el proceso: un redeploy la parte de cero (bien).

export class CacheMemoria<V> {
  private mapa = new Map<string, { valor: V; vence: number }>();

  constructor(private readonly maxEntradas = 2000) {}

  get(clave: string): V | undefined {
    const e = this.mapa.get(clave);
    if (!e) return undefined;
    if (Date.now() > e.vence) {
      this.mapa.delete(clave);
      return undefined;
    }
    return e.valor;
  }

  set(clave: string, valor: V, ttlMs: number): void {
    // Tope de tamaño: bota lo más antiguo (los Map conservan orden).
    if (this.mapa.size >= this.maxEntradas) {
      const primera = this.mapa.keys().next().value;
      if (primera !== undefined) this.mapa.delete(primera);
    }
    this.mapa.set(clave, { valor, vence: Date.now() + ttlMs });
  }

  delete(clave: string): void {
    this.mapa.delete(clave);
  }

  borrarPorPrefijo(prefijo: string): void {
    for (const k of this.mapa.keys()) {
      if (k.startsWith(prefijo)) this.mapa.delete(k);
    }
  }
}

export const HORA_MS = 60 * 60 * 1000;

// token (huella) → identidad verificada
export const cacheTokens = new CacheMemoria<{ id: string }>(5000);
// userId → perfil completo
export const cachePerfiles = new CacheMemoria<unknown>(2000);
// `${companyId}:${rango}` → respuesta del panel
export const cachePanel = new CacheMemoria<unknown>(300);

export const olvidarPerfil = (userId: string): void =>
  cachePerfiles.delete(userId);

// Cualquier cambio de plata o cotizaciones deja el panel obsoleto:
// se borra TODO el panel de esa empresa y se recalcula a la próxima.
export const invalidarPanelEmpresa = (companyId: number): void =>
  cachePanel.borrarPorPrefijo(`${companyId}:`);
