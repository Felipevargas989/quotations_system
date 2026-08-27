import * as XLSX from "xlsx";

/**
 * EL LECTOR DE ARCHIVOS del importador de audiencias (Felipe 27-08:
 * "para no copiar y pegar"). Convierte .txt/.csv/.xlsx en las líneas
 * "correo,nombre,empresa" de la caja de siempre — el resto del flujo
 * (conteo, validación, importar) no cambia.
 */

/** Filas de planilla → líneas del importador. Pura, para probarla:
 *  busca las columnas por nombre; sin encabezados, asume el orden
 *  correo/nombre/empresa si la primera columna trae correos. */
export const filasALineas = (
  filas: unknown[][],
): { lineas: string[]; sinCorreo: boolean } => {
  if (!filas.length) return { lineas: [], sinCorreo: true };
  const enc = (filas[0] ?? []).map((c) =>
    String(c ?? "")
      .trim()
      .toLowerCase(),
  );
  const buscar = (...prefijos: string[]) =>
    enc.findIndex((c) => prefijos.some((p) => c.startsWith(p)));
  let iMail = buscar("correo", "email", "e-mail", "mail");
  let iNom = buscar("nombre", "name", "contacto");
  let iEmp = buscar(
    "empresa",
    "instituci",
    "cliente",
    "organizaci",
    "establecimiento",
  );
  let datos = filas.slice(1);
  if (iMail === -1) {
    const conArroba = filas.filter((f) =>
      String(f?.[0] ?? "").includes("@"),
    ).length;
    if (conArroba >= Math.max(1, Math.floor(filas.length / 2))) {
      iMail = 0;
      iNom = 1;
      iEmp = 2;
      datos = filas;
    } else {
      return { lineas: [], sinCorreo: true };
    }
  }
  const limpiar = (x: unknown) =>
    String(x ?? "")
      .trim()
      .replace(/[,;\t]+/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 200);
  const lineas: string[] = [];
  for (const f of datos) {
    const correo = String(f?.[iMail] ?? "")
      .trim()
      .toLowerCase();
    if (!correo.includes("@")) continue;
    const nombre = iNom >= 0 ? limpiar(f?.[iNom]) : "";
    const empresa = iEmp >= 0 ? limpiar(f?.[iEmp]) : "";
    lineas.push(`${correo},${nombre},${empresa}`);
  }
  return { lineas, sinCorreo: false };
};

/** Lee el archivo elegido y devuelve el texto para la caja. */
export const leerArchivoDeContactos = async (
  archivo: File,
): Promise<{ texto: string; error?: string }> => {
  const ext = archivo.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "txt" || ext === "csv") {
    return { texto: await archivo.text() };
  }
  if (ext === "xlsx" || ext === "xls") {
    const data = await archivo.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, {
      header: 1,
    }) as unknown[][];
    const { lineas, sinCorreo } = filasALineas(filas);
    if (sinCorreo) {
      return {
        texto: "",
        error:
          "No encontré una columna de correos en la primera hoja del Excel",
      };
    }
    return { texto: lineas.join("\n") };
  }
  return { texto: "", error: "Formato no soportado: usa .txt, .csv o .xlsx" };
};
