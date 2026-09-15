import { ReactNode } from "react";
import SoloConDerecho from "../../../components/SoloConDerecho";

// RECETAS Y COSTOS SON DEL PLAN OPERA Y CRECE (14-09-2026, paso 3.2).
//
// El plan Cotiza trae el catálogo de servicios con sus precios, pero no las
// recetas ni los costos de producirlos: eso es logística y se vende aparte.
//
// La mecánica es la misma que usan Post-Venta y el resto: vive en
// `components/SoloConDerecho`. Acá queda solo el nombre con sentido de
// negocio, que es lo que se lee en las pantallas del catálogo.
export default function SoloConLogistica({
  children,
}: {
  readonly children: ReactNode;
}) {
  return <SoloConDerecho derecho="logistica">{children}</SoloConDerecho>;
}
