import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { mockPinoLogger } from '../../testing/mocks';
import { RechazarSolicitudDto } from '../solicitudes/solicitudes.dto';
import type { Solicitud } from '../solicitudes/solicitudes.repository';
import { SolicitudesService } from '../solicitudes/solicitudes.service';

/**
 * LAS SOLICITUDES DE RECEPCIÓN (doc 19 §9.45). Felipe, 09-11: recepción
 * deja de emitir al SII; manda una solicitud y la emite quien tiene
 * «Aprobar y emitir solicitudes», que revisa que nada se boletee dos veces.
 */

const RECEPCION = {
  id: 'u-recepcion',
  company_id: 1,
  role: 'recepcion',
  full_name: 'Recepción',
} as never;
const OPER = {
  id: 'u-camila',
  company_id: 1,
  role: 'operaciones',
  full_name: 'Camila Carvajal',
} as never;

const TARIFARIO = [
  {
    id: 2,
    nombre: 'Tinaja',
    precio: 30000,
    unidad: 'unidad',
    activo: true,
  },
];

const armar = (opciones: { turno?: { id: number } | null } = {}) => {
  const filas = new Map<number, Solicitud>();
  let siguiente = 1;
  const repo = {
    crear: jest.fn().mockImplementation((f: Partial<Solicitud>) => {
      const s = {
        ...f,
        id: siguiente++,
        estado: 'pendiente',
        created_at: '2026-11-09T15:00:00Z',
        resuelta_por: null,
        resuelta_por_nombre: null,
        resuelta_en: null,
        motivo_rechazo: null,
        error: null,
        documento_id: null,
        documento: null,
      } as Solicitud;
      filas.set(s.id, s);
      return Promise.resolve(s);
    }),
    una: jest.fn((_c: number, id: number) =>
      Promise.resolve(filas.get(id) ?? null),
    ),
    lista: jest.fn(() => Promise.resolve([...filas.values()].reverse())),
    tomar: jest.fn(
      (_c: number, id: number, quien: { resuelta_por_nombre: string }) => {
        const s = filas.get(id);
        if (!s || s.estado !== 'pendiente') return Promise.resolve(null);
        Object.assign(s, { estado: 'emitiendo', ...quien });
        return Promise.resolve(s);
      },
    ),
    aprobar: jest.fn((_c: number, id: number, documentoId: number) => {
      Object.assign(filas.get(id) as Solicitud, {
        estado: 'aprobada',
        documento_id: documentoId,
        documento: { folio: 45010, estado: 'emitido', pdf_path: 'x.pdf' },
      });
      return Promise.resolve();
    }),
    devolver: jest.fn((_c: number, id: number, motivo: string) => {
      Object.assign(filas.get(id) as Solicitud, {
        estado: 'pendiente',
        error: motivo,
      });
      return Promise.resolve();
    }),
    anotarError: jest.fn(() => Promise.resolve()),
    rechazar: jest.fn(
      (_c: number, id: number, r: { motivo_rechazo: string | null }) => {
        const s = filas.get(id);
        if (!s || s.estado !== 'pendiente') return Promise.resolve(null);
        Object.assign(s, { estado: 'rechazada', ...r });
        return Promise.resolve(s);
      },
    ),
  };
  const boletas = {
    tarifario: jest.fn().mockResolvedValue(TARIFARIO),
    emitirSolicitada: jest.fn().mockResolvedValue({
      documento: {
        id: 900,
        tipo: 39,
        folio: 45010,
        estado: 'emitido',
        total: 60000,
        ambiente: 'produccion',
        pdf_path: 'x.pdf',
      },
      aviso: null,
    }),
  };
  const facturas = {
    revisadaParaSolicitar: jest.fn(),
    emitirPedida: jest.fn(),
  };
  const caja = {
    turnoAbierto: jest
      .fn()
      .mockResolvedValue(
        opciones.turno === undefined
          ? { id: 7, abierta_en: '2026-11-09T12:00:00Z' }
          : opciones.turno,
      ),
  };
  const conexion = { procesar: jest.fn(), ambiente: 'produccion' };
  const servicio = new SolicitudesService(
    repo as never,
    boletas as never,
    facturas as never,
    caja as never,
    { de: () => conexion } as never,
    mockPinoLogger() as never,
  );
  return { servicio, repo, boletas, facturas, caja, conexion, filas };
};

const BOLETA = {
  lineas: [{ tarifario_id: 2, cantidad: 2 }],
  cabana: 'Cabaña 4',
  correo: 'huesped@correo.cl',
  medio_de_pago: 'efectivo' as const,
};

describe('Recepción manda la solicitud (§9.45)', () => {
  it('la boleta queda guardada con todo para emitirla, en el turno abierto, sin ir a facturacion.cl', async () => {
    const { servicio, repo, conexion } = armar();
    const v = await servicio.solicitarBoleta(RECEPCION, BOLETA);
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 39,
        total: 60000,
        medio_de_pago: 'efectivo',
        correo: 'huesped@correo.cl',
        imprimir: false,
        para: 'Cabaña 4',
        turno_de_caja_id: 7,
        solicitada_por_nombre: 'Recepción',
        solicitada_por_cargo: 'recepcion',
        detalle: [
          expect.objectContaining({
            tarifario_id: 2,
            cantidad: 2,
            precio: 30000,
            descripcion: 'Cabaña 4 · Tinaja',
          }),
        ],
      }),
    );
    expect(conexion.procesar).not.toHaveBeenCalled();
    expect(v).toMatchObject({ estado: 'pendiente', total: 60000 });
  });

  it('sin caja abierta no se manda, y los otros cargos emiten directo', async () => {
    const cerrada = armar({ turno: null });
    await expect(
      cerrada.servicio.solicitarBoleta(RECEPCION, BOLETA),
    ).rejects.toThrow('La caja de recepción está cerrada');
    const { servicio, repo } = armar();
    await expect(servicio.solicitarBoleta(OPER, BOLETA)).rejects.toThrow(
      'tu cargo emite directo',
    );
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('la factura va como solicitud, al contado con su medio de pago', async () => {
    const { servicio, facturas, repo } = armar();
    facturas.revisadaParaSolicitar.mockResolvedValue({
      pedida: {
        forma_de_pago: 1,
        medio_de_pago: 'debito',
        receptor: { rut: '76123456-0', razon_social: 'Empresa SpA' },
      },
      revision: {
        ok: true,
        montos: { total: 119000 },
        lineas: [{ descripcion: 'Tinaja', cantidad: 1, precio: 100000 }],
        faltan: [],
        problemas: [],
      },
    });
    const v = await servicio.solicitarFactura(RECEPCION, {
      forma_de_pago: 1,
    } as never);
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 33,
        total: 119000,
        medio_de_pago: 'debito',
        para: 'Empresa SpA',
      }),
    );
    // La factura guarda el neto: la pantalla la ve con IVA.
    expect(v.lineas[0].monto).toBe(119000);
    expect(v.plazo_dias).toBeNull();
  });

  it('la factura a crédito también va como solicitud (§9.46): sin medio de pago, con su plazo y con la caja abierta', async () => {
    const { servicio, facturas, repo } = armar();
    const A_CREDITO = {
      pedida: {
        forma_de_pago: 2,
        plazo_dias: 30,
        medio_de_pago: null,
        receptor: { rut: '76123456-0', razon_social: 'Empresa SpA' },
      },
      revision: {
        ok: true,
        montos: { total: 119000 },
        lineas: [{ descripcion: 'Tinaja', cantidad: 1, precio: 100000 }],
        faltan: [],
        problemas: [],
      },
    };
    facturas.revisadaParaSolicitar.mockResolvedValue(A_CREDITO);
    const v = await servicio.solicitarFactura(RECEPCION, {
      forma_de_pago: 2,
    } as never);
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 33,
        total: 119000,
        medio_de_pago: null,
        turno_de_caja_id: 7,
      }),
    );
    expect(v).toMatchObject({ medio_de_pago: null, plazo_dias: 30 });
    // Aprobada, su documento sale sin turno: no entró plata a la caja.
    facturas.emitirPedida.mockResolvedValue({
      id: 902,
      tipo: 33,
      folio: 396,
      estado: 'emitido',
      total: 119000,
    });
    await servicio.aprobar(OPER, v.id);
    expect(facturas.emitirPedida).toHaveBeenCalledWith(
      OPER,
      expect.objectContaining({ forma_de_pago: 2, medio_de_pago: null }),
      null,
    );
    // Sin la caja abierta tampoco se manda: es el mismo proceso.
    const cerrada = armar({ turno: null });
    cerrada.facturas.revisadaParaSolicitar.mockResolvedValue(A_CREDITO);
    await expect(
      cerrada.servicio.solicitarFactura(RECEPCION, {
        forma_de_pago: 2,
      } as never),
    ).rejects.toThrow('La caja de recepción está cerrada');
    expect(cerrada.repo.crear).not.toHaveBeenCalled();
  });
});

describe('Aprobar y emitir, o rechazar (§9.45)', () => {
  it('aprobar emite con lo guardado y su turno, y una segunda vez no la emite de nuevo', async () => {
    const { servicio, boletas } = armar();
    const s = await servicio.solicitarBoleta(RECEPCION, BOLETA);
    const r = await servicio.aprobar(OPER, s.id);
    expect(boletas.emitirSolicitada).toHaveBeenCalledWith(
      OPER,
      expect.objectContaining({
        turnoDeCajaId: 7,
        medioDePago: 'efectivo',
        correo: 'huesped@correo.cl',
        cabana: 'Cabaña 4',
      }),
    );
    expect(r.solicitud).toMatchObject({
      estado: 'aprobada',
      resuelta_por_nombre: 'Camila Carvajal',
    });
    expect(r.documento).toMatchObject({ folio: 45010 });
    await expect(servicio.aprobar(OPER, s.id)).rejects.toThrow(
      ConflictException,
    );
    expect(boletas.emitirSolicitada).toHaveBeenCalledTimes(1);
  });

  it('si no salió, vuelve a esperar con el porqué; si no se sabe, queda emitiendo', async () => {
    const { servicio, boletas, repo, filas } = armar();
    const s = await servicio.solicitarBoleta(RECEPCION, BOLETA);
    boletas.emitirSolicitada.mockRejectedValueOnce(
      new BadRequestException('facturacion.cl no aceptó la boleta: X'),
    );
    await expect(servicio.aprobar(OPER, s.id)).rejects.toThrow('X');
    expect(filas.get(s.id)).toMatchObject({ estado: 'pendiente' });
    boletas.emitirSolicitada.mockRejectedValueOnce(
      new InternalServerErrorException('salió, pero Eventia no la pudo anotar'),
    );
    await expect(servicio.aprobar(OPER, s.id)).rejects.toThrow(
      'no la pudo anotar',
    );
    expect(repo.anotarError).toHaveBeenCalled();
    expect(filas.get(s.id)).toMatchObject({ estado: 'emitiendo' });
    await expect(servicio.aprobar(OPER, s.id)).rejects.toThrow(
      'ya se está emitiendo',
    );
  });

  it('la factura aprobada sale con su pedido, el medio que quedó y su turno', async () => {
    const { servicio, facturas, filas } = armar();
    facturas.revisadaParaSolicitar.mockResolvedValue({
      pedida: {
        forma_de_pago: 1,
        medio_de_pago: 'debito',
        receptor: { rut: '76123456-0', razon_social: 'Empresa SpA' },
      },
      revision: {
        ok: true,
        montos: { total: 119000 },
        lineas: [],
        faltan: [],
        problemas: [],
      },
    });
    const s = await servicio.solicitarFactura(RECEPCION, {
      forma_de_pago: 1,
    } as never);
    // La revisión de la caja lo corrigió a crédito.
    (filas.get(s.id) as Solicitud).medio_de_pago = 'credito';
    facturas.emitirPedida.mockResolvedValue({
      id: 901,
      tipo: 33,
      folio: 395,
      estado: 'emitido',
      total: 119000,
    });
    await servicio.aprobar(OPER, s.id);
    expect(facturas.emitirPedida).toHaveBeenCalledWith(
      OPER,
      expect.objectContaining({ medio_de_pago: 'credito' }),
      7,
    );
  });

  it('la rechazada nunca va al SII, y lo resuelto no se resuelve de nuevo', async () => {
    const { servicio, boletas } = armar();
    const s = await servicio.solicitarBoleta(RECEPCION, BOLETA);
    const r = await servicio.rechazar(OPER, s.id, { motivo: 'Ya boleteada' });
    expect(r).toMatchObject({
      estado: 'rechazada',
      motivo_rechazo: 'Ya boleteada',
    });
    await expect(servicio.aprobar(OPER, s.id)).rejects.toThrow('ya se rechazó');
    expect(boletas.emitirSolicitada).not.toHaveBeenCalled();
  });

  it('la lista avisa dos iguales del mismo día (mismo tipo, total y medio)', async () => {
    const { servicio } = armar();
    const a = await servicio.solicitarBoleta(RECEPCION, BOLETA);
    const b = await servicio.solicitarBoleta(RECEPCION, BOLETA);
    const l = await servicio.lista(OPER);
    expect(l.pendientes).toBe(2);
    expect(l.solicitudes.find((s) => s.id === b.id)?.igual_a).toBe(a.id);
  });

  it('el motivo del rechazo cabe en 300', async () => {
    const malo = plainToInstance(RechazarSolicitudDto, {
      motivo: 'x'.repeat(301),
    });
    expect(await validate(malo)).toHaveLength(1);
    expect(
      await validate(plainToInstance(RechazarSolicitudDto, {})),
    ).toHaveLength(0);
  });
});
