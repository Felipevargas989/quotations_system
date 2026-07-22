import React, {
  forwardRef,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { NumberInputProps } from "./types";

// Campo numérico con la norma es-CL — LA REGLA ÚNICA DEL SISTEMA
// (definida con Felipe el 22-07-2026, tras iterar juntos):
//
//   «La coma es EL decimal. El punto NUNCA es decimal.
//    Los puntos de miles se ponen solos.»
//
// Una sola regla para las 31 cajas numéricas, sin excepciones:
// - El usuario teclea DÍGITOS y el campo agrupa los miles EN VIVO con
//   puntos. Cualquier punto que escriba el usuario se IGNORA (por eso
//   "1.500.000" por costumbre funciona, y el "1.00.000" que una vez se
//   leyó como $1 no puede existir).
// - La coma es el único decimal ("1,5" = uno y medio). Al teclear un
//   punto aparece un avisito suave de 2,5s — "El punto se ignora: usa
//   coma para decimales" — una vez por visita al campo, sin vibrar ni
//   bloquear (el teclado educa en el momento exacto).
// - La pantalla y el valor interno son SIEMPRE el mismo número: onChange
//   se dispara con cada tecla, incluso si el valor viola min/max.
// - Violación de min/max: vibración + borde rojo + mensaje formateado.
//   NO se ajusta solo ni se congela: el usuario corrige, y es el
//   formulario padre quien bloquea su botón mientras tanto.
// - onCommit: entrega el número final al salir del campo (celdas con
//   autoguardado onBlur, ej. cantidades de recetas).

const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      formatThousands = false,
      currency = false,
      placeholder,
      name,
      id,
      className = "",
      disabled = false,
      required = false,
      onCommit,
      ...props
    },
    ref,
  ) => {
    // formatThousands se conserva por compatibilidad con los llamadores,
    // pero ya no cambia el comportamiento: TODOS los campos agrupan.
    void formatThousands;

    const [displayValue, setDisplayValue] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [shaking, setShaking] = useState(false);
    const [dotHint, setDotHint] = useState(false);
    const isFocusedRef = useRef(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const pendingCaretRef = useRef<number | null>(null);
    const hintShownRef = useRef(false); // una vez por visita al campo
    const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const setRefs = (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    };

    const fmtCL = (num: number): string => {
      if (isNaN(num)) return "";
      return num.toLocaleString("es-CL", { maximumFractionDigits: 6 });
    };

    // ---- Normalización en vivo (la regla única) ----
    // Conserva dígitos y la primera coma; agrupa el entero de a 3 con
    // puntos. Los puntos ESCRITOS se ignoran siempre.
    const normalizeLive = (raw: string): { display: string; clean: string } => {
      let digitsAndComma = "";
      let commaSeen = false;
      for (const ch of raw) {
        if (/\d/.test(ch)) digitsAndComma += ch;
        else if (ch === "," && !commaSeen) {
          digitsAndComma += ",";
          commaSeen = true;
        }
      }
      const [intRaw, decRaw = ""] = digitsAndComma.split(",");
      const intPart = intRaw.replace(/^0+(?=\d)/, "");
      const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      const display = commaSeen ? `${grouped},${decRaw}` : grouped;
      const clean = (intPart || "0") + (commaSeen ? `.${decRaw}` : "");
      return { display, clean: digitsAndComma === "" ? "" : clean };
    };

    const countSig = (s: string) => (s.match(/[\d,]/g) || []).length;
    const posAfterSig = (s: string, n: number) => {
      if (n <= 0) return 0;
      let seen = 0;
      for (let i = 0; i < s.length; i++) {
        if (/[\d,]/.test(s[i])) {
          seen++;
          if (seen === n) return i + 1;
        }
      }
      return s.length;
    };

    // Sincronizar desde el valor externo (solo sin foco)
    useEffect(() => {
      if (isFocusedRef.current) return;
      if (value !== undefined && value !== null) {
        setDisplayValue(fmtCL(value));
      } else {
        setDisplayValue("");
      }
    }, [value]);

    // Reponer el cursor tras el reformateo en vivo
    useLayoutEffect(() => {
      if (
        pendingCaretRef.current !== null &&
        inputRef.current &&
        isFocusedRef.current
      ) {
        inputRef.current.setSelectionRange(
          pendingCaretRef.current,
          pendingCaretRef.current,
        );
        pendingCaretRef.current = null;
      }
    }, [displayValue]);

    // Limpieza del timer del avisito
    useEffect(
      () => () => {
        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      },
      [],
    );

    const triggerShake = () => {
      setShaking(false);
      requestAnimationFrame(() => setShaking(true));
    };

    // Avisito suave al teclear un punto: educa la regla sin castigar.
    const showDotHint = () => {
      if (hintShownRef.current) return;
      hintShownRef.current = true;
      setDotHint(true);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      hintTimerRef.current = setTimeout(() => setDotHint(false), 2500);
    };

    // Chequeo de rango: avisa (vibración + mensaje formateado) pero NUNCA
    // altera ni congela el valor — el padre decide bloquear su botón.
    const rangeCheck = (num: number | undefined) => {
      if (num === undefined) {
        setError(null);
        return;
      }
      const pref = currency ? "$" : "";
      if (max !== undefined && num > max) {
        setError(`El máximo es ${pref}${fmtCL(max)}`);
        triggerShake();
        return;
      }
      if (min !== undefined && num < min) {
        setError(`El mínimo es ${pref}${fmtCL(min)}`);
        triggerShake();
        return;
      }
      setError(null);
    };

    const parseClean = (clean: string): number | undefined => {
      if (clean === "") return undefined;
      const num = parseFloat(clean);
      return isNaN(num) ? undefined : num;
    };

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      const caret = event.target.selectionStart ?? raw.length;

      // ¿La edición recién hecha metió UN punto? (tecla, no pegado):
      // el texto creció en 1 y el carácter previo al cursor es ".".
      if (
        raw.length === displayValue.length + 1 &&
        caret > 0 &&
        raw[caret - 1] === "."
      ) {
        showDotHint();
      }

      const sig = countSig(raw.slice(0, caret));
      const { display, clean } = normalizeLive(raw);
      setDisplayValue(display);
      pendingCaretRef.current = posAfterSig(display, sig);
      const parsed = parseClean(clean);
      rangeCheck(parsed);
      onChange?.(parsed);
    };

    const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
      isFocusedRef.current = true;
      hintShownRef.current = false; // el avisito puede volver a salir
      // Seleccionar todo al entrar: escribir reemplaza sin tener que borrar.
      event.target.select();
    };

    const handleBlur = () => {
      isFocusedRef.current = false;
      setDotHint(false);
      // Al salir, la pantalla muestra el número real formateado (el mismo
      // que viajó por onChange). El aviso de rango se conserva visible.
      let parsed: number | undefined;
      if (displayValue.trim() !== "") {
        parsed = parseClean(normalizeLive(displayValue).clean);
        if (parsed !== undefined) {
          setDisplayValue(fmtCL(parsed));
        }
      }
      onCommit?.(parsed);
    };

    const baseClasses = `
      w-full px-3 py-2 border rounded-lg
      focus:ring-2 focus:ring-blue-500 focus:border-transparent
      transition-colors duration-200
      ${error ? "border-red-500" : "border-gray-300"}
      ${disabled ? "bg-gray-100 cursor-not-allowed opacity-60" : "bg-white"}
    `.trim();

    const inputClasses = `${baseClasses} ${className} ${
      shaking ? "ni-shake" : ""
    }`;

    return (
      <div className="w-full">
        <input
          ref={setRefs}
          type="text"
          inputMode="decimal"
          id={id}
          name={name}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onAnimationEnd={() => setShaking(false)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={inputClasses}
          {...props}
        />
        {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
        {!error && dotHint && (
          <p className="text-blue-500 text-xs mt-1 whitespace-nowrap">
            Usa coma para decimales
          </p>
        )}
      </div>
    );
  },
);

NumberInput.displayName = "NumberInput";

export default NumberInput;
