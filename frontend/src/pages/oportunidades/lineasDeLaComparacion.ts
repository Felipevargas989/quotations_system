import type {
  ComparacionDeOfertas,
  IncumplimientoGrave,
  LecturaDeUnaOferta,
  LineaComparada,
  OferenteComparado,
} from "../../services/comparacion.service";

// LA COMPARACIÓN, LÍNEA POR LÍNEA (decisión 125 del doc 17, 11-11). Felipe,
// con la 5040-14-LE26: "recuerda que son dos líneas que se podrían postular
// de forma independiente" y, viendo la pantalla de antes, "debemos mejorar
// esta interfaz". Aquí, lo que la pantalla saca de lo que guardó el motor,
// sin dibujar nada: el orden de cada línea, los dos desenlaces en palabras,
// lo que la decide y lo de cada oferta junto.

/** Cómo se muestra un oferente: su nombre corto de «La competencia». */
export const nombreCorto = (o: OferenteComparado): string =>
  o.corto?.trim() || o.nombre;

/** «$16.855.993 IVA incluido» → 16855993; null si no trae un monto. */
export const montoDe = (precio: string): number | null => {
  const m = /\$\s?(\d{1,3}(?:\.\d{3})+|\d+)/.exec(precio);
  return m ? Number(m[1].replace(/\./g, "")) : null;
};

/** Los oferentes de una línea, del mayor puntaje al menor. */
export const enOrden = (l: LineaComparada): OferenteComparado[] =>
  [...l.oferentes].sort((a, b) => b.puntaje - a.puntaje);

const puntos = (n: number): string => {
  const d = Math.round(n * 10) / 10;
  return `${d.toLocaleString("es-CL")} ${d === 1 ? "punto" : "puntos"}`;
};

const juntos = (xs: string[]): string =>
  xs.length <= 1
    ? (xs[0] ?? "")
    : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;

export type Desenlace = {
  /** «Ganas tú», «Gana TEXTUM por 0,6 puntos». */
  titulo: string;
  /** Una línea chica debajo; null si no hay nada que agregar. */
  detalle: string | null;
  ganasTu: boolean;
};

const elDe = (l: LineaComparada, nombre: string | null) =>
  nombre === null
    ? null
    : (l.oferentes.find((o) => o.nombre === nombre) ?? null);

/** Quién gana si la comisión acepta todas las ofertas, y por cuánto. */
export function siAceptanTodo(l: LineaComparada): Desenlace | null {
  const ganador = elDe(l, l.si_aceptan_todo);
  if (!ganador) return null;
  if (l.oferentes.length === 1) {
    return {
      titulo: ganador.es_tuya ? "Ganas tú" : `Gana ${nombreCorto(ganador)}`,
      detalle: "Es la única oferta",
      ganasTu: ganador.es_tuya,
    };
  }
  const tu = l.oferentes.find((o) => o.es_tuya);
  const segundo = enOrden(l).find((o) => o !== ganador);
  // Contra quién se mide la ventaja: contra ti si compites; si no, o si
  // ganas tú, contra el que sigue.
  const otro = ganador.es_tuya || !tu ? segundo : tu;
  const ventaja = otro ? ganador.puntaje - otro.puntaje : 0;
  const por = ventaja > 0 ? ` por ${puntos(ventaja)}` : "";
  const suyo = montoDe(ganador.precio);
  const delOtro = otro ? montoDe(otro.precio) : null;
  const menos =
    suyo !== null && delOtro !== null && suyo < delOtro
      ? `$${(delOtro - suyo).toLocaleString("es-CL")} menos`
      : null;
  return {
    titulo: ganador.es_tuya
      ? `Ganas tú${por}`
      : `Gana ${nombreCorto(ganador)}${por}`,
    detalle:
      ventaja === 0 && otro
        ? "Empatan en puntaje"
        : menos
          ? ganador.es_tuya
            ? `Ofertaste ${menos}`
            : `Ofertó ${menos}`
          : null,
    ganasTu: ganador.es_tuya,
  };
}

/** Quién gana si la comisión deja fuera todo lo que no cumple a la letra. */
export function aLaLetra(l: LineaComparada): Desenlace | null {
  if (l.oferentes.length === 0) return null;
  const fuera = l.oferentes.filter((o) => o.cumple_bases !== "si");
  const quedanFuera =
    fuera.length === 0
      ? "Nadie queda fuera"
      : `${juntos(fuera.map((o) => (o.es_tuya ? "tu oferta" : nombreCorto(o))))} ${fuera.length === 1 ? "queda" : "quedan"} fuera`;
  const detalle = quedanFuera.charAt(0).toUpperCase() + quedanFuera.slice(1);
  const ganador = elDe(l, l.a_la_letra);
  if (!ganador) {
    return { titulo: "Nadie cumple a la letra", detalle, ganasTu: false };
  }
  return {
    titulo: ganador.es_tuya ? "Ganas tú" : `Gana ${nombreCorto(ganador)}`,
    detalle,
    ganasTu: ganador.es_tuya,
  };
}

/** Lo que decide una línea: la frase de la IA y, de quien va primero con
 *  algo que lo puede dejar fuera, eso mismo con su prueba. null si no hay
 *  nada que decir (una comparación de antes, sin incumplimientos). */
export function loQueLoDecide(l: LineaComparada): {
  texto: string;
  de: OferenteComparado | null;
  grave: IncumplimientoGrave | null;
} | null {
  const de = enOrden(l).find((o) => (o.graves ?? []).length > 0) ?? null;
  const grave = de?.graves?.[0] ?? null;
  const texto = l.que_lo_decide?.trim() || grave?.que || "";
  return texto ? { texto, de, grave } : null;
}

const elMejor = (xs: OferenteComparado[]): OferenteComparado | null =>
  xs.reduce<OferenteComparado | null>(
    (mejor, o) =>
      !mejor ||
      o.puntaje > mejor.puntaje ||
      (o.puntaje === mejor.puntaje && o.probabilidad > mejor.probabilidad)
        ? o
        : mejor,
    null,
  );

/** El motor entrega siempre las líneas (`conLineas`, decisión 125). Por si
 *  responde uno de antes (un despliegue a medias): con lo de antes, una sola
 *  línea, igual que la arma el motor. Así la pestaña no se cae. */
export function conLineas(r: ComparacionDeOfertas): ComparacionDeOfertas {
  if (Array.isArray(r.lineas)) return r;
  const oferentes = r.oferentes ?? [];
  return {
    ...r,
    lineas:
      oferentes.length === 0
        ? []
        : [
            {
              nombre: "",
              tope: "",
              compites: oferentes.some((o) => o.es_tuya),
              que_lo_decide: "",
              ganador_probable: r.ganador_probable ?? "",
              oferentes,
              si_aceptan_todo: elMejor(oferentes)?.nombre ?? null,
              a_la_letra:
                elMejor(oferentes.filter((o) => o.cumple_bases === "si"))
                  ?.nombre ?? null,
            },
          ],
  };
}

/** Primero las líneas en que compite la empresa. */
export const lineasEnOrden = (r: ComparacionDeOfertas): LineaComparada[] => [
  ...r.lineas.filter((l) => l.compites),
  ...r.lineas.filter((l) => !l.compites),
];

export type OfertaEnDetalle = {
  clave: string;
  /** Como se llama en «La competencia». */
  nombre: string;
  es_tuya: boolean;
  lectura: LecturaDeUnaOferta | null;
  /** En qué líneas postula, con lo suyo de cada una. */
  enLineas: Array<{ linea: LineaComparada; oferente: OferenteComparado }>;
};

/** Cada oferta una vez, con lo suyo de cada línea: quien postula a dos
 *  líneas sale en una sola fila. La de la empresa, primero. */
export function ofertasEnDetalle(r: ComparacionDeOfertas): OfertaEnDetalle[] {
  const porClave = new Map<string, OfertaEnDetalle>();
  for (const lectura of r.lectura ?? []) {
    porClave.set(`n${lectura.oferta}`, {
      clave: `n${lectura.oferta}`,
      nombre: lectura.nombre,
      es_tuya: lectura.es_tuya,
      lectura,
      enLineas: [],
    });
  }
  for (const linea of lineasEnOrden(r)) {
    for (const oferente of linea.oferentes) {
      const clave =
        oferente.oferta != null ? `n${oferente.oferta}` : oferente.nombre;
      const fila = porClave.get(clave) ?? {
        clave,
        nombre: nombreCorto(oferente),
        es_tuya: oferente.es_tuya,
        lectura: null,
        enLineas: [],
      };
      fila.enLineas.push({ linea, oferente });
      porClave.set(clave, fila);
    }
  }
  const filas = [...porClave.values()];
  return [
    ...filas.filter((f) => f.es_tuya),
    ...filas.filter((f) => !f.es_tuya),
  ];
}

/** «leyó 13 de 15 archivos · 2 sin traer». */
export const resumenDeLectura = (l: LecturaDeUnaOferta): string =>
  [
    l.total === 0
      ? "sin archivos"
      : `leyó ${l.leidos} de ${l.total} ${l.total === 1 ? "archivo" : "archivos"}`,
    l.sin_traer.length > 0 ? `${l.sin_traer.length} sin traer` : null,
  ]
    .filter(Boolean)
    .join(" · ");
