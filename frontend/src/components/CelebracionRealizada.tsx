// EL UNICORNIO DE EVENTIA v2 — "modo fiesta" (05-08-2026, Felipe pidió
// más: más confeti, fuegos artificiales y el gatito del arcoíris). Al
// marcar un evento REALIZADO — la meta de todo el embudo — se celebra
// en grande. Hecho 100% en casa: sin librerías, CSS puro, un gato
// pixelado propio estilo 8-bit (primo del famoso, no copia) y colores
// de la marca. Breve, alegre, jamás estorba: clic/Escape y se va.
import { useEffect, useMemo } from "react";

const COLORES = [
  "#2563eb", // azul de la casa
  "#f59e0b", // ámbar
  "#10b981", // esmeralda
  "#8b5cf6", // morado
  "#f43f5e", // rosa
  "#facc15", // dorado (la estrella de alto valor)
];
const ARCOIRIS = [
  "#f43f5e",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
];

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

// Bella, la perrita de la casa (imagen generada por Felipe, 05-08):
// la estrella oficial de la celebración, volando con su arcoíris.

export default function CelebracionRealizada({
  cliente,
  tipoEvento,
  personas,
  monto,
  diasGestion,
  onClose,
}: {
  readonly cliente: string;
  readonly tipoEvento?: string;
  readonly personas?: number;
  readonly monto: number;
  // Del primer contacto (creación de la cotización) al gran día.
  readonly diasGestion?: number | null;
  readonly onClose: () => void;
}) {
  // 140 papelitos en dos oleadas + 24 serpentinas.
  const papelitos = useMemo(
    () =>
      Array.from({ length: 140 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 2.4,
        dur: 2.6 + Math.random() * 2.6,
        color: COLORES[i % COLORES.length],
        ancho: i % 6 === 0 ? 3 : 6 + Math.random() * 7,
        alto: i % 6 === 0 ? 16 + Math.random() * 10 : 9 + Math.random() * 9,
        giro: Math.random() * 360,
        vaiven: Math.random() > 0.5 ? 1 : -1,
      })),
    [],
  );
  // 6 fuegos artificiales: posición y momento aleatorios, 14 chispas.
  const fuegos = useMemo(
    () =>
      Array.from({ length: 6 }, (_, f) => ({
        x: 12 + Math.random() * 76,
        y: 12 + Math.random() * 40,
        delay: 0.2 + f * 0.55 + Math.random() * 0.3,
        color: COLORES[f % COLORES.length],
        chispas: Array.from({ length: 14 }, (_, c) => {
          const ang = (c / 14) * Math.PI * 2;
          const r = 60 + Math.random() * 50;
          return {
            dx: Math.cos(ang) * r,
            dy: Math.sin(ang) * r,
          };
        }),
      })),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 overflow-hidden"
      onClick={onClose}
      role="presentation"
    >
      <style>{`
        @keyframes evt-confeti-caida {
          0% { transform: translate(0, -12vh) rotate(0deg); opacity: 1; }
          25% { transform: translate(calc(var(--vv) * 4vw), 22vh) rotate(180deg); }
          50% { transform: translate(calc(var(--vv) * -3vw), 48vh) rotate(360deg); }
          80% { opacity: 1; }
          100% { transform: translate(calc(var(--vv) * 3vw), 108vh) rotate(720deg); opacity: 0; }
        }
        @keyframes evt-chispa {
          0% { transform: translate(0, 0) scale(1); opacity: 0; }
          8% { opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0.25); opacity: 0; }
        }
        @keyframes evt-destello {
          0%, 100% { opacity: 0; transform: scale(0.4); }
          10% { opacity: 1; transform: scale(1.5); }
          30% { opacity: 0; transform: scale(0.6); }
        }
        @keyframes evt-gato-cruce {
          0% { transform: translateX(-70vw); }
          100% { transform: translateX(170vw); }
        }
        @keyframes evt-gato-paseo {
          0%, 100% { transform: translateY(0); }
          25% { transform: translateY(-18px); }
          75% { transform: translateY(18px); }
        }
        @keyframes evt-gato-bamboleo {
          0% { transform: translateY(0); }
          100% { transform: translateY(-6px); }
        }
        @keyframes evt-brinco {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.07); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* Confeti a mares */}
      {papelitos.map((p, i) => (
        <span
          key={`c${i}`}
          className="absolute top-0 rounded-[2px] pointer-events-none"
          style={
            {
              left: `${p.left}%`,
              width: p.ancho,
              height: p.alto,
              backgroundColor: p.color,
              "--vv": p.vaiven,
              transform: `rotate(${p.giro}deg)`,
              animation: `evt-confeti-caida ${p.dur}s ease-in ${p.delay}s infinite`,
            } as React.CSSProperties
          }
        />
      ))}

      {/* Fuegos artificiales */}
      {fuegos.map((f, i) => (
        <span
          key={`f${i}`}
          className="absolute pointer-events-none"
          style={{ left: `${f.x}%`, top: `${f.y}%` }}
        >
          <span
            className="absolute w-4 h-4 rounded-full"
            style={{
              backgroundColor: f.color,
              boxShadow: `0 0 18px 6px ${f.color}`,
              animation: `evt-destello 2.6s ease-out ${f.delay}s infinite`,
            }}
          />
          {f.chispas.map((ch, c) => (
            <span
              key={c}
              className="absolute w-1.5 h-1.5 rounded-full"
              style={
                {
                  backgroundColor: c % 3 === 0 ? "#fff" : f.color,
                  "--dx": `${ch.dx}px`,
                  "--dy": `${ch.dy}px`,
                  animation: `evt-chispa 1.4s ease-out ${f.delay}s infinite`,
                } as React.CSSProperties
              }
            />
          ))}
        </span>
      ))}

      {/* El gatito del arcoíris: se pasea ondulando por la pantalla
          dejando su cola de arcoíris gruesa (estilo del meme, dibujo
          propio de la casa). */}
      <div
        className="absolute top-[14%] left-0 pointer-events-none"
        style={{ animation: "evt-gato-cruce 7s linear 0.4s infinite" }}
      >
        <div style={{ animation: "evt-gato-paseo 3.5s ease-in-out infinite" }}>
          <div className="relative flex items-center">
            {/* la cola de arcoíris, gruesa y con punta redonda */}
            <div className="flex flex-col overflow-hidden rounded-l-full opacity-95">
              {ARCOIRIS.map((c) => (
                <div
                  key={c}
                  style={{ backgroundColor: c, width: "55vw", height: 11 }}
                />
              ))}
            </div>
            <div
              className="-ml-4"
              style={{
                animation:
                  "evt-gato-bamboleo 0.45s steps(2, end) infinite alternate",
              }}
            >
              <img
                src="/images/bella-realizada.png"
                alt=""
                style={{ width: 190, height: "auto" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* La tarjeta del hito */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl px-8 pt-7 pb-8 max-w-md w-[92%] text-center ring-4 ring-amber-300/60"
        style={{ animation: "evt-brinco 0.45s ease-out both" }}
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <p className="text-6xl mb-2" style={{ animation: "evt-brinco 0.7s ease-out both" }}>
          🎉
        </p>
        <h2 className="text-3xl font-extrabold bg-gradient-to-r from-blue-600 via-purple-500 to-rose-500 bg-clip-text text-transparent">
          ¡Evento realizado!
        </h2>
        <p className="text-sm font-semibold text-gray-800 mt-3">
          {[tipoEvento, cliente].filter(Boolean).join(" · ")}
        </p>
        <p className="text-sm text-gray-600 mt-0.5">
          {[
            personas ? `${personas} personas` : null,
            monto > 0 ? clp(monto) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {typeof diasGestion === "number" && diasGestion > 0 && (
          <p className="text-xs text-gray-400 mt-3">
            Del primer contacto al gran día:{" "}
            <span className="font-bold text-gray-600">
              {diasGestion} {diasGestion === 1 ? "día" : "días"} de gestión
            </span>
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-6 px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl text-sm font-bold hover:from-blue-700 hover:to-purple-700 shadow-lg"
        >
          ¡Seguimos! 🚀
        </button>
      </div>
    </div>
  );
}
