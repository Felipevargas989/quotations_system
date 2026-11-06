import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import {
  getListaDeFacturacion,
  type DocumentoDeLaLista,
} from "../../services/documentosTributarios.service";
import { fechaCorta } from "../../utils/ordenesDeCompra";
import { admiteLaNota, type TipoDeNota } from "./admiteLaNota";
import NotaDeUnDocumento from "./NotaDeUnDocumento";
import { ultimosMeses } from "./meses";

// LA NOTA DE «NUEVO DOCUMENTO» (doc 19 §9.21). Una nota de crédito o de
// débito siempre modifica un documento (§9.5): primero se elige cuál, y
// después va el panel de siempre («Anular completa», «Rebajar un monto»,
// «Corregir un texto»; de una nota de crédito, anularla con una de débito).

const clp = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;

export default function ElegirDocumento({
  tipo,
  onEmitida,
}: {
  readonly tipo: TipoDeNota;
  readonly onEmitida: () => void;
}) {
  const meses = ultimosMeses();
  const [mes, setMes] = useState(meses[0].value);
  const [elegido, setElegido] = useState<DocumentoDeLaLista | null>(null);
  const lista = useQuery({
    queryKey: ["facturacion", "lista", mes],
    queryFn: () => getListaDeFacturacion(mes),
  });
  const docs = (lista.data?.documentos ?? []).filter((d) =>
    admiteLaNota(tipo, d),
  );

  if (elegido)
    return (
      <NotaDeUnDocumento
        doc={elegido}
        onCerrar={() => setElegido(null)}
        onEmitida={() => {
          setElegido(null);
          onEmitida();
        }}
      />
    );

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-700">
          {tipo === "nota_credito"
            ? "¿De qué documento?"
            : "¿Qué nota de crédito anula?"}
        </p>
        <div className="w-44">
          <SelectWithSearch
            options={meses}
            value={mes}
            onChange={(v) => v && setMes(v)}
            tamano="sm"
            sinLimpiar
            mostrarConteo={false}
          />
        </div>
      </div>
      {lista.isPending ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-gray-500">
          {tipo === "nota_credito"
            ? "Ningún documento de este mes admite una nota de crédito."
            : "Ninguna nota de crédito de este mes se puede anular."}
        </p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {docs.map((d) => (
              <tr key={d.id}>
                <td className="py-1.5 pr-2 font-semibold text-gray-900">
                  {d.titulo}
                </td>
                <td className="py-1.5 pr-2 text-gray-700">
                  {d.cliente ?? "—"}
                </td>
                <td className="py-1.5 pr-2 text-gray-500 whitespace-nowrap">
                  {d.fecha_emision ? fechaCorta(d.fecha_emision) : "—"}
                </td>
                <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                  {clp(d.total)}
                </td>
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => setElegido(d)}
                    className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Elegir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
