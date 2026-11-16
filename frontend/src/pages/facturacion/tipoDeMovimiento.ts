import type {
  MovimientoDeCaja,
  RetiroDeCaja,
  TipoDeMovimiento,
} from "../../services/caja.service";

// Cómo se ve cada movimiento de la caja (doc 19 §9.51): el ingreso en verde
// con +, el retiro en rojo con −. Lo usan la caja y la revisión del cierre.

export const TIPO: Record<
  TipoDeMovimiento,
  {
    chip: string;
    claseChip: string;
    claseMonto: string;
    signo: string;
    boton: string;
    claseBoton: string;
    placeholder: string;
  }
> = {
  ingreso: {
    chip: "Ingreso",
    claseChip: "bg-green-100 text-green-800",
    claseMonto: "text-green-700",
    signo: "+",
    boton: "+ Anotar ingreso",
    claseBoton:
      "rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50",
    placeholder: "Sencillo que mandó Felipe",
  },
  retiro: {
    chip: "Retiro",
    claseChip: "bg-red-100 text-red-800",
    claseMonto: "text-red-700",
    signo: "−",
    boton: "− Anotar retiro",
    claseBoton:
      "rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50",
    placeholder: "Entregado a administración",
  },
};

/** Los movimientos por hora, o los retiros si el motor es el de antes (solo
 *  manda `retiros`). */
export const movimientosDe = (c: {
  movimientos?: MovimientoDeCaja[];
  retiros: RetiroDeCaja[];
}): MovimientoDeCaja[] =>
  (
    c.movimientos ??
    c.retiros.map((r) => ({
      ...r,
      tipo: "retiro" as const,
      creado_por_nombre: null,
    }))
  )
    .slice()
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
