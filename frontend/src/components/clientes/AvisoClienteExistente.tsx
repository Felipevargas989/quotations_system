import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CoincidenciaCliente,
  admiteOtroContacto,
  detalleDeCoincidencia,
  motivoCorto,
  tituloConLista,
  tituloDelAviso,
} from "../../utils/avisoCliente";

// El aviso ámbar que aparece DENTRO de la ventana "Crear nuevo cliente"
// cuando el motor encontró un cliente parecido (16-10-2026). Es la misma
// pieza en Recepción, el cotizador y Clientes: se arregla acá y las tres
// pantallas la reciben. No crea ni elige nada: avisa a quien la usa.
//
// Un solo juego de botones (Felipe, 16-10: "¿cómo fusionamos el aviso
// para que no se vea así?"): con un parecido se dice en una frase; con
// varios, una lista para elegir con el más probable ya marcado, y los
// botones actúan sobre el marcado.
interface Props {
  coincidencias: CoincidenciaCliente[];
  ocupado: boolean;
  onUsar: (c: CoincidenciaCliente) => void;
  onSumarContacto: (c: CoincidenciaCliente) => void;
  onCrearIgual: () => void;
}

// Botones parejos, uno bajo el otro (Felipe, 16-10: "podemos ordenar un
// poquito los botones"): primero lo más común, al final la salida para
// todos, separada por una línea.
const boton =
  "w-full rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50";
const usar = `${boton} bg-amber-600 text-white hover:bg-amber-700`;
const sumar = `${boton} border border-amber-300 bg-white text-amber-900 hover:bg-amber-100`;
const otro = `${boton} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;

export default function AvisoClienteExistente({
  coincidencias,
  ocupado,
  onUsar,
  onSumarContacto,
  onCrearIgual,
}: Props) {
  // Llega una lista nueva (se siguió escribiendo): vuelve al más probable.
  const [marcado, setMarcado] = useState(0);
  useEffect(() => setMarcado(0), [coincidencias]);
  const varios = coincidencias.length > 1;
  const c = coincidencias[Math.min(marcado, coincidencias.length - 1)];

  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="flex-1 space-y-3">
          <p className="font-semibold">
            {varios
              ? tituloConLista(coincidencias)
              : tituloDelAviso(coincidencias)}
          </p>
          {varios ? (
            <div role="radiogroup" className="grid gap-1.5">
              {coincidencias.map((x, i) => (
                <button
                  key={x.cliente_id}
                  type="button"
                  role="radio"
                  aria-checked={i === marcado}
                  disabled={ocupado}
                  onClick={() => setMarcado(i)}
                  className={`w-full rounded-lg border bg-white px-3 py-2 text-left ${
                    i === marcado
                      ? "border-amber-500 ring-1 ring-amber-500"
                      : "border-gray-200 hover:border-amber-300"
                  }`}
                >
                  <span className="block font-medium text-gray-900">
                    {x.nombre}
                  </span>
                  <span className="block text-xs text-gray-600">
                    {motivoCorto(x)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p>{detalleDeCoincidencia(c)}</p>
          )}
          <div className="grid gap-2">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => onUsar(c)}
              className={usar}
            >
              Usar este cliente
            </button>
            {admiteOtroContacto(c) && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => onSumarContacto(c)}
                className={sumar}
              >
                Sumar como contacto a este cliente
              </button>
            )}
          </div>
          <div className="border-t border-amber-200 pt-3">
            <button
              type="button"
              disabled={ocupado}
              onClick={onCrearIgual}
              className={otro}
            >
              Es otro cliente, crear igual
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
