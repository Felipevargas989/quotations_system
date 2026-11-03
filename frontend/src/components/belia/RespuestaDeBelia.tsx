import { Link } from "react-router-dom";
import { bloquesDe, type Trozo } from "./belia";

// Lo que contesta BelIA, con sus tablas, listas, negritas y enlaces a las
// fichas. Solo elementos de React: ningún texto se vuelve HTML.

type Props = {
  texto: string;
  /** Al pinchar un enlace (en el celular, la ventanilla se recoge). */
  alNavegar?: () => void;
};

const Linea = ({
  trozos,
  alNavegar,
}: {
  trozos: Trozo[];
  alNavegar?: () => void;
}) => (
  <>
    {trozos.map((t, i) =>
      t.tipo === "negrita" ? (
        <strong key={i} className="font-semibold text-slate-900">
          {t.texto}
        </strong>
      ) : t.tipo === "enlace" ? (
        <Link
          key={i}
          to={t.ruta}
          onClick={alNavegar}
          className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-800"
        >
          {t.texto}
        </Link>
      ) : (
        <span key={i}>{t.texto}</span>
      ),
    )}
  </>
);

export default function RespuestaDeBelia({ texto, alNavegar }: Props) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-700">
      {bloquesDe(texto).map((b, i) => {
        if (b.tipo === "tabla") {
          return (
            <div
              key={i}
              className="overflow-x-auto rounded-lg border border-slate-200"
            >
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {b.cabecera.map((c, j) => (
                      <th
                        key={j}
                        className="whitespace-nowrap px-2 py-1.5 text-left font-semibold"
                      >
                        <Linea trozos={c} alNavegar={alNavegar} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {b.filas.map((fila, j) => (
                    <tr key={j}>
                      {fila.map((c, k) => (
                        <td key={k} className="px-2 py-1.5 align-top">
                          <Linea trozos={c} alNavegar={alNavegar} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (b.tipo === "lista") {
          const Lista = b.ordenada ? "ol" : "ul";
          return (
            <Lista
              key={i}
              className={`${b.ordenada ? "list-decimal" : "list-disc"} space-y-1 pl-5`}
            >
              {b.items.map((it, j) => (
                <li key={j}>
                  <Linea trozos={it} alNavegar={alNavegar} />
                </li>
              ))}
            </Lista>
          );
        }
        return (
          <p key={i}>
            {b.lineas.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <Linea trozos={l} alNavegar={alNavegar} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
