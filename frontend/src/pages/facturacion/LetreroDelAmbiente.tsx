import type { Ambiente } from "../../services/facturas.service";

// DÓNDE SE EMITE (doc 19 §9.10 y §9.18): el letrero de arriba de
// Facturación, de Boletas y de la pestaña Facturación del evento. Simulado
// (pasos 1 a 4), el ambiente de prueba de facturacion.cl (paso 5) o sin
// conexión, con el porqué que da el motor. En producción y conectado, nada.

export default function LetreroDelAmbiente({
  ambiente,
  sinConexion,
  que,
}: {
  readonly ambiente?: Ambiente;
  readonly sinConexion?: string | null;
  /** «Los documentos», «Las facturas», «Las boletas». */
  readonly que: string;
}) {
  if (sinConexion)
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
        No se puede emitir: {sinConexion}.
      </p>
    );
  if (ambiente === "simulado")
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Modo simulado: facturacion.cl todavía no está conectado. {que} se arman
        y se numeran, pero no sale nada al SII.
      </p>
    );
  if (ambiente === "prueba")
    return (
      <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        Modo prueba: {que.toLowerCase()} salen en el ambiente de pruebas de
        facturacion.cl. No valen ante el SII y no se le mandan a nadie por
        correo.
      </p>
    );
  return null;
}
