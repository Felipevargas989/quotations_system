import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { fechaCorta } from "../../utils/ordenesDeCompra";
import EmitirDte from "../postventa/facturacion/EmitirDte";
import { LLAVE_POR_FACTURAR, usePorFacturar } from "./consultas";
import FacturacionMasiva from "./FacturacionMasiva";

// «POR FACTURAR» (doc 19 §9.21). Felipe, 06-11: *"los eventos que no se
// hayan facturado (…) y los pudiera como facturar de acá"*. Los eventos
// aceptados o realizados de los últimos 90 días (y los que vienen) con algo
// por emitir: el total, lo emitido (facturas y boletas, con la cadena) y lo
// que queda. «Facturar» abre ahí mismo el mismo «Emitir DTE» del evento:
// BelIA lee sus OC de Documentos y se llena desde la OC o la cotización.
// Desde el 07-11 (§9.23) es el único lugar donde se factura un evento (la
// pestaña de Post-Venta salió), y lo ve y lo emite quien tiene «Facturar
// eventos» (operaciones y el administrador, de fábrica), que además puede
// marcar varios y facturarlos juntos (`FacturacionMasiva`).

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

export default function PorFacturar() {
  const queryClient = useQueryClient();
  const lista = usePorFacturar();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [masiva, setMasiva] = useState<string[] | null>(null);
  const eventos = lista.data?.eventos ?? [];
  const marcar = (id: string, si: boolean) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (si) n.add(id);
      else n.delete(id);
      return n;
    });
  const todos = eventos.length > 0 && eventos.every((e) => marcados.has(e.id));

  const emitido = () => {
    setAbierto(null);
    void queryClient.invalidateQueries({ queryKey: LLAVE_POR_FACTURAR });
    void queryClient.invalidateQueries({ queryKey: ["facturacion", "lista"] });
  };

  if (lista.isPending)
    return <p className="text-sm text-gray-400">Cargando…</p>;
  if (lista.isError)
    return (
      <p className="text-sm text-red-600">
        No se pudo cargar lo que falta por facturar.
      </p>
    );
  if (eventos.length === 0)
    return (
      <p className="text-sm text-gray-500">
        Todos los eventos desde el {fechaCorta(lista.data.desde)} están
        emitidos.
      </p>
    );

  return (
    <div className="space-y-3">
      {masiva && (
        <FacturacionMasiva
          eventos={eventos.filter((e) => masiva.includes(e.id))}
          onCerrar={() => {
            setMasiva(null);
            setMarcados(new Set());
          }}
          onEmitidos={() => {
            void queryClient.invalidateQueries({
              queryKey: LLAVE_POR_FACTURAR,
            });
            void queryClient.invalidateQueries({
              queryKey: ["facturacion", "lista"],
            });
          }}
        />
      )}
      {marcados.size > 0 && !masiva && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setMasiva([...marcados])}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
          >
            Facturar{" "}
            {marcados.size === 1
              ? "el marcado"
              : `los ${marcados.size} marcados`}
          </button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="w-6 py-1">
                <input
                  type="checkbox"
                  aria-label="Marcar todos"
                  checked={todos}
                  onChange={(ev) =>
                    setMarcados(
                      ev.target.checked
                        ? new Set(eventos.map((e) => e.id))
                        : new Set(),
                    )
                  }
                />
              </th>
              <th className="py-1 font-medium">Evento</th>
              <th className="py-1 font-medium">Cliente</th>
              <th className="py-1 font-medium">Fecha</th>
              <th className="py-1 text-right font-medium">Total</th>
              <th className="py-1 text-right font-medium">Emitido</th>
              <th className="py-1 text-right font-medium">Queda</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {eventos.map((e) => (
              <Fragment key={e.id}>
                <tr className="align-top">
                  <td className="py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Marcar el #${e.numero}`}
                      checked={marcados.has(e.id)}
                      onChange={(ev) => marcar(e.id, ev.target.checked)}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Link
                      to={`/post-venta/${e.id}`}
                      className="font-semibold text-blue-700 hover:underline"
                    >
                      #{e.numero}
                    </Link>
                    {e.tipoDeEvento && (
                      <span className="block text-xs text-gray-500">
                        {e.tipoDeEvento}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-gray-700">
                    {e.cliente ?? "—"}
                    {e.ocs > 0 && (
                      <span className="block text-xs text-gray-500">
                        {e.ocs} OC
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap text-gray-600">
                    {e.fecha ? fechaCorta(e.fecha) : "—"}
                  </td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                    {clp(e.total)}
                  </td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap text-gray-600">
                    {clp(e.emitido)}
                  </td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap font-semibold text-gray-900">
                    {clp(e.queda)}
                  </td>
                  <td className="py-1.5 text-right">
                    {abierto !== e.id && (
                      <button
                        type="button"
                        onClick={() => setAbierto(e.id)}
                        className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700"
                      >
                        <FileText size={12} /> Facturar
                      </button>
                    )}
                  </td>
                </tr>
                {abierto === e.id && (
                  <tr>
                    <td colSpan={8} className="pb-3">
                      <EmitirDte
                        quotationId={e.id}
                        puedeEmitir
                        onCerrar={() => setAbierto(null)}
                        onEmitido={emitido}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
