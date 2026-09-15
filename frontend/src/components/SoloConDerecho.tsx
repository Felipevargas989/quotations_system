import { ReactNode } from "react";
import { Derecho, tieneDerecho } from "../constants/permissions";
import { useAuth } from "../contexts/AuthContext";
import MejoraTuPlan from "./MejoraTuPlan";

// EL PORTERO DE UNA PIEZA DE PANTALLA (14-09-2026, paso 3.2 del roadmap).
//
// Envuelve una pestaña, una sección o un bloque que pertenece a un plan
// superior. Si la empresa no tiene el derecho, en su lugar aparece la
// invitación a mejorar; si lo tiene, no se nota que existe.
//
// Dos razones para envolver POR FUERA y no poner un `if` adentro:
//  - Las consultas de la pieza ni siquiera salen. El motor las niega igual
//    con 403 —el candado de verdad está allá—, y pedirlas de todos modos
//    solo llenaría el registro de errores que nadie va a mirar.
//  - Adentro habría que devolver antes de los hooks, que es justo lo que
//    el lint prohíbe.
//
// Y muestra en vez de esconder: enseñar la función que falta es lo que
// hace subir de plan. Esconderla deja al cliente sin saber que existe.
export default function SoloConDerecho({
  derecho,
  children,
}: {
  readonly derecho: Derecho;
  readonly children: ReactNode;
}) {
  const { company } = useAuth();
  if (!tieneDerecho(company, derecho)) {
    return <MejoraTuPlan derecho={derecho} variante="recuadro" />;
  }
  return <>{children}</>;
}
