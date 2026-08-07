// UN dato de contacto que se puede copiar — correo o teléfono.
//
// Nace el 07-08-2026 de una observación de Felipe: los correos se
// pintaban en AZUL, que en toda la web significa "esto es un enlace,
// pincha y algo se abre". Pero desde el 29-07 pincharlos COPIA (decisión
// suya: en el Mac, un mailto: abría el cliente de correo cuando uno solo
// quería pegar la dirección en otro lado). O sea: el color prometía una
// cosa y el clic hacía otra, sin avisar.
//
// La solución no es cambiar el color sino hacer VISIBLE la acción: el
// dato en color de dato, y al lado el ícono de copiar de toda la vida.
// Se puede pinchar el ícono o el texto —quien ya aprendió el gesto viejo
// no pierde nada— y la confirmación es el propio ícono volviéndose un ✓
// por dos segundos: sin toast ni ventana, que para copiar un correo
// sería desproporcionado.
//
// Vive en components/ porque lo montan TRES pantallas que hasta hoy
// pintaban el mismo dato con tres códigos distintos: la ficha del
// cliente, la ficha del negocio y el tablero de Post-Venta.
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function DatoCopiable({
  valor,
  icono,
  titulo,
  className = "",
}: {
  readonly valor: string;
  /** Ícono del tipo de dato (sobre, teléfono). Opcional. */
  readonly icono?: React.ReactNode;
  /** Qué se dice al pasar el cursor. Por defecto, "Copiar". */
  readonly titulo?: string;
  readonly className?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin permiso de portapapeles: no se rompe nada */
    }
  };
  if (!valor) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        // Estas filas suelen ser clicables enteras (abrir la ficha):
        // copiar un dato no debe además navegar.
        e.stopPropagation();
        void copiar();
      }}
      title={copiado ? "Copiado" : titulo || `Copiar ${valor}`}
      className={`group inline-flex max-w-full items-center gap-1.5 text-left ${className}`}
    >
      {icono}
      <span className="truncate">{valor}</span>
      {copiado ? (
        <Check size={13} className="shrink-0 text-green-600" />
      ) : (
        <Copy
          size={13}
          className="shrink-0 text-gray-300 transition-colors group-hover:text-gray-500"
        />
      )}
    </button>
  );
}
