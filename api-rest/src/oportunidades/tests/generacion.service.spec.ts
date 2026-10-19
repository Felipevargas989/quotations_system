import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Plan } from '../generacion/generacion.service';
import {
  LO_SUBCONTRATADO,
  SOLO_LO_QUE_PIDEN,
} from '../generacion/instrucciones';
import { salidasDeLaFirma } from '../generacion/revision';
import { trabajarEnElTaller } from '../generacion/taller';
import {
  EL_DETALLE_EN_EL_FORMULARIO,
  ESCRIBIR_LA_OFERTA,
} from '../postulacion/la-oferta-en-texto';
import {
  adjunto,
  armar,
  CUENTA,
  entorno,
  OFERENTE,
  planDe,
  WORD,
} from './generacion-de-prueba';
import { wordCon } from './zip-de-prueba';

// ANEXOS LLENOS, FIRMA Y PROPUESTA TÉCNICA (doc 17, sprint 3, paso 4). Lo
// que se pide al taller, lo que se revisa de lo que entrega y cómo se
// guarda en «Mi postulación». El taller va de mentira.

jest.mock('../generacion/taller', () => ({
  ...jest.requireActual<object>('../generacion/taller'),
  trabajarEnElTaller: jest.fn(),
}));
const taller = trabajarEnElTaller as jest.Mock;
beforeEach(() => taller.mockReset());

describe('Generar anexos', () => {
  it('llena los Word de las bases (el .doc antiguo lo convierte el taller), SIN firma, con el total que puso la empresa (neto e IVA los calcula el motor)', () =>
    entorno(async () => {
      const { repo, oferente, servicio, ejecutar } = armar();
      // Los respaldos de experiencia de la carpeta (decisión 34).
      oferente.respaldos.mockResolvedValue([
        {
          numero: '4352-103-SE23',
          mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
          contrato: 'Cena del Día del Funcionario 2023',
          anio: 2023,
          monto: 11_782_499,
          fuente: 'mercado_publico',
          archivo: 'OC 4352-103-SE23.pdf',
        },
      ]);

      const fila = await servicio.generarAnexos(1, CUENTA, 40, {
        monto_total: 11_900_000,
      });

      expect(fila).toMatchObject({ id: 9, estado: 'procesando' });
      // Sin elegir van los Word, también el .doc (18-10: Lota y Yumbel los
      // traían así); el PDF de las bases, no.
      expect(repo.crearGeneracion).toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: 1,
          oportunidad_id: 40,
          tipo: 'anexos',
          modelo: 'claude-sonnet-5-5',
          analisis_id: 5,
          parametros: { monto_total: 11_900_000, adjuntos: [6, 7] },
          archivos: [
            { id: 6, nombre: 'Formularios_Anexos.docx' },
            { id: 7, nombre: 'Anexo antiguo.doc' },
          ],
          no_leidos: [],
          pedido_por: 'perfil-1',
        }),
      );
      const plan = planDe(ejecutar);
      expect(plan.entradas).toEqual([
        {
          enElTaller: 'anexo_6.docx',
          tipo: WORD,
          ruta: 'c1/oportunidades/40/x_Formularios_Anexos.docx',
        },
        {
          enElTaller: 'anexo_7.doc',
          tipo: 'application/msword',
          ruta: 'c1/oportunidades/40/x_Anexo antiguo.doc',
        },
      ]);
      // Un Word por formulario, también de un Word del comprador (Felipe,
      // 19-10: "tienen que quedar por separado cada uno, el 1, el 2, el 3").
      expect(plan.salidas).toEqual([
        {
          enElTaller: 'formulario_6_',
          nombre: 'Formularios_Anexos',
          origen: 'generado',
          viene_de: 6,
          prefijo: true,
        },
        {
          enElTaller: 'formulario_7_',
          nombre: 'Anexo antiguo',
          origen: 'generado',
          viene_de: 7,
          prefijo: true,
        },
      ]);
      expect(plan.habilidades).toEqual([
        expect.objectContaining({ skill_id: 'docx' }),
      ]);
      expect(plan.sistema).toContain('soffice --headless --convert-to docx');
      expect(plan.sistema).toContain(
        'Después SEPARA cada Word lleno en un Word por formulario',
      );
      // La firma nunca partida ni sola.
      expect(plan.sistema).toContain('keep_with_next');
      expect(plan.sistema).not.toContain('REESCRIBE');
      expect(plan.sistema).toContain(
        'Total con IVA: $11.900.000. Neto: $10.000.000. IVA (19%): $1.900.000.',
      );
      expect(plan.sistema).toContain('NO firmes');
      expect(plan.sistema).toContain(
        'anexo_6.docx es «Formularios_Anexos.docx»',
      );
      expect(plan.sistema).toContain('RUT: 77.701.305-K');
      expect(plan.sistema).toContain(
        '2. [tecnico, obligatorio] Mesas y sillas para 160 personas (pág. 18)',
      );
      // La experiencia de verdad, de Eventia, y lo que no se promete.
      expect(plan.sistema).toContain(
        '- 2025-12-12 · Celebraciones · Municipalidad de Bulnes · 150 personas',
      );
      expect(plan.sistema).toContain(
        '- [hay que conseguirlo] Show de baile de 40 minutos (No hay show en tu carta.)',
      );
      expect(plan.sistema).toContain('[POR CONFIRMAR: qué falta]');
      // Más es menos (decisión 32, 19-10): solo lo que piden las bases; lo
      // subcontratado, tal cual lo dicen, y la experiencia justa.
      expect(plan.sistema).toContain(SOLO_LO_QUE_PIDEN);
      expect(plan.sistema).toContain(LO_SUBCONTRATADO);
      expect(plan.sistema).toContain('si 6 o más dan el máximo, pon 6 a 8');
      // Primero los respaldos, con su número y su archivo (decisión 34).
      expect(plan.sistema).toContain('SUS RESPALDOS DE EXPERIENCIA');
      expect(plan.sistema).toContain(
        '- N° 4352-103-SE23 · ILUSTRE MUNICIPALIDAD DE QUILLON · Cena del Día del Funcionario 2023 · 2023 · $11.782.499 con impuestos (archivo «OC 4352-103-SE23.pdf»)',
      );
      // El coordinador y, sin contacto propio del representante, el de la
      // empresa (decisión 43, migración 154).
      expect(plan.sistema).toContain(
        '- Coordinador durante la licitación: Camila Carvajal',
      );
      expect(plan.sistema).toContain(
        'Si un formulario pide la dirección, el teléfono o el correo del representante legal y no están arriba, usa los de la empresa.',
      );
      // Los respaldos usados no van en pendientes: el ZIP los adjunta solo
      // (19-10, el Profesor los pedía como si faltaran).
      expect(plan.sistema).toContain(
        'Los respaldos que usaste NO van en pendientes',
      );
      expect(plan.sistema).not.toContain('«Adjuntar respaldos: ...»');
    }));

  it('sin monto, la oferta económica queda en blanco: nunca un precio inventado', () =>
    entorno(async () => {
      const { servicio, ejecutar } = armar();
      await servicio.generarAnexos(1, CUENTA, 40, {});
      expect(planDe(ejecutar).sistema).toContain('Nunca escribas un precio');
      expect(planDe(ejecutar).sistema).not.toContain('Total con IVA');
    }));

  it('algo que no es Word ni PDF, sin formularios en Word y sin elegir, o sin los datos de la empresa: 400 sin crear nada', () =>
    entorno(async () => {
      const { adjuntos, oferente, repo, servicio } = armar();
      oferente.oferente.mockResolvedValue({ razon_social: 'VALLE DEL SOL' });
      await expect(servicio.generarAnexos(1, CUENTA, 40, {})).rejects.toThrow(
        'al menos la razón social y el RUT',
      );
      adjuntos.listar.mockResolvedValue([
        adjunto(4, 'Bases.pdf'),
        adjunto(5, 'Planilla.xlsx'),
      ]);
      await expect(
        servicio.generarAnexos(1, CUENTA, 40, { adjuntos: [5] }),
      ).rejects.toThrow('Solo se llenan los formularios en Word o PDF');
      // Sin casillas (19-10): un PDF sin formularios encontrados por el
      // análisis no entra, y el mensaje pide analizar, no marcar.
      await expect(servicio.generarAnexos(1, CUENTA, 40, {})).rejects.toThrow(
        'Analiza las bases (o vuelve a analizarlas)',
      );
      await expect(
        servicio.generarAnexos(1, CUENTA, 40, { adjuntos: [4] }),
      ).rejects.toThrow('al menos la razón social y el RUT');
      adjuntos.listar.mockResolvedValue([
        adjunto(4, 'Bases.pdf', { bytes: 41 * 1024 * 1024 }),
      ]);
      await expect(
        servicio.generarAnexos(1, CUENTA, 40, { adjuntos: [4] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.crearGeneracion).not.toHaveBeenCalled();
    }));

  it('otra empresa 404; sin llave 400; si ya hay uno en curso, devuelve ese', () =>
    entorno(async () => {
      const { oportunidades, repo, servicio, ejecutar } = armar();
      (repo.crearGeneracion as jest.Mock).mockResolvedValue(null);
      repo.ultimoDeTipo.mockResolvedValue({ id: 3, estado: 'procesando' });
      await expect(
        servicio.generarAnexos(1, CUENTA, 40, {}),
      ).resolves.toMatchObject({ id: 3 });
      expect(ejecutar).not.toHaveBeenCalled();

      oportunidades.ficha.mockResolvedValue(null);
      await expect(
        servicio.generarAnexos(2, CUENTA, 40, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      delete process.env.ANTHROPIC_API_KEY;
      await expect(servicio.generarAnexos(1, CUENTA, 40, {})).rejects.toThrow(
        'Falta la llave de Anthropic',
      );
    }));
});

describe('Firmar', () => {
  it('pone la foto de la firma en lo que la empresa ya revisó, y el firmado se compara con el de antes', () =>
    entorno(async () => {
      const { repo, servicio, ejecutar } = armar();

      await servicio.firmar(1, CUENTA, 40, [12]);

      expect(repo.crearGeneracion).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: 'firma',
          modelo: 'claude-haiku-5-5',
          parametros: { adjuntos: [12] },
        }),
      );
      const plan = planDe(ejecutar);
      expect(plan.entradas).toEqual([
        {
          enElTaller: 'documento_12.docx',
          tipo: WORD,
          ruta: 'c1/oportunidades/40/x_Formularios_Anexos - lleno.docx',
        },
        {
          enElTaller: 'firma.png',
          tipo: 'image/png',
          ruta: 'c1/oferente/firma_2026.png',
        },
      ]);
      // El Word firmado solo se revisa; se guarda su PDF, que es lo que se
      // sube a Mercado Público (19-10).
      expect(plan.salidas).toEqual([
        {
          enElTaller: 'firmado_12.docx',
          nombre: 'Formularios_Anexos - firmado.docx',
          origen: 'firmado',
          viene_de: 12,
          comparaCon: 'documento_12.docx',
          soloRevisar: true,
        },
        {
          enElTaller: 'firmado_12.pdf',
          nombre: 'Formularios_Anexos - firmado.pdf',
          origen: 'firmado',
          viene_de: 12,
          siPasa: 'firmado_12.docx',
        },
      ]);
      expect(plan.sistema).toContain('Firma: Felipe Vargas (Gerente)');
      expect(plan.sistema).toContain('NO cambies nada más');
      expect(plan.sistema).toContain(
        'soffice --headless --convert-to pdf firmado_12.docx',
      );
      expect(plan.sistema).toContain('keep_with_next');
    }));

  it('la firma no necesita ni la carta ni los eventos', () =>
    entorno(async () => {
      const { eventia, servicio } = armar();
      await servicio.firmar(1, CUENTA, 40, [12]);
      expect(eventia.carta).not.toHaveBeenCalled();
      expect(eventia.eventosRealizados).not.toHaveBeenCalled();
    }));

  it('sin foto de la firma, algo que no es de la postulación, que no es Word o que ya está firmado: no se firma', () =>
    entorno(async () => {
      const { oferente, repo, servicio } = armar();
      await expect(servicio.firmar(1, CUENTA, 40, [99])).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(servicio.firmar(1, CUENTA, 40, [13])).rejects.toThrow(
        'no es un Word',
      );
      await expect(servicio.firmar(1, CUENTA, 40, [14])).rejects.toThrow(
        'ya está firmado',
      );
      oferente.oferente.mockResolvedValue({ ...OFERENTE, firma_ruta: null });
      await expect(servicio.firmar(1, CUENTA, 40, [12])).rejects.toThrow(
        'Primero sube la foto de la firma',
      );
      expect(repo.crearGeneracion).not.toHaveBeenCalled();
    }));
});

describe('Crear propuesta técnica', () => {
  it('valorizada (decisión 42): al final el neto, el IVA y el total del motor; al reintentar, el precio de la última oferta', () =>
    entorno(async () => {
      const { repo, servicio, ejecutar } = armar();
      await servicio.crearPropuesta(1, CUENTA, 40, { monto_total: 15_900_000 });
      const valor =
        'Valor neto $13.361.345; IVA (19%) $2.538.655; Valor total $15.900.000';
      expect(planDe(ejecutar).sistema).toContain(valor);
      expect(planDe(ejecutar).sistema).not.toContain('Nunca escribas precios');
      expect(repo.crearGeneracion).toHaveBeenCalledWith(
        expect.objectContaining({ parametros: { monto_total: 15_900_000 } }),
      );
      ejecutar.mockClear();
      repo.ultimoDeTipo.mockResolvedValue({
        parametros: { postulacion: { total: 15_900_000 } },
      });
      await servicio.crearPropuesta(1, CUENTA, 40);
      expect(planDe(ejecutar).sistema).toContain(valor);
    }));

  it('con el análisis de las bases, el logo de la casa, las bases para el detalle y el catálogo; sin precios', () =>
    entorno(async () => {
      const { repo, servicio, ejecutar } = armar();

      await servicio.crearPropuesta(1, CUENTA, 40);

      expect(repo.crearGeneracion).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: 'propuesta',
          modelo: 'claude-opus-5-5',
          analisis_id: 5,
          archivos: [
            { id: 4, nombre: 'D.A. N°4.770 Bases.pdf' },
            { id: 6, nombre: 'Formularios_Anexos.docx' },
          ],
        }),
      );
      const plan = planDe(ejecutar);
      expect(plan.entradas.map((e) => e.enElTaller)).toEqual([
        'logo.png',
        'bases_4.pdf',
        'bases_6.docx',
      ]);
      expect(plan.entradas[0]).toMatchObject({ opcional: true });
      expect(plan.salidas).toEqual([
        {
          enElTaller: 'propuesta.docx',
          nombre: 'Propuesta técnica 1532886-5-LE26.docx',
          origen: 'generado',
          viene_de: null,
        },
      ]);
      expect(plan.esfuerzo).toBe('high');
      expect(plan.sistema).toContain('Nunca escribas precios ni montos');
      // El catálogo con ids, el mismo de «✨ Crear con IA», y la oferta que
      // después llena la cotización (decisión 29, 19-10).
      expect(plan.sistema).toContain(
        'LO QUE VENDE LA EMPRESA (su catálogo en Eventia, con el id de cada producto',
      );
      expect(plan.sistema).toContain('7 «Almuerzo celebración»');
      expect(plan.sistema).toContain('45 «Amplificación»');
      expect(plan.sistema).toContain('son LA MISMA oferta');
      expect(plan.sistema).toContain('"oferta": {"cajas": [], "fijos": []}');
      expect(plan.sistema).toContain(
        '- [lo tiene] Mesas y sillas para 160 personas → con Salón principal',
      );
      expect(plan.sistema).toContain('[COMPLETAR: qué falta]');
      expect(plan.sistema).toContain('[POR CONFIRMAR: qué falta]');
      // Más es menos (decisión 32, 19-10): la estructura de las bases, sin
      // secciones propias, y lo subcontratado tal cual lo piden.
      expect(plan.sistema).toContain(SOLO_LO_QUE_PIDEN);
      expect(plan.sistema).toContain(LO_SUBCONTRATADO);
      expect(plan.sistema).toContain('No agregues secciones propias');
      // Que se subcontrata es interno: nunca en el Word (Felipe: "no es
      // interés de la municipalidad saberlo").
      expect(plan.sistema).toContain('sin decir que se subcontrata');
      expect(plan.sistema).toContain(
        'va SOLO en pendientes, nunca en el documento',
      );
      expect(plan.sistema).not.toContain('Entendimiento del servicio;');
      expect(plan.sistema).not.toContain('Compromisos (calidad');
    }));

  it('con lo postulado ya armado, la propuesta y los anexos lo escriben tal cual; la propuesta, con Sonnet y sin catálogo', () =>
    entorno(async () => {
      const { catalogos, loPostulado, servicio, ejecutar } = armar();
      loPostulado.paraDocumentos.mockResolvedValue({
        matriz: [
          {
            especificacion: 'Plato principal: plateada o salmón',
            pagina: 19,
            como: 'Plateada para 160 personas.',
            origen: 'catalogo',
            productos: [11],
          },
        ],
        productos: ['- Día 1 · Almuerzo · 160 personas: Plateada'],
        cotizacion: 481,
      });

      await servicio.crearPropuesta(1, CUENTA, 40);
      const plan = planDe(ejecutar);
      expect(plan.modelo).toBe('claude-sonnet-5-5');
      expect(plan.sistema).toContain('LO POSTULADO');
      expect(plan.sistema).toContain(
        '1. Plato principal: plateada o salmón (pág. 19) → Plateada para 160 personas.',
      );
      expect(plan.sistema).toContain(ESCRIBIR_LA_OFERTA);
      // No decide de nuevo: ni catálogo, ni revisión, ni oferta de vuelta.
      expect(catalogos.catalogo).not.toHaveBeenCalled();
      expect(plan.sistema).not.toContain('su catálogo en Eventia, con el id');
      expect(plan.sistema).not.toContain('son LA MISMA oferta');
      expect(plan.sistema).not.toContain('[POR CONFIRMAR: qué falta]');
      // Con lo postulado no necesita las bases (19-10: escaneadas, la
      // ahogaban): solo el logo.
      expect(
        plan.entradas.filter((e) => e.enElTaller.startsWith('bases_')),
      ).toEqual([]);

      ejecutar.mockClear();
      await servicio.generarAnexos(1, CUENTA, 40, { monto_total: 11_900_000 });
      const anexos = planDe(ejecutar);
      expect(anexos.sistema).toContain('LO POSTULADO');
      expect(anexos.sistema).toContain(ESCRIBIR_LA_OFERTA);
      // El formulario de calidad lleva todo el detalle ahí mismo, aunque
      // acepte formato propio (decisión 40).
      expect(anexos.sistema).toContain(EL_DETALLE_EN_EL_FORMULARIO);
      expect(anexos.sistema).not.toContain(
        'escribe en él «Se adjunta propuesta técnica en formato propio»',
      );
    }));

  it('postulada, ya no se generan ni firman documentos: lo postulado queda fijo (decisión 33)', () =>
    entorno(async () => {
      const { oportunidades, servicio, ejecutar } = armar();
      oportunidades.ficha.mockResolvedValue({
        ...(await oportunidades.ficha()),
        estado: 'postulada',
      });
      await expect(servicio.crearPropuesta(1, CUENTA, 40)).rejects.toThrow(
        'Ya la postulaste',
      );
      await expect(
        servicio.generarAnexos(1, CUENTA, 40, { monto_total: 11_900_000 }),
      ).rejects.toThrow('Ya la postulaste');
      expect(ejecutar).not.toHaveBeenCalled();
    }));

  it('si el catálogo no se puede leer, la propuesta sale igual con la carta de antes y sin oferta', () =>
    entorno(async () => {
      const { catalogos, servicio, ejecutar } = armar();
      catalogos.catalogo.mockRejectedValue(new Error('sin base'));
      await servicio.crearPropuesta(1, CUENTA, 40);
      const plan = planDe(ejecutar);
      expect(plan.sistema).toContain('- Salones: Salón principal');
      expect(plan.sistema).toContain(
        '- [Cena] Plateada: Plateada al jugo, Papas rústicas',
      );
      expect(plan.sistema).not.toContain('son LA MISMA oferta');
    }));

  it('sin análisis listo, 400; un logo de fuera de la casa no se baja', () =>
    entorno(async () => {
      const { analisis, oferente, servicio, ejecutar } = armar();
      oferente.empresa.mockResolvedValue({
        name: 'X',
        logo_url: 'http://169.254.169.254/logo.png',
        bank_details: null,
      });
      await servicio.crearPropuesta(1, CUENTA, 40);
      expect(planDe(ejecutar).entradas.map((e) => e.enElTaller)).not.toContain(
        'logo.png',
      );

      analisis.ultimo.mockResolvedValue({ id: 5, estado: 'procesando' });
      await expect(servicio.crearPropuesta(1, CUENTA, 40)).rejects.toThrow(
        'Primero analiza las bases',
      );
    }));
});

describe('Por detrás: el taller y «Mi postulación»', () => {
  const PLAN: Plan = {
    tipo: 'anexos',
    modelo: 'claude-sonnet-5-5',
    oportunidadId: 40,
    perfil: 'perfil-1',
    sistema: 'Llenas los anexos.',
    texto: 'Llena los anexos.',
    entradas: [
      { enElTaller: 'anexo_6.docx', tipo: WORD, ruta: 'c1/anexo.docx' },
    ],
    salidas: [
      {
        enElTaller: 'lleno_6.docx',
        nombre: 'Formularios_Anexos - lleno.docx',
        origen: 'generado',
        viene_de: 6,
      },
    ],
    esfuerzo: 'medium',
    maxTokens: 32_000,
  };

  const INFORME = Buffer.from(
    JSON.stringify({
      resumen: 'Llené los anexos 1 a 5; el 6 (UTP) no aplica.',
      documentos: [
        {
          archivo: 'lleno_6.docx',
          que_se_hizo: 'Anexos 1 a 5 llenos.',
          pendientes: ['El monto de la oferta'],
        },
      ],
      pendientes: ['Las órdenes de compra de la experiencia'],
    }),
  );

  const USO = {
    entrada: 10_000,
    salida: 5_000,
    cacheEscrita: 20_000,
    cacheLeida: 100_000,
  };

  it('guarda lo entregado en «Mi postulación», marcado como generado, con el informe y lo que costó (caché incluida)', async () => {
    const { adjuntos, repo, servicio, ejecutar } = armar();
    ejecutar.mockRestore();
    taller.mockResolvedValue({
      archivos: [
        {
          nombre: 'lleno_6.docx',
          datos: wordCon(['ANEXO N°1', 'RUT: 77.701.305-K']),
        },
        { nombre: 'informe.json', datos: INFORME },
      ],
      texto: 'Listo.',
      uso: USO,
      motivo: 'end_turn',
    });

    await servicio.ejecutar(1, 9, PLAN);

    expect(repo.descargar).toHaveBeenCalledWith('c1/anexo.docx');
    expect(taller).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelo: 'claude-sonnet-5-5',
        archivos: [
          expect.objectContaining({ nombre: 'anexo_6.docx', tipo: WORD }),
        ],
        esfuerzo: 'medium',
      }),
    );
    const [[ruta, , tipo]] = adjuntos.subirArchivo.mock.calls as Array<
      [string, Buffer, string]
    >;
    expect(ruta).toMatch(
      /^c1\/oportunidades\/40\/postulacion\/.+_Formularios_Anexos_-_lleno\.docx$/,
    );
    expect(tipo).toBe(WORD);
    expect(adjuntos.guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 1,
        oportunidad_id: 40,
        nombre: 'Formularios_Anexos - lleno.docx',
        seccion: 'postulacion',
        subido_por: 'perfil-1',
        origen: 'generado',
        viene_de: 6,
        generacion_id: 9,
      }),
    );
    // Con Sonnet 5.5, en US$ por millón: 10.000 × 2 de entrada + 20.000 ×
    // 2,5 de caché escrita + 100.000 × 0,1 de caché leída + 5.000 × 10 de
    // salida = US$0,13.
    expect(repo.terminar).toHaveBeenCalledWith(1, 9, {
      estado: 'listo',
      resultado: {
        resumen: 'Llené los anexos 1 a 5; el 6 (UTP) no aplica.',
        documentos: [
          {
            adjunto_id: 50,
            nombre: 'Formularios_Anexos - lleno.docx',
            que_se_hizo: 'Anexos 1 a 5 llenos.',
            pendientes: ['El monto de la oferta'],
          },
        ],
        pendientes: ['Las órdenes de compra de la experiencia'],
        descartados: [],
        no_entregados: [],
      },
      tokens_entrada: 130_000,
      tokens_salida: 5_000,
      costo_usd: 0.13,
    });
  });

  it('un firmado que cambió el texto no se guarda, y queda dicho por qué', async () => {
    const { adjuntos, repo, servicio, ejecutar } = armar();
    ejecutar.mockRestore();
    const antes = wordCon(['Firma: ____', 'Felipe Vargas'], 1);
    (repo.descargar as jest.Mock).mockResolvedValue(antes);
    taller.mockResolvedValue({
      archivos: [
        {
          nombre: 'firmado_12.docx',
          datos: wordCon(['Firma: ____', 'OTRO'], 2),
        },
      ],
      texto: 'Firmé.',
      uso: USO,
      motivo: 'end_turn',
    });

    await servicio.ejecutar(1, 9, {
      ...PLAN,
      tipo: 'firma',
      entradas: [
        { enElTaller: 'documento_12.docx', tipo: WORD, ruta: 'c1/lleno.docx' },
      ],
      salidas: [
        {
          enElTaller: 'firmado_12.docx',
          nombre: 'Formularios_Anexos - firmado.docx',
          origen: 'firmado',
          viene_de: 12,
          comparaCon: 'documento_12.docx',
        },
      ],
    });

    expect(adjuntos.subirArchivo).not.toHaveBeenCalled();
    expect(repo.terminar).toHaveBeenCalledWith(
      1,
      9,
      expect.objectContaining({
        estado: 'error',
        error: expect.stringContaining('no pasó la revisión') as unknown,
        resultado: expect.objectContaining({
          resumen: 'Firmé.',
          descartados: [
            {
              nombre: 'Formularios_Anexos - firmado.docx',
              motivo: expect.stringContaining('cambió el texto') as unknown,
            },
          ],
        }) as unknown,
      }),
    );
  });

  it('la firma guarda el PDF de cada documento, solo si su Word firmado pasó la revisión (el Word no se guarda)', async () => {
    const { adjuntos, repo, servicio, ejecutar } = armar();
    ejecutar.mockRestore();
    const antes = wordCon(['Firma: ____', 'Felipe Vargas'], 1);
    (repo.descargar as jest.Mock).mockResolvedValue(antes);
    const pdf = Buffer.from('%PDF-1.7 firmado');
    taller.mockResolvedValue({
      archivos: [
        {
          nombre: 'firmado_12.docx',
          datos: wordCon(['Firma: ____', 'Felipe Vargas'], 2),
        },
        { nombre: 'firmado_12.pdf', datos: pdf },
        // El 13 cambió el texto: ni su Word ni su PDF se guardan.
        {
          nombre: 'firmado_13.docx',
          datos: wordCon(['Firma: ____', 'OTRO'], 2),
        },
        { nombre: 'firmado_13.pdf', datos: pdf },
      ],
      texto: 'Firmé.',
      uso: USO,
      motivo: 'end_turn',
    });

    await servicio.ejecutar(1, 9, {
      ...PLAN,
      tipo: 'firma',
      entradas: [
        { enElTaller: 'documento_12.docx', tipo: WORD, ruta: 'c1/a.docx' },
        { enElTaller: 'documento_13.docx', tipo: WORD, ruta: 'c1/b.docx' },
      ],
      salidas: salidasDeLaFirma([
        {
          adjunto: { id: 12, nombre: 'Formulario N°1 - lleno.docx' },
          enElTaller: 'documento_12.docx',
        },
        {
          adjunto: { id: 13, nombre: 'Formulario N°2 - lleno.docx' },
          enElTaller: 'documento_13.docx',
        },
      ]),
    });

    expect(adjuntos.subirArchivo).toHaveBeenCalledTimes(1);
    expect(adjuntos.subirArchivo).toHaveBeenCalledWith(
      expect.stringMatching(/Formulario_N_1_-_firmado\.pdf$/) as unknown,
      pdf,
      'application/pdf',
    );
    expect(adjuntos.guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Formulario N°1 - firmado.pdf',
        tipo: 'application/pdf',
        origen: 'firmado',
        viene_de: 12,
      }),
    );
    expect(repo.terminar).toHaveBeenCalledWith(
      1,
      9,
      expect.objectContaining({
        estado: 'listo',
        resultado: expect.objectContaining({
          descartados: [
            {
              nombre: 'Formulario N°2 - firmado.docx',
              motivo: expect.stringContaining('cambió el texto') as unknown,
            },
            {
              nombre: 'Formulario N°2 - firmado.pdf',
              motivo: 'su Word firmado no pasó la revisión: se descartó',
            },
          ],
        }) as unknown,
      }),
    );
  });

  it('si no entregó nada porque se quedó sin espacio, lo dice; si el taller falla, queda escrito y no revienta', async () => {
    const { repo, servicio, ejecutar } = armar();
    ejecutar.mockRestore();
    taller.mockResolvedValue({
      archivos: [],
      texto: '',
      uso: USO,
      motivo: 'max_tokens',
    });
    await servicio.ejecutar(1, 9, PLAN);
    expect(repo.terminar).toHaveBeenLastCalledWith(
      1,
      9,
      expect.objectContaining({
        estado: 'error',
        error: expect.stringContaining('no alcanzó a terminar') as unknown,
      }),
    );

    taller.mockRejectedValue(new Error('credit balance is too low'));
    await expect(servicio.ejecutar(1, 9, PLAN)).resolves.toBeUndefined();
    expect(repo.terminar).toHaveBeenLastCalledWith(1, 9, {
      estado: 'error',
      error: 'Se acabó el saldo de la cuenta de Anthropic.',
    });
  });

  it('las tres últimas, una por tipo, después de dar por cortado lo de un motor anterior', async () => {
    const { repo, servicio } = armar();
    repo.ultimoDeTipo.mockImplementation(
      (_: number, __: number, tipo: string) =>
        Promise.resolve(tipo === 'anexos' ? { id: 1, tipo } : null),
    );
    await expect(servicio.ultimas(1, 40)).resolves.toEqual({
      anexos: { id: 1, tipo: 'anexos' },
      firma: null,
      propuesta: null,
    });
    expect(repo.abandonarAntesDe).toHaveBeenCalledWith(
      1,
      40,
      expect.any(String),
    );
  });
});
