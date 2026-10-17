import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "../components/toast/Toast";
import { generarConIA } from "../services/quotations.service";
import { humanizeApiError } from "../utils/apiErrors";

// «✨ CREAR CON IA» Y «✨ GENERAR TODAS» (Felipe, 17-10-2026; doc 16 §6).
//
// El motor arma cada requerimiento con Claude y lo deja en solicitada,
// como cotización (tarda cerca de un minuto). De a una, también en «Generar
// todas»: la cuenta de Anthropic es nueva, con poco cupo por minuto, y la
// comparte el radar de licitaciones. Lo que se armó queda listado con su
// enlace para revisarlo antes de enviarlo; nunca se envía nada.

export type ArmadaConIA = { id: string; numero: number; total: number };
export type FallidaConIA = { id: string; numero: number; motivo: string };
export type Requerimiento = { id: string; numero: number };

export function useCrearConIA() {
  const queryClient = useQueryClient();
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [lote, setLote] = useState<{ hecho: number; total: number } | null>(
    null,
  );
  const [armadas, setArmadas] = useState<ArmadaConIA[]>([]);
  const [fallidas, setFallidas] = useState<FallidaConIA[]>([]);

  // Sale de Requerimientos y aparece en el tablero de cotizaciones.
  const refrescar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["requirements"] }),
      queryClient.invalidateQueries({ queryKey: ["quotations"] }),
    ]);

  const una = async ({ id, numero }: Requerimiento): Promise<boolean> => {
    setTrabajando(id);
    try {
      const r = await generarConIA(id);
      setArmadas((p) => [
        { id, numero: r.quotation_number, total: r.total_amount },
        ...p,
      ]);
      return true;
    } catch (e) {
      setFallidas((p) => [
        {
          id,
          numero,
          motivo: humanizeApiError(e, "No se pudo armar con IA."),
        },
        ...p,
      ]);
      return false;
    } finally {
      setTrabajando(null);
    }
  };

  const crear = async (req: Requerimiento): Promise<boolean> => {
    const ok = await una(req);
    await refrescar();
    if (ok) {
      toast.success(
        `N° ${req.numero} armada con IA: quedó en solicitada. Revísala antes de enviarla.`,
      );
    } else {
      toast.error(`N° ${req.numero}: no se pudo armar con IA.`);
    }
    return ok;
  };

  const generarTodas = async (lista: Requerimiento[]) => {
    if (lista.length === 0) return;
    setLote({ hecho: 0, total: lista.length });
    let bien = 0;
    for (const [i, req] of lista.entries()) {
      if (await una(req)) bien++;
      setLote({ hecho: i + 1, total: lista.length });
      await refrescar();
    }
    setLote(null);
    const texto = `Armadas con IA: ${bien} de ${lista.length}.`;
    if (bien === lista.length) toast.success(texto);
    else toast.warn(`${texto} Las que fallaron quedan listadas.`);
  };

  return {
    trabajando,
    lote,
    armadas,
    fallidas,
    ocupado: trabajando !== null || lote !== null,
    crear,
    generarTodas,
    limpiar: () => {
      setArmadas([]);
      setFallidas([]);
    },
  };
}
