import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "../components/toast/Toast";
import {
  generarSeguimiento,
  getSeguimientosPendientes,
} from "../services/quotations.service";
import { humanizeApiError } from "../utils/apiErrors";

// «✉ GENERAR SEGUIMIENTO» Y «✉ GENERAR SEGUIMIENTOS» (Felipe, 17-10-2026;
// doc 18). El motor escribe el seguimiento con IA y lo deja de BORRADOR en
// el hilo del cliente en Outlook (o en un correo nuevo); nunca envía. Va de
// a uno, también en el general: la cuenta de Anthropic es la misma de
// «Crear con IA» y del radar. Lo que salió queda listado con su enlace a
// Outlook, y lo que se saltó, con el motivo.

export type Seguimiento = { id: string; numero: number };

export type ResultadoDeSeguimiento = {
  id: string;
  numero: number;
  accion: "borrador" | "saltada" | "error";
  /** En palabras de la casa: dónde quedó y con qué ángulo, o por qué no. */
  detalle: string;
  enlace: string | null;
};

/** Tope de «Generar seguimientos» por vez (el de la skill de correos). */
export const TOPE_POR_VEZ = 20;

/** "contacto@" de "contacto@valledelsolquillon.cl". */
const buzonCorto = (buzon: string | null) =>
  buzon ? `${buzon.split("@")[0]}@` : "Outlook";

export function useSeguimientoConIA({
  conLista = false,
}: { readonly conLista?: boolean } = {}) {
  const queryClient = useQueryClient();
  const pendientesQuery = useQuery({
    queryKey: ["seguimiento-ia", "pendientes"],
    enabled: conLista,
    staleTime: 60_000,
    queryFn: getSeguimientosPendientes,
  });
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [lote, setLote] = useState<{ hecho: number; total: number } | null>(
    null,
  );
  const [resultados, setResultados] = useState<ResultadoDeSeguimiento[]>([]);

  // La línea nueva de la bitácora y el semáforo del tablero.
  const refrescar = (id: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["seguimientos", id] }),
      queryClient.invalidateQueries({ queryKey: ["seguimientos", "map"] }),
      queryClient.invalidateQueries({
        queryKey: ["seguimiento-ia", "pendientes"],
      }),
    ]);

  const una = async ({
    id,
    numero,
  }: Seguimiento): Promise<ResultadoDeSeguimiento> => {
    setTrabajando(id);
    let resultado: ResultadoDeSeguimiento;
    try {
      const r = await generarSeguimiento(id);
      resultado =
        r.accion === "borrador"
          ? {
              id,
              numero: r.quotation_number,
              accion: "borrador",
              detalle: `borrador listo en ${buzonCorto(r.buzon)}${r.angulo ? `: ${r.angulo}` : ""}`,
              enlace: r.enlace,
            }
          : {
              id,
              numero: r.quotation_number,
              accion: "saltada",
              detalle: r.motivo || "no se escribió.",
              enlace: null,
            };
    } catch (e) {
      resultado = {
        id,
        numero,
        accion: "error",
        detalle: humanizeApiError(e, "No se pudo generar el seguimiento."),
        enlace: null,
      };
    } finally {
      setTrabajando(null);
    }
    setResultados((p) => [resultado, ...p.filter((x) => x.id !== id)]);
    return resultado;
  };

  const generar = async (s: Seguimiento) => {
    const r = await una(s);
    await refrescar(s.id);
    if (r.accion === "borrador") {
      toast.success(
        `N° ${r.numero}: ${r.detalle}. Revísalo en Outlook y envíalo desde ahí.`,
      );
    } else if (r.accion === "saltada") {
      toast.warn(`N° ${r.numero}: no se escribió, ${r.detalle}`);
    } else {
      toast.error(`N° ${r.numero}: ${r.detalle}`);
    }
    return r;
  };

  const generarTodos = async (lista: Seguimiento[]) => {
    const tanda = lista.slice(0, TOPE_POR_VEZ);
    if (tanda.length === 0) return;
    setLote({ hecho: 0, total: tanda.length });
    let borradores = 0;
    for (const [i, s] of tanda.entries()) {
      if ((await una(s)).accion === "borrador") borradores++;
      setLote({ hecho: i + 1, total: tanda.length });
      await refrescar(s.id);
    }
    setLote(null);
    const texto = `Seguimientos: ${borradores} borradores de ${tanda.length}.`;
    if (borradores === tanda.length) toast.success(texto);
    else
      toast.warn(`${texto} Los que no salieron quedan listados con su motivo.`);
  };

  return {
    pendientes: pendientesQuery.data ?? [],
    trabajando,
    lote,
    resultados,
    ocupado: trabajando !== null || lote !== null,
    resultadoDe: (id: string) => resultados.find((r) => r.id === id) ?? null,
    generar,
    generarTodos,
    limpiar: () => setResultados([]),
  };
}
