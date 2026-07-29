import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import * as webPush from 'web-push';

// ---------------- EVENTIA MÓVIL: avisos con push (migración 45) -----
// Cada 30 minutos se calculan los 4 avisos del handoff (pago vencido,
// evento próximo, solicitud nueva, cotización fría) SOLO para las
// empresas que tienen teléfonos registrados. El dedupe_key (misma
// forma que usa la app) garantiza que cada aviso se empuja UNA vez.
// Sin llaves VAPID configuradas, el módulo duerme (prod aún no las
// tiene: el push se estrena en el laboratorio).

interface Dispositivo {
  id: number;
  user_id: string;
  company_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface AvisoNuevo {
  company_id: number;
  dedupe_key: string;
  tipo: string;
  titulo: string;
  detalle: string;
  destino: string;
}

const clp = (n: number) =>
  '$' + new Intl.NumberFormat('es-CL').format(Math.round(n || 0));

@Injectable()
export class MovilService {
  private readonly listo: boolean;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MovilService.name);
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    this.listo = !!(pub && priv);
    if (this.listo) {
      webPush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:hola@eventi-app.com',
        pub!,
        priv!,
      );
    } else {
      this.logger.warn('Push del móvil dormido: faltan llaves VAPID');
    }
  }

  clavePublica(): { publicKey: string } {
    return { publicKey: process.env.VAPID_PUBLIC_KEY || '' };
  }

  async registrarDispositivo(
    userId: string,
    companyId: number,
    dto: { endpoint: string; p256dh: string; auth: string },
  ) {
    const { error } = await this.supabase.client.from('push_devices').upsert(
      {
        user_id: userId,
        company_id: companyId,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
      },
      { onConflict: 'endpoint' },
    );
    if (error) throw error;
    return { registrado: true };
  }

  private async empujar(d: Dispositivo, payload: object): Promise<boolean> {
    try {
      await webPush.sendNotification(
        {
          endpoint: d.endpoint,
          keys: { p256dh: d.p256dh, auth: d.auth },
        },
        JSON.stringify(payload),
      );
      return true;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410 = suscripción muerta (app desinstalada): se limpia sola.
      if (status === 404 || status === 410) {
        await this.supabase.client.from('push_devices').delete().eq('id', d.id);
      } else {
        this.logger.warn(`push falló (${status ?? '?'}) device ${d.id}`);
      }
      return false;
    }
  }

  async probar(userId: string) {
    if (!this.listo) return { enviados: 0, motivo: 'sin llaves VAPID' };
    const { data } = await this.supabase.client
      .from('push_devices')
      .select('*')
      .eq('user_id', userId);
    const dispositivos = (data ?? []) as Dispositivo[];
    let enviados = 0;
    for (const d of dispositivos) {
      if (
        await this.empujar(d, {
          title: 'Eventia Móvil 🎉',
          body: 'Las notificaciones funcionan. Este teléfono recibirá los avisos.',
          url: '/avisos',
        })
      )
        enviados++;
    }
    return { enviados };
  }

  // Cada 30 minutos. Solo calcula para empresas CON teléfonos.
  @Cron('*/30 * * * *')
  async cicloAvisos() {
    if (!this.listo) return;
    const { data: disp } = await this.supabase.client
      .from('push_devices')
      .select('*');
    const dispositivos = (disp ?? []) as Dispositivo[];
    if (dispositivos.length === 0) return;
    const empresas = [...new Set(dispositivos.map((d) => d.company_id))];
    for (const companyId of empresas) {
      try {
        const nuevos = await this.avisosDeEmpresa(companyId);
        for (const aviso of nuevos) {
          const { error } = await this.supabase.client
            .from('notifications')
            .insert(aviso);
          // Clave repetida = aviso ya empujado antes: se salta.
          if (error) continue;
          const destinos = dispositivos.filter(
            (d) => d.company_id === companyId,
          );
          for (const d of destinos) {
            await this.empujar(d, {
              title: aviso.titulo,
              body: aviso.detalle,
              url: aviso.destino,
            });
          }
        }
      } catch (err) {
        this.logger.warn(
          `ciclo de avisos falló para empresa ${companyId}: ${String(err)}`,
        );
      }
    }
  }

  // Las 4 reglas del handoff — mismas claves de dedupe que usa la app.
  private async avisosDeEmpresa(companyId: number): Promise<AvisoNuevo[]> {
    const hoy = new Date().toISOString().slice(0, 10);
    const avisos: AvisoNuevo[] = [];

    const { data: qs } = await this.supabase.client
      .from('quotations')
      .select(
        'id, quotation_number, quotation_status, request_type, event_date, event_type, people_count, contact_name, created_at, clients (name)',
      )
      .eq('company_id', companyId)
      .in('quotation_status', [
        'solicitada',
        'enviada',
        'aceptada',
        'realizada',
      ]);
    const cotizaciones = (qs ?? []) as unknown as {
      id: string;
      quotation_number: number;
      quotation_status: string;
      request_type: string;
      event_date: string | null;
      event_type: string | null;
      people_count: number | null;
      contact_name: string | null;
      created_at: string;
      clients: { name: string } | null;
    }[];
    const eventos = cotizaciones.filter(
      (q) =>
        q.request_type === 'cotizacion' &&
        ['aceptada', 'realizada'].includes(q.quotation_status),
    );
    const idsEventos = eventos.map((q) => q.id);

    // 1. Pagos vencidos (lo abonado no cubre la cuota)
    if (idsEventos.length > 0) {
      const { data: pagos } = await this.supabase.client
        .from('payments')
        .select(
          'id, quotation_id, payment_number, amount, due_date, status, payment_transactions (amount)',
        )
        .in('quotation_id', idsEventos)
        .neq('status', 'pagado')
        .lt('due_date', hoy);
      (pagos ?? []).forEach((p) => {
        const abonado = (
          (p.payment_transactions ?? []) as { amount: number }[]
        ).reduce((s, t) => s + (t.amount || 0), 0);
        if (abonado >= p.amount) return;
        const evento = eventos.find((e) => e.id === p.quotation_id);
        avisos.push({
          company_id: companyId,
          dedupe_key: `vencido-${p.id}-${String(p.due_date).slice(0, 10)}`,
          tipo: 'vencido',
          titulo: `Pago vencido — ${evento?.clients?.name ?? 'cliente'}`,
          detalle: `Cuota ${p.payment_number} por ${clp(p.amount - abonado)} sigue impaga`,
          destino: `/evento/${p.quotation_id}`,
        });
      });
    }

    // 2. Evento en los próximos 3 días
    const limite = new Date(Date.now() + 3 * 86400000)
      .toISOString()
      .slice(0, 10);
    eventos
      .filter((e) => {
        const f = String(e.event_date ?? '').slice(0, 10);
        return f >= hoy && f <= limite;
      })
      .forEach((e) => {
        avisos.push({
          company_id: companyId,
          dedupe_key: `evento-${e.id}-${String(e.event_date).slice(0, 10)}`,
          tipo: 'evento',
          titulo: `Evento próximo — ${e.clients?.name ?? ''}`,
          detalle: [
            e.event_type,
            e.people_count && `${e.people_count} personas`,
          ]
            .filter(Boolean)
            .join(' · '),
          destino: `/evento/${e.id}`,
        });
      });

    // 3. Solicitud nueva (lead sin atender)
    cotizaciones
      .filter(
        (q) =>
          q.request_type === 'requerimiento' &&
          q.quotation_status === 'solicitada',
      )
      .forEach((q) => {
        avisos.push({
          company_id: companyId,
          dedupe_key: `solicitud-${q.id}`,
          tipo: 'solicitud',
          titulo: `Nueva solicitud — ${q.contact_name || q.clients?.name || ''}`,
          detalle: [
            q.event_type,
            q.people_count && `${q.people_count} personas`,
          ]
            .filter(Boolean)
            .join(' · '),
          destino: '/leads',
        });
      });

    // 4. Cotización sin respuesta hace 7+ días
    const hace7 = Date.now() - 7 * 86400000;
    cotizaciones
      .filter(
        (q) =>
          q.request_type === 'cotizacion' &&
          q.quotation_status === 'enviada' &&
          new Date(q.created_at).getTime() < hace7,
      )
      .forEach((q) => {
        avisos.push({
          company_id: companyId,
          dedupe_key: `frio-${q.id}`,
          tipo: 'frio',
          titulo: `Cotización sin respuesta — ${q.clients?.name ?? ''}`,
          detalle: `La N° ${q.quotation_number} sigue Enviada — ¿un llamado?`,
          destino: `/evento/${q.id}`,
        });
      });

    return avisos;
  }
}
