import { useQuery } from "@tanstack/react-query";
import { getUsers } from "../../services/users.service";

// QUIÉN PUEDE SER RESPONSABLE de una oportunidad: los administradores de
// la empresa, que son los únicos que ven el módulo (Felipe, 17-10: "solo
// el administrador y Camila, que es perfil administrador"). La misma lista
// para la ficha y el resumen al costado.

type UsuarioDeLaEmpresa = { id: string; full_name: string; role: string };

export function useResponsables() {
  const { data: usuarios = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async (): Promise<UsuarioDeLaEmpresa[]> => {
      const { data, error } = await getUsers();
      if (error) throw error;
      return (data as UsuarioDeLaEmpresa[] | null) ?? [];
    },
  });
  return usuarios
    .filter((u) => u.role === "administrador")
    .map((u) => ({ value: u.id, label: u.full_name }));
}
