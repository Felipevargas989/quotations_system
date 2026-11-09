import { useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { destinoAlEntrar, haySesionGuardada } from "../utils/entrada";
import PageSkeleton from "./PageSkeleton";

// SI YA ENTRÓ, DERECHO ADENTRO (Felipe, 09-11-2026: "cierro la pestaña,
// entro a eventi-app y tengo que volver a loguearme").
//
// Envuelve las dos puertas —la portada y «Acceder»—: quien llega con la
// sesión iniciada pasa derecho a su pantalla de entrada (la misma de
// LoginPage: `destinoAlEntrar`), y quien no, ve la página de siempre.
//
// Tres cuidados:
// - El visitante sin sesión guardada ve la página AL INSTANTE: no espera a
//   que nadie confirme nada (la portada es la cara pública de Eventia).
// - Si lo guardado venció, se muestra la página, no un error.
// - Se mira UNA vez, al llegar: quien inicia sesión en el formulario sigue
//   por el camino de LoginPage, sin que esta pieza se le cruce.

export default function SiYaEntro({
  children,
}: {
  readonly children: ReactNode;
}) {
  const { user, userRole, loading, roleLoading } = useAuth();
  const [llegoConSesion] = useState(() => haySesionGuardada());

  if (!llegoConSesion) return <>{children}</>;
  // Trae una sesión guardada: se espera a confirmarla, y a su cargo.
  if (loading || (user && roleLoading)) return <PageSkeleton />;
  if (user) return <Navigate to={destinoAlEntrar(userRole)} replace />;
  return <>{children}</>;
}
