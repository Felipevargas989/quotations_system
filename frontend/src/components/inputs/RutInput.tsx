import React, {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  formatearMientrasEscribe,
  formatearRut,
  limpiarRut,
  mensajeRut,
  normalizarRut,
  revisarRut,
} from "../../utils/rut";

// CAMPO DE RUT — LA PIEZA DE LA CASA (14-08-2026)
//
// Nace compartida, antes de que exista la primera copia. Es la primera
// vez que ponemos el candado al derecho: en el desplegable con buscador
// llegamos cuando ya había seis copias, y en el estado de la cotización
// cuando "Realizada" ya era cinco verdes distintos.
//
// LAS REGLAS:
//
// · Se teclean números y la K. Los puntos y el guion se ponen SOLOS.
//   Cualquier punto o guion que escriba la persona se ignora, así que
//   pegar "7.093.990-8" desde otro lado funciona igual.
//
// · EL CAMPO NUNCA SE COME UN CARÁCTER. Es el defecto clásico de los
//   campos que formatean solos: escribes el último número y desaparece.
//   El cursor se repone contando caracteres significativos, igual que en
//   NumberInput. Hay una prueba que lo verifica dígito por dígito.
//
// · No reta mientras escribes. El aviso aparece cuando ya hay suficiente
//   para juzgar, o al salir del campo. Avisar "RUT inválido" cuando la
//   persona lleva tecleado un "7" es ruido.
//
// · Lo que sale por onChange es SIEMPRE la forma limpia —"7093990-8"—
//   sin importar cómo se escribió. Lo que se ve tiene puntos; lo que
//   viaja, no. El SII y los bancos lo piden así.

export interface RutInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type"
  > {
  /** La forma limpia: `7093990-8`. Vacío si todavía no hay. */
  value: string;
  /** Entrega la forma limpia y si el RUT está bien. */
  onChange: (rut: string, valido: boolean) => void;
  /** Un mensaje de afuera (ej: "Ese RUT ya está cargado en Camila"). */
  errorExterno?: string | null;
  /** Si es obligatorio, vacío también avisa. Por defecto no lo es: a
   *  veces se carga a la persona antes de tener el RUT. */
  obligatorio?: boolean;
  className?: string;
}

/** Cuántos caracteres que la persona escribió hay hasta el cursor. */
const significativos = (texto: string) =>
  (texto.match(/[0-9kK]/g) || []).length;

/** Dónde queda el cursor después de reformatear, para que no se mueva. */
const posicionTrasSignificativos = (texto: string, cuantos: number) => {
  if (cuantos <= 0) return 0;
  let vistos = 0;
  for (let i = 0; i < texto.length; i += 1) {
    if (/[0-9kK]/.test(texto[i])) {
      vistos += 1;
      if (vistos === cuantos) return i + 1;
    }
  }
  return texto.length;
};

const RutInput = forwardRef<HTMLInputElement, RutInputProps>(
  (
    {
      value,
      onChange,
      errorExterno = null,
      obligatorio = false,
      className = "",
      disabled = false,
      placeholder = "15.402.881-1",
      ...props
    },
    ref,
  ) => {
    const [enPantalla, setEnPantalla] = useState("");
    const [tocado, setTocado] = useState(false);
    const conFocoRef = useRef(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const cursorPendienteRef = useRef<number | null>(null);

    const guardarRefs = (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    };

    // Sincronizar desde afuera, solo cuando no se está escribiendo.
    useEffect(() => {
      if (conFocoRef.current) return;
      setEnPantalla(value ? formatearRut(value) : "");
    }, [value]);

    // Reponer el cursor tras el reformateo.
    useLayoutEffect(() => {
      if (
        cursorPendienteRef.current !== null &&
        inputRef.current &&
        conFocoRef.current
      ) {
        inputRef.current.setSelectionRange(
          cursorPendienteRef.current,
          cursorPendienteRef.current,
        );
        cursorPendienteRef.current = null;
      }
    }, [enPantalla]);

    const alEscribir = (evento: React.ChangeEvent<HTMLInputElement>) => {
      const crudo = evento.target.value;
      const cursor = evento.target.selectionStart ?? crudo.length;
      const antes = significativos(crudo.slice(0, cursor));

      const mostrado = formatearMientrasEscribe(crudo);
      setEnPantalla(mostrado);
      cursorPendienteRef.current = posicionTrasSignificativos(mostrado, antes);

      const limpio = limpiarRut(crudo);
      const canonico = normalizarRut(limpio);
      // Mientras está a medio escribir se entrega lo que hay, para que el
      // formulario no crea que el campo está vacío.
      onChange(canonico ?? limpio, revisarRut(limpio) === null);
    };

    const alSalir = () => {
      conFocoRef.current = false;
      setTocado(true);
      const canonico = normalizarRut(enPantalla);
      if (canonico) setEnPantalla(formatearRut(canonico));
    };

    // Cuándo mostrar el aviso: al salir del campo, o cuando ya hay
    // suficiente escrito como para juzgar. No antes.
    const limpio = limpiarRut(enPantalla);
    const hayBastante = limpio.length >= 8;
    const problema = revisarRut(enPantalla);
    const problemaPropio =
      problema === "vacio" && !obligatorio ? null : problema;
    const mostrarAviso =
      !!errorExterno || (!!problemaPropio && (tocado || hayBastante));
    const aviso = errorExterno || mensajeRut(problemaPropio);

    const clasesBase = `
      w-full px-3 py-2 border rounded-lg
      focus:ring-2 focus:ring-blue-500 focus:border-transparent
      transition-colors duration-200
      ${mostrarAviso ? "border-red-500" : "border-gray-300"}
      ${disabled ? "bg-gray-100 cursor-not-allowed opacity-60" : "bg-white"}
    `.trim();

    return (
      <div className="w-full">
        <input
          ref={guardarRefs}
          type="text"
          inputMode="text"
          autoComplete="off"
          value={enPantalla}
          onChange={alEscribir}
          onFocus={() => {
            conFocoRef.current = true;
          }}
          onBlur={alSalir}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={mostrarAviso || undefined}
          aria-errormessage={mostrarAviso ? "aviso-rut" : undefined}
          className={`${clasesBase} ${className}`}
          {...props}
        />
        {mostrarAviso && (
          <p id="aviso-rut" role="alert" className="text-red-500 text-sm mt-1">
            {aviso}
          </p>
        )}
      </div>
    );
  },
);

RutInput.displayName = "RutInput";

export default RutInput;
