import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  comidasDelDia,
  rotuloDeDia,
  tipoDeCaja,
  type Comida,
  type FechaDelEvento,
  type Resaltar,
} from "../../utils/serviciosPorDia";

// LAS CASILLAS DE SERVICIOS, EN BANDAS POR DÍA (20-11-2026, maqueta
// aprobada por Felipe). La misma pieza en el cotizador (QuotationForm) y
// en Post-Venta → Servicios (ServiciosTab).
//
// Con más de un día, las casillas se agrupan en bandas «Día N · lunes
// 23-11», con los chips de comidas del día (lo que falta, punteado y
// gris), cuántas casillas y el total del día; cada banda se pliega y al
// pie trae «+ Agregar al Día N». Dentro del día manda el orden manual
// del arreglo. Con UN día no dibuja nada propio: la lista se ve
// exactamente como antes.
//
// La pantalla sigue dibujando cada casilla como siempre: `children` es
// una casilla dibujada por cada elemento de `cajas`, en el mismo orden
// (el `.map` de siempre). La pieza no guarda nada: cada casilla sigue
// guardando solo su `day`.

type Props<T> = {
  cajas: T[];
  diasDelEvento: number;
  // La fecha del evento (medianoche UTC): da el día de la semana.
  fechaInicio?: FechaDelEvento;
  diaDe: (caja: T) => number;
  categoriaDe: (caja: T) => string;
  // El nombre del menú guardado o de la casilla, si lo hay: manda sobre
  // la categoría para saber qué comida es.
  nombreDe?: (caja: T) => string | undefined;
  totalDe: (caja: T) => number;
  onAgregar?: (dia: number) => void;
  // Cambiar el día de una casilla: se despliega su banda, se ilumina un
  // segundo y se lleva a la vista. `vez` distingue dos avisos seguidos.
  resaltar?: Resaltar | null;
  // La clase del contenedor y lo que va al pie de la lista (el
  // «+ Agregar servicio» de siempre), iguales con uno o varios días.
  className?: string;
  pie?: ReactNode;
  children: ReactNode;
};

const COMIDAS: { clave: Comida; rotulo: string; color: string }[] = [
  {
    clave: "desayuno",
    rotulo: "Desayuno",
    color: "bg-amber-100 text-amber-800",
  },
  {
    clave: "almuerzo",
    rotulo: "Almuerzo",
    color: "bg-emerald-100 text-emerald-800",
  },
  { clave: "cena", rotulo: "Cena", color: "bg-violet-100 text-violet-800" },
  {
    clave: "alojamiento",
    rotulo: "Alojamiento",
    color: "bg-cyan-100 text-cyan-800",
  },
];

// La clave del envoltorio es la de la casilla dibujada: al moverla de
// banda o de lugar no se vuelve a montar (no pierde lo que tenía abierto).
const claveDe = (nodo: ReactNode, i: number) =>
  isValidElement(nodo) && nodo.key != null ? String(nodo.key) : `i${i}`;

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

export default function BandasPorDia<T>({
  cajas,
  diasDelEvento,
  fechaInicio,
  diaDe,
  categoriaDe,
  nombreDe,
  totalDe,
  onAgregar,
  resaltar,
  className,
  pie,
  children,
}: Props<T>) {
  const dias = Math.max(1, Math.floor(diasDelEvento) || 1);
  const [plegados, setPlegados] = useState<Set<number>>(new Set());
  const [iluminada, setIluminada] = useState<number | null>(null);
  const nodos = useRef(new Map<number, HTMLDivElement>());
  const diaDeCaja = (c: T) => Math.min(dias, Math.max(1, diaDe(c) || 1));
  // Lo último dibujado, para el aviso de `resaltar` sin repetirlo en cada
  // tecleo (el efecto solo escucha el aviso).
  const ultimo = useRef({ cajas, diaDeCaja });
  ultimo.current = { cajas, diaDeCaja };

  useEffect(() => {
    if (!resaltar) return;
    const caja = ultimo.current.cajas[resaltar.indice];
    if (caja === undefined) return;
    const dia = ultimo.current.diaDeCaja(caja);
    setPlegados((prev) => {
      if (!prev.has(dia)) return prev;
      const next = new Set(prev);
      next.delete(dia);
      return next;
    });
    setIluminada(resaltar.indice);
    const mirar = window.setTimeout(() => {
      nodos.current
        .get(resaltar.indice)
        ?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }, 30);
    const apagar = window.setTimeout(() => setIluminada(null), 1100);
    return () => {
      window.clearTimeout(mirar);
      window.clearTimeout(apagar);
    };
  }, [resaltar]);

  if (dias <= 1)
    return (
      <div className={className}>
        {children}
        {pie}
      </div>
    );

  const dibujadas = Children.toArray(children);
  const porDia = Array.from({ length: dias }, () => [] as number[]);
  cajas.forEach((c, i) => porDia[diaDeCaja(c) - 1].push(i));
  const todosPlegados = plegados.size >= dias;
  const alternar = (dia: number) =>
    setPlegados((prev) => {
      const next = new Set(prev);
      if (next.has(dia)) next.delete(dia);
      else next.add(dia);
      return next;
    });

  return (
    <div className={className}>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() =>
            setPlegados(
              todosPlegados
                ? new Set()
                : new Set(Array.from({ length: dias }, (_, i) => i + 1)),
            )
          }
          className="text-xs font-semibold text-blue-600 hover:underline"
        >
          {todosPlegados ? "Desplegar todos" : "Plegar todos los días"}
        </button>
      </div>
      {porDia.map((indices, d) => {
        const dia = d + 1;
        const plegado = plegados.has(dia);
        const { titulo, fecha } = rotuloDeDia(dia, fechaInicio);
        const { comidas, extra } = comidasDelDia(
          indices.map((i) =>
            tipoDeCaja(nombreDe?.(cajas[i]), categoriaDe(cajas[i])),
          ),
        );
        const total = indices.reduce((s, i) => s + (totalDe(cajas[i]) || 0), 0);
        return (
          <section
            key={dia}
            // Sin `overflow-hidden` (27-11, Camila): recortaba la lista
            // del buscador de ítems, que se abre por fuera de la tarjeta,
            // y el día siguiente la tapaba. Las esquinas de la cabecera
            // se redondean en la propia cabecera.
            className="rounded-xl border border-blue-100 bg-white"
            aria-label={titulo}
          >
            <button
              type="button"
              onClick={() => alternar(dia)}
              aria-expanded={!plegado}
              title={plegado ? "Desplegar el día" : "Plegar el día"}
              className={`w-full flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100/70 text-left ${
                plegado ? "rounded-[11px]" : "rounded-t-[11px]"
              }`}
            >
              <span className="flex items-center gap-1 text-sm font-bold text-blue-900">
                {plegado ? (
                  <ChevronRight size={15} />
                ) : (
                  <ChevronDown size={15} />
                )}
                {titulo}
              </span>
              {fecha && <span className="text-xs text-gray-600">{fecha}</span>}
              <span className="flex flex-wrap gap-1">
                {COMIDAS.map(({ clave, rotulo, color }) =>
                  comidas.has(clave) ? (
                    <span
                      key={clave}
                      className={`text-[11px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap ${color}`}
                    >
                      ✓ {rotulo}
                    </span>
                  ) : (
                    <span
                      key={clave}
                      className="text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap text-gray-400 border border-dashed border-gray-300"
                    >
                      falta {rotulo}
                    </span>
                  ),
                )}
                {extra && (
                  <span className="text-[11px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap bg-pink-100 text-pink-700">
                    + Extra
                  </span>
                )}
              </span>
              <span className="ml-auto text-xs font-semibold text-gray-700 whitespace-nowrap">
                {indices.length} casilla{indices.length === 1 ? "" : "s"} ·{" "}
                <span className="text-sm font-bold text-gray-900">
                  {pesos(total)}
                </span>
              </span>
            </button>
            {!plegado && (
              <div className="p-3 space-y-3">
                {indices.length === 0 && (
                  <p className="text-xs text-gray-500">
                    Sin servicios este día.
                  </p>
                )}
                {indices.map((i) => (
                  <div
                    key={claveDe(dibujadas[i], i)}
                    ref={(el) => {
                      if (el) nodos.current.set(i, el);
                      else nodos.current.delete(i);
                    }}
                    className={`rounded-lg transition-shadow duration-500 ${
                      iluminada === i ? "ring-4 ring-amber-300 bg-amber-50" : ""
                    }`}
                    data-iluminada={iluminada === i ? "si" : undefined}
                  >
                    {dibujadas[i]}
                  </div>
                ))}
                {onAgregar && (
                  <button
                    type="button"
                    onClick={() => onAgregar(dia)}
                    className="px-3 py-1.5 rounded-lg border border-dashed border-blue-400 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                  >
                    + Agregar al {titulo}
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}
      {pie}
    </div>
  );
}
