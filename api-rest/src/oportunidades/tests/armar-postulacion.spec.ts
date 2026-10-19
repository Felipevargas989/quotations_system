import { BadRequestException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { User } from 'src/users/entities/user.entity';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import type { GeneracionService } from '../generacion/generacion.service';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { ArmarLaOfertaService } from '../postulacion/armar-la-oferta.service';
import {
  ArmarPostulacionService,
  pidenPropuesta,
} from '../postulacion/armar-postulacion.service';
import type { CotizacionDeLaPostulacionService } from '../postulacion/cotizacion-de-la-postulacion.service';
import type { PostulacionRepository } from '../postulacion/postulacion.repository';

// «ARMAR POSTULACIÓN» (decisión 35, 19-10): un solo botón con el precio.
// La oferta primero; cuando queda lista, los anexos con ese precio, la
// propuesta técnica si va y la cotización vinculada igual a lo postulado.

const USUARIO = {
  id: 'cuenta-1',
  company_id: 1,
  role: 'administrador',
} as unknown as User;

const FUNCIONARIO = {
  requisitos: [
    { que: 'Formulario Anexo N°1 Identificación del Oferente, firmado' },
    {
      que: 'Formulario Anexo N°4 Calidad de la oferta (o formato propio) con el detalle de todos los requerimientos técnicos',
    },
  ],
  formularios: [],
};

function armar() {
  const oferta = {
    pedir: jest.fn().mockResolvedValue({ id: 21, estado: 'procesando' }),
  };
  const documentos = {
    generarAnexos: jest.fn().mockResolvedValue({ id: 22 }),
    crearPropuesta: jest.fn().mockResolvedValue({ id: 23 }),
  };
  const cotizacion = { llevar: jest.fn().mockResolvedValue({}) };
  const generaciones = {
    anotarParametros: jest.fn().mockResolvedValue(undefined),
  };
  const analisis = {
    ultimo: jest
      .fn()
      .mockResolvedValue({ estado: 'listo', resultado: FUNCIONARIO }),
  };
  const oferente = {
    oferente: jest.fn().mockResolvedValue({
      razon_social: 'VALLE DEL SOL QUILLON SPA',
      rut: '77.701.305-K',
    }),
  };
  const repo = {
    oportunidad: jest.fn().mockResolvedValue({ id: 40, quotation_id: null }),
  };
  const servicio = new ArmarPostulacionService(
    oferta as unknown as ArmarLaOfertaService,
    documentos as unknown as GeneracionService,
    cotizacion as unknown as CotizacionDeLaPostulacionService,
    generaciones as unknown as GeneracionRepository,
    analisis as unknown as AnalisisRepository,
    oferente as unknown as OferenteRepository,
    repo as unknown as PostulacionRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return {
    oferta,
    documentos,
    cotizacion,
    generaciones,
    analisis,
    oferente,
    repo,
    servicio,
  };
}

describe('Armar postulación', () => {
  it('la propuesta técnica va si las bases la piden o aceptan formato propio', () => {
    expect(pidenPropuesta(FUNCIONARIO)).toBe(true);
    expect(
      pidenPropuesta({ requisitos: [{ que: 'Propuesta técnica firmada' }] }),
    ).toBe(true);
    expect(
      pidenPropuesta({
        requisitos: [{ que: 'Patente municipal vigente' }],
        formularios: [
          { nombre: 'Anexo N°6 Oferta técnica de la UTP', aplica: false },
        ],
      }),
    ).toBe(false);
    expect(pidenPropuesta(null)).toBe(false);
  });

  it('pide la oferta con el precio y lo que sigue', async () => {
    const { servicio, oferta } = armar();
    const fila = await servicio.armar(USUARIO, 40, 11_900_000);
    expect(fila).toEqual({ id: 21, estado: 'procesando' });
    expect(oferta.pedir).toHaveBeenCalledWith(1, 'cuenta-1', 40, {
      parametros: { postulacion: { total: 11_900_000, propuesta: true } },
      despues: expect.any(Function),
    });
  });

  it('sin la razón social y el RUT de «Mi empresa» no parte: los anexos los necesitan', async () => {
    const { servicio, oferente, oferta } = armar();
    oferente.oferente.mockResolvedValue({ razon_social: 'VALLE DEL SOL' });
    await expect(servicio.armar(USUARIO, 40, 11_900_000)).rejects.toThrow(
      BadRequestException,
    );
    expect(oferta.pedir).not.toHaveBeenCalled();
  });

  it('con la oferta lista: los anexos con el precio y la propuesta técnica', async () => {
    const { servicio, oferta, documentos, cotizacion, generaciones } = armar();
    await servicio.armar(USUARIO, 40, 11_900_000);
    const [, , , encadenar] = oferta.pedir.mock.calls[0] as [
      number,
      string,
      number,
      { despues: (id: number) => Promise<void> },
    ];
    const { despues } = encadenar;
    await despues(21);

    expect(documentos.generarAnexos).toHaveBeenCalledWith(1, 'cuenta-1', 40, {
      monto_total: 11_900_000,
    });
    expect(documentos.crearPropuesta).toHaveBeenCalledWith(1, 'cuenta-1', 40);
    // Sin cotización vinculada, no se toca ninguna.
    expect(cotizacion.llevar).not.toHaveBeenCalled();
    expect(generaciones.anotarParametros).not.toHaveBeenCalled();
  });

  it('sin propuesta si las bases no la piden; la cotización vinculada queda igual a lo postulado, con el precio', async () => {
    const { servicio, documentos, cotizacion, repo } = armar();
    repo.oportunidad.mockResolvedValue({ id: 40, quotation_id: 'q-1' });
    await servicio.seguir(USUARIO, 40, 21, {
      total: 11_900_000,
      propuesta: false,
    });
    expect(documentos.crearPropuesta).not.toHaveBeenCalled();
    expect(cotizacion.llevar).toHaveBeenCalledWith(
      USUARIO,
      40,
      undefined,
      11_900_000,
    );
  });

  it('lo que no alcanzó a partir queda anotado en la oferta, en palabras', async () => {
    const { servicio, documentos, generaciones } = armar();
    documentos.generarAnexos.mockRejectedValue(
      new BadRequestException('No hay formularios para llenar.'),
    );
    await servicio.seguir(USUARIO, 40, 21, {
      total: 11_900_000,
      propuesta: true,
    });
    expect(documentos.crearPropuesta).toHaveBeenCalled();
    expect(generaciones.anotarParametros).toHaveBeenCalledWith(1, 21, {
      postulacion: {
        total: 11_900_000,
        propuesta: true,
        problemas: ['Los anexos: No hay formularios para llenar.'],
      },
    });
  });
});
