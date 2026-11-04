import { useEffect, useState, type CSSProperties } from "react";
import type { Animo } from "./belia";

// LA CARA DE BELIA (doc 20 §8b): el dibujo de Bela que Felipe aprobó,
// recortado en seis piezas (cuerpo, orejas, ojos y boca, en
// `public/belia/`) más los párpados, las cejas, la boca cerrada, el
// notebook y las señales dibujados encima. Las piezas y los números de cada
// pose son los de la demo de GPT del 03-11; el diseño no se toca.
//
// Dos cambios a la demo, aprobados por Felipe ("si dale"):
//  1. No hay una animación corriendo todo el tiempo: cada pose es fija y
//     se pasa de una a otra con una transición corta. Lo único que se
//     repite es el pestañeo cada 5 a 10 s, y respirar cuando duerme.
//  2. Las señales (Zzz, ondas, rayitas) van más adentro, para que se vean
//     en el botón redondo.

const PIEZAS = "/belia";

type Pose = {
  izq: number;
  der: number;
  giro: number;
  ojoX: number;
  ojoY: number;
  baja: number;
  ojosCerrados?: boolean;
  bocaCerrada?: boolean;
  cejas?: boolean;
  notebook?: boolean;
  senal?: "zzz" | "fiesta" | "enojo" | "ladrido" | "duda";
  roja?: boolean;
};

const QUIETA = { izq: 0, der: 0, giro: 0, ojoX: 0, ojoY: 0, baja: 0 };

const POSES: Record<Animo, Pose> = {
  espera: QUIETA,
  pensando: {
    ...QUIETA,
    izq: 4,
    der: -4,
    giro: -2.2,
    ojoX: 2.5,
    ojoY: -1.7,
    senal: "duda",
  },
  trabajando: {
    ...QUIETA,
    izq: 2,
    der: -4,
    giro: 0.3,
    ojoX: 0.5,
    ojoY: 1,
    notebook: true,
  },
  enojada: {
    ...QUIETA,
    izq: 7.5,
    der: -8.5,
    baja: -3,
    bocaCerrada: true,
    cejas: true,
    senal: "enojo",
    roja: true,
  },
  celebra: { ...QUIETA, izq: 7, der: -9, giro: -2, baja: -2, senal: "fiesta" },
  dormida: {
    ...QUIETA,
    izq: -5,
    der: 6,
    giro: 2.4,
    baja: 7,
    ojosCerrados: true,
    bocaCerrada: true,
    senal: "zzz",
  },
  atencion: {
    ...QUIETA,
    izq: 7,
    der: -9,
    giro: -1.8,
    baja: -2,
    senal: "ladrido",
  },
};

// El movimiento de todo el botón, en px de pantalla: termina, salvo
// respirar dormida (la regla de «vibrar»: tres veces y para).
const MOVIMIENTO: Record<Animo, string> = {
  espera: "",
  pensando: "",
  trabajando: "",
  atencion: "animate-belia-saltito",
  enojada: "animate-belia-sacudida",
  celebra: "animate-belia-saltito",
  dormida: "animate-belia-respirar",
};

const quieta = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Cierra los ojos 150 ms cada 5 a 10 s, solo con la pestaña a la vista. */
function usePestaneo(activo: boolean): boolean {
  const [cerrados, setCerrados] = useState(false);
  useEffect(() => {
    if (!activo || quieta()) return;
    let espera: ReturnType<typeof setTimeout>;
    let abre: ReturnType<typeof setTimeout>;
    const programar = () => {
      espera = setTimeout(
        () => {
          if (document.hidden) return programar();
          setCerrados(true);
          abre = setTimeout(() => {
            setCerrados(false);
            programar();
          }, 150);
        },
        5000 + Math.random() * 5000,
      );
    };
    programar();
    return () => {
      clearTimeout(espera);
      clearTimeout(abre);
      setCerrados(false);
    };
  }, [activo]);
  return cerrados;
}

type Props = {
  animo: Animo;
  /** Diámetro en px. */
  tamano?: number;
};

export default function BeliaAvatar({ animo, tamano = 56 }: Props) {
  const p = POSES[animo];
  const pestanea = usePestaneo(!p.ojosCerrados);
  const ojosCerrados = Boolean(p.ojosCerrados) || pestanea;
  const lenta = quieta() ? "none" : "transform 380ms ease, opacity 220ms ease";
  const pieza = (transform: string, origen?: string): CSSProperties => ({
    transform,
    transformOrigin: origen,
    transformBox: "view-box",
    transition: lenta,
  });
  const ver = (si: boolean | undefined, ms = 220): CSSProperties => ({
    opacity: si ? 1 : 0,
    transition: quieta() ? "none" : `opacity ${ms}ms ease`,
  });

  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 overflow-hidden rounded-full ring-[3px] ring-white transition-colors duration-500 ${
        p.roja ? "bg-rose-500" : "bg-blue-600"
      } ${MOVIMIENTO[animo]}`}
      style={{ width: tamano, height: tamano }}
    >
      <svg viewBox="65 15 410 410" className="h-full w-full">
        <g
          style={pieza(
            `translate(0px, ${p.baja}px) rotate(${p.giro}deg)`,
            "282px 403px",
          )}
        >
          {/* Lo que queda bajo los recortes, para que las piezas se muevan
              sin dejar hoyos (de la demo de GPT). */}
          <path
            d="M163 242 C151 186 174 113 214 79 Q268 38 327 56 C371 65 398 103 408 154 Q421 223 398 269 L384 317 Q324 360 253 321 L187 300Z"
            fill="#30343f"
            stroke="#0b1429"
            strokeWidth="8"
          />
          <path
            d="M128 293 C127 255 139 213 147 171 Q151 115 182 94 C203 93 218 124 210 192 L194 287Z"
            fill="#30343f"
          />
          <path
            d="M326 64 C371 49 422 69 430 120 L416 193 Q373 209 341 175Z"
            fill="#30343f"
          />
          <path
            d="M291 255 Q315 241 359 237 Q382 238 384 274 Q383 307 351 310 Q322 299 291 255Z"
            fill="#30343f"
          />
          <path
            d="M212 160 Q221 119 249 129 Q279 141 266 185 Q239 200 214 182Z"
            fill="#323640"
          />
          <path
            d="M313 135 Q314 105 342 100 Q372 115 364 154 Q340 168 319 153Z"
            fill="#323640"
          />
          <image
            href={`${PIEZAS}/cuerpo.png`}
            x="0"
            y="0"
            width="530"
            height="455"
            preserveAspectRatio="none"
          />

          <g style={pieza(`rotate(${p.izq}deg)`, "171px 123px")}>
            <image
              href={`${PIEZAS}/oreja-izquierda.png`}
              x="0"
              y="0"
              width="530"
              height="455"
              preserveAspectRatio="none"
            />
          </g>
          <g style={pieza(`rotate(${p.der}deg)`, "369px 80px")}>
            <image
              href={`${PIEZAS}/oreja-derecha.png`}
              x="0"
              y="0"
              width="530"
              height="455"
              preserveAspectRatio="none"
            />
          </g>

          <g
            style={{
              ...pieza(`translate(${p.ojoX}px, ${p.ojoY}px)`),
              opacity: ojosCerrados ? 0 : 1,
            }}
          >
            <image
              href={`${PIEZAS}/ojo-izquierdo.png`}
              x="0"
              y="0"
              width="530"
              height="455"
              preserveAspectRatio="none"
            />
            <image
              href={`${PIEZAS}/ojo-derecho.png`}
              x="0"
              y="0"
              width="530"
              height="455"
              preserveAspectRatio="none"
            />
          </g>
          <g style={ver(ojosCerrados, 90)}>
            <path
              d="M215 156 Q218 137 244 137 Q263 139 270 158 Q262 180 241 179 Q223 180 215 156Z"
              fill="#30343f"
            />
            <path
              d="M216 157 Q242 170 268 155"
              fill="none"
              stroke="#0b152a"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M318 128 Q326 109 345 113 Q359 115 366 132 Q360 148 340 148 Q326 146 318 128Z"
              fill="#30343f"
            />
            <path
              d="M320 130 Q344 141 364 129"
              fill="none"
              stroke="#0b152a"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </g>

          <g style={ver(!p.bocaCerrada)}>
            <image
              href={`${PIEZAS}/boca.png`}
              x="0"
              y="0"
              width="530"
              height="455"
              preserveAspectRatio="none"
            />
          </g>
          <g
            style={ver(p.bocaCerrada)}
            fill="none"
            stroke="#0d172b"
            strokeLinecap="round"
          >
            <path d="M308 272 Q335 278 365 266" strokeWidth="6.5" />
            <path d="M304 272 l-7 -5 M374 267 l3 -7" strokeWidth="4" />
          </g>
          <g
            style={ver(p.cejas)}
            fill="none"
            stroke="#081327"
            strokeWidth="11"
            strokeLinecap="round"
          >
            <path d="M214 124 Q236 128 262 146" />
            <path d="M322 143 Q340 119 363 115" />
          </g>
          <g style={ver(p.notebook)}>
            <path
              d="M292 333 L434 320 Q445 320 442 332 L422 397 Q420 404 408 405 L302 406 Z"
              fill="#e9f3ff"
              stroke="#07172c"
              strokeWidth="8"
              strokeLinejoin="round"
            />
            <path
              d="M281 404 L441 404 L451 414 L273 414Z"
              fill="#8eaed3"
              stroke="#07172c"
              strokeWidth="5"
            />
            <path d="M355 357 l18 -3 -8 12 -15 3Z" fill="#0781f9" />
          </g>
        </g>

        {/* Las señales, en blanco y más adentro que en la demo: sobre el
            fondo azul o rojo del botón, las azules y rojas no se verían. */}
        <g
          style={ver(p.senal === "zzz")}
          transform="translate(-58 24)"
          fill="#ffffff"
          fontFamily="system-ui, Arial, sans-serif"
          fontWeight="900"
          textAnchor="middle"
        >
          <text x="417" y="110" fontSize="47">
            Z
          </text>
          <text x="455" y="69" fontSize="32">
            z
          </text>
          <text x="481" y="39" fontSize="22">
            z
          </text>
        </g>
        <g
          style={ver(p.senal === "duda")}
          fill="#ffffff"
          fontFamily="system-ui, Arial, sans-serif"
          fontWeight="900"
          textAnchor="middle"
        >
          <text x="402" y="92" fontSize="58">
            ?
          </text>
        </g>
        <g
          style={ver(p.senal === "fiesta" || p.senal === "enojo")}
          transform="translate(80 34)"
          fill="none"
          stroke="#ffffff"
          strokeWidth="9"
          strokeLinecap="round"
        >
          <path d="M83 73 L64 50 M112 58 L106 28 M59 104 L29 100" />
        </g>
        <g
          style={ver(p.senal === "ladrido")}
          transform="translate(-44 0)"
          fill="none"
          stroke="#ffffff"
          strokeWidth="8"
          strokeLinecap="round"
        >
          <path d="M435 210 Q460 224 438 252 M456 194 Q491 222 461 269" />
        </g>
      </svg>
    </span>
  );
}
