import type { PinoLogger } from 'nestjs-pino';
import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { User } from 'src/users/entities/user.entity';
import { mockPinoLogger } from '../../../../testing/mocks';
import {
  choquesDe,
  type CotizacionDelChoque,
  notaDelChoque,
  rangoDe,
  tieneExclusividad,
} from '../../../choques/choques';
import type {
  ChoquesRepository,
  FilaDelChoque,
} from '../../../choques/choques.repository';
import { ChoquesDeFechaService } from '../../../choques/choques.service';
import { fechaEnChile } from '../../../seguimiento/elegibles';

// Los choques de fecha (Felipe, 18-10-2026; mapa 02 §5.6): cuando una
// cotización se acepta, las vivas que caen en sus fechas llevan un aviso
// rojo hasta que alguien decide, una por una. Sin atajo por evento. Datos
// de prueba con las formas de los casos reales de ese día.

const HOY = '2026-10-18';
const cot = (
  id: string,
  n: number,
  desde: string,
  hasta: string | null = null,
  extra: Partial<CotizacionDelChoque> = {},
): CotizacionDelChoque => ({
  id,
  quotation_number: n,
  event_date: `${desde}T00:00:00+00:00`,
  event_end_date: hasta ? `${hasta}T00:00:00+00:00` : null,
  cliente: `Cliente ${n}`,
  ...extra,
});

describe('qué choca (mapa 02 §5.6)', () => {
  it('una viva que cae dentro de una estadía aceptada choca (la forma de la 500 de Rudel)', () => {
    const r = choquesDe({
      vivas: [cot('v', 634, '2026-11-09'), cot('w', 586, '2026-11-25')],
      aceptadas: [cot('a', 500, '2026-11-09', '2026-11-22')],
      decisiones: [],
      hoy: HOY,
    });
    expect(r).toEqual([
      {
        quotation_id: 'v',
        quotation_number: 634,
        estado: 'pendiente',
        aceptada: {
          id: 'a',
          numero: 500,
          cliente: 'Cliente 500',
          desde: '2026-11-09',
          hasta: '2026-11-22',
          exclusiva: false,
        },
      },
    ]);
  });

  it('una viva de varios días choca si se topa en cualquier día', () => {
    expect(
      choquesDe({
        vivas: [cot('v', 569, '2026-11-24', '2026-11-27')],
        aceptadas: [cot('a', 384, '2026-11-27', null, { exclusiva: true })],
        decisiones: [],
        hoy: HOY,
      })[0].aceptada,
    ).toMatchObject({ numero: 384, exclusiva: true });
  });

  it('lo que ya pasó no choca, y una cotización no choca consigo misma', () => {
    expect(
      choquesDe({
        vivas: [cot('v', 1, '2026-10-10'), cot('a', 2, '2026-11-01')],
        aceptadas: [cot('x', 3, '2026-10-10'), cot('a', 2, '2026-11-01')],
        decisiones: [],
        hoy: HOY,
      }),
    ).toEqual([]);
  });

  it('lo decidido con esas fechas no vuelve; si una cambia de fecha, vuelve', () => {
    const base = {
      vivas: [cot('v', 634, '2026-11-12')],
      aceptadas: [cot('a', 500, '2026-11-09', '2026-11-22')],
      hoy: HOY,
    };
    const decidida = {
      quotation_id: 'v',
      aceptada_id: 'a',
      decision: 'puede_seguir' as const,
      fechas_viva: '2026-11-12..2026-11-12',
      fechas_aceptada: '2026-11-09..2026-11-22',
    };
    expect(choquesDe({ ...base, decisiones: [decidida] })).toEqual([]);
    // La viva se movió un día, pero sigue dentro de la estadía: se revisa
    // de nuevo, porque la decisión fue sobre "esa fecha".
    expect(
      choquesDe({
        ...base,
        vivas: [cot('v', 634, '2026-11-13')],
        decisiones: [decidida],
      }),
    ).toHaveLength(1);
  });

  it('«Hay que gestionar» no lo hace desaparecer: queda como tope de calendario hasta que se resuelva', () => {
    const base = {
      vivas: [cot('v', 459, '2026-11-27')],
      aceptadas: [cot('a', 384, '2026-11-27', null, { exclusiva: true })],
      hoy: HOY,
    };
    const gestionar = {
      quotation_id: 'v',
      aceptada_id: 'a',
      decision: 'gestionar' as const,
      fechas_viva: '2026-11-27..2026-11-27',
      fechas_aceptada: '2026-11-27..2026-11-27',
    };
    expect(choquesDe({ ...base, decisiones: [gestionar] })[0].estado).toBe(
      'gestionar',
    );
    // Se movió la fecha y ya no se topan: el tope se va solo.
    expect(
      choquesDe({
        ...base,
        vivas: [cot('v', 459, '2026-11-28')],
        decisiones: [gestionar],
      }),
    ).toEqual([]);
  });

  it('un fin anterior al inicio (error de datos, como la 498) cuenta como un día', () => {
    expect(
      rangoDe({
        event_date: '2026-12-04T00:00:00+00:00',
        event_end_date: '2026-11-04T00:00:00+00:00',
      }),
    ).toEqual({ desde: '2026-12-04', hasta: '2026-12-04' });
  });

  it('la exclusividad sale del ítem del catálogo', () => {
    expect(
      tieneExclusividad({
        fixed_services: [{ name: 'Exclusividad Vie a Dom (Empresas)' }],
      }),
    ).toBe(true);
    expect(tieneExclusividad({ fixed_services: [{ name: 'Salón' }] })).toBe(
      false,
    );
  });

  it('las líneas de la bitácora', () => {
    const a = {
      id: 'a',
      numero: 500,
      cliente: 'Rudel S.A.',
      desde: '2026-11-09',
      hasta: '2026-11-22',
      exclusiva: false,
    };
    expect(notaDelChoque(a, 'puede_seguir')).toBe(
      'Revisado el choque de fecha con la N° 500 (Rudel S.A.), aceptada del 09-11 al 22-11: puede seguir con su fecha.',
    );
    expect(
      notaDelChoque(
        {
          ...a,
          numero: 384,
          desde: '2026-11-27',
          hasta: '2026-11-27',
          exclusiva: true,
        },
        'gestionar',
      ),
    ).toBe(
      'Choca con la N° 384 (Rudel S.A.), aceptada el 27-11, con exclusividad: hay que gestionar, mover la fecha o descartar.',
    );
  });
});

describe('ChoquesDeFechaService.decidir', () => {
  const usuario = {
    id: 'u1',
    company_id: 1,
    role: 'administrador',
    email: 'felipe@valledelsolquillon.cl',
  } as unknown as User;
  const fila = (
    id: string,
    n: number,
    estado: string,
    desde: string,
    hasta: string | null = null,
    items: unknown = {},
  ): FilaDelChoque => ({
    id,
    quotation_number: n,
    quotation_status: estado,
    event_date: `${desde}T00:00:00+00:00`,
    event_end_date: hasta ? `${hasta}T00:00:00+00:00` : null,
    items,
    clients: { name: `Cliente ${n}` },
  });
  // Fechas lejanas: la prueba no caduca.
  const armar = (viva: FilaDelChoque, aceptada: FilaDelChoque) => {
    const repositorio = {
      una: jest.fn((_: number, id: string) =>
        Promise.resolve(id === viva.id ? viva : aceptada),
      ),
      guardar: jest.fn().mockResolvedValue(undefined),
    };
    const bitacora = { create: jest.fn().mockResolvedValue({ id: 900 }) };
    const servicio = new ChoquesDeFechaService(
      repositorio as unknown as ChoquesRepository,
      bitacora as unknown as QuotationFollowupsService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    return { servicio, repositorio, bitacora };
  };

  it('«Sí, puede seguir»: línea en la bitácora y la decisión con las fechas de ahora', async () => {
    const { servicio, repositorio, bitacora } = armar(
      fila('v', 634, 'enviada', '2099-11-12'),
      fila('a', 500, 'aceptada', '2099-11-09', '2099-11-22'),
    );

    await servicio.decidir(usuario, 'v', 'a', 'puede_seguir');

    expect(bitacora.create).toHaveBeenCalledWith(usuario, {
      quotation_id: 'v',
      tipo: 'otro',
      note: 'Revisado el choque de fecha con la N° 500 (Cliente 500), aceptada del 09-11 al 22-11: puede seguir con su fecha.',
    });
    expect(repositorio.guardar).toHaveBeenCalledWith({
      company_id: 1,
      quotation_id: 'v',
      aceptada_id: 'a',
      decision: 'puede_seguir',
      fechas_viva: '2099-11-12..2099-11-12',
      fechas_aceptada: '2099-11-09..2099-11-22',
      followup_id: 900,
      decidido_por: 'u1',
    });
  });

  it('«Hay que gestionar»: una llamada comprometida para hoy, con la exclusividad dicha', async () => {
    const { servicio, bitacora } = armar(
      fila('v', 569, 'en_negociacion', '2099-11-27'),
      fila('a', 384, 'aceptada', '2099-11-27', null, {
        fixed_services: [{ name: 'Exclusividad Full (Empresas)' }],
      }),
    );

    await servicio.decidir(usuario, 'v', 'a', 'gestionar');

    expect(bitacora.create).toHaveBeenCalledWith(usuario, {
      quotation_id: 'v',
      tipo: 'llamada',
      note: 'Choca con la N° 384 (Cliente 384), aceptada el 27-11, con exclusividad: hay que gestionar, mover la fecha o descartar.',
      next_contact_date: fechaEnChile(),
    });
  });

  it('si ya no chocan o cambió un estado, 409 sin tocar la bitácora', async () => {
    const corrida = armar(
      fila('v', 634, 'enviada', '2099-12-01'),
      fila('a', 500, 'aceptada', '2099-11-09', '2099-11-22'),
    );
    await expect(
      corrida.servicio.decidir(usuario, 'v', 'a', 'puede_seguir'),
    ).rejects.toThrow('Ya no chocan');
    expect(corrida.bitacora.create).not.toHaveBeenCalled();

    const cerrada = armar(
      fila('v', 634, 'rechazada', '2099-11-12'),
      fila('a', 500, 'aceptada', '2099-11-09', '2099-11-22'),
    );
    await expect(
      cerrada.servicio.decidir(usuario, 'v', 'a', 'gestionar'),
    ).rejects.toThrow('cambió de estado');
    expect(cerrada.bitacora.create).not.toHaveBeenCalled();
  });
});
