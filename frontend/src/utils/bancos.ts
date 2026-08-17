/**
 * EL DICCIONARIO DE LOS BANCOS DE CHILE
 *
 * Una sola lista, en un solo lugar. El mismo modelo que
 * `utils/estadoCotizacion.ts` y `utils/clientTypeColor.ts`.
 *
 * POR QUÉ EXISTE (14-08-2026): el banco se escribía a mano en el Excel, y
 * escribirlo a mano es la causa número uno de transferencias perdidas. Peor
 * aún: circulan por internet listas de códigos que todavía traen Banco
 * Security, Scotiabank Azul y Corpbanca como si existieran.
 *
 * LOS CÓDIGOS son los de la CMF (los que antes se llamaban "código SBIF"),
 * de 3 dígitos y CON los ceros adelante. Se guardan como texto: '012', no 12.
 *
 * ⚠ Estos códigos sirven para identificar la institución. NO están
 *   confirmados contra la plantilla de nómina de Santander, porque
 *   Santander no publica su lista. Hoy eso no importa —Felipe teclea a
 *   mano en el portal del banco— pero si algún día se genera un archivo,
 *   hay que compararlos uno por uno.
 */

export type GrupoBanco = "frecuentes" | "otros" | "empresas";

export interface Banco {
  /** Código de institución de la CMF, 3 dígitos con ceros. */
  readonly codigo: string;
  /** Cómo se muestra. */
  readonly nombre: string;
  readonly grupo: GrupoBanco;
  /** Aclaración bajo el nombre: para qué sirve saber que MACH es Bci. */
  readonly nota?: string;
}

/**
 * EL ORDEN NO ES ALFABÉTICO NI POR TAMAÑO DEL BANCO: es dónde cobra la
 * gente de Valle del Sol. Lo dictó Felipe el 14-08-2026 —"BancoEstado
 * 80%, Falabella, Mercado Pago, y luego los más tradicionales"— porque
 * el que va primero es el que se elige mil veces.
 *
 * Los de banca de empresas van al final: ningún garzón cobra en JP Morgan
 * y tenerlos arriba solo invita a errores de dedo.
 */
export const BANCOS: readonly Banco[] = [
  // ---- Donde cobra la gente, en ese orden ----
  { codigo: "012", nombre: "BancoEstado", grupo: "frecuentes", nota: "acá vive la CuentaRUT" },
  { codigo: "051", nombre: "Banco Falabella", grupo: "frecuentes" },
  { codigo: "875", nombre: "Mercado Pago", grupo: "frecuentes", nota: "no es banco: es billetera" },
  { codigo: "001", nombre: "Banco de Chile", grupo: "frecuentes" },
  { codigo: "037", nombre: "Banco Santander", grupo: "frecuentes" },
  { codigo: "016", nombre: "Bci", grupo: "frecuentes", nota: "incluye MACH" },
  { codigo: "014", nombre: "Scotiabank", grupo: "frecuentes", nota: "antes BBVA y Scotiabank Azul" },
  { codigo: "039", nombre: "Banco Itaú", grupo: "frecuentes", nota: "antes Corpbanca" },
  { codigo: "053", nombre: "Banco Ripley", grupo: "frecuentes", nota: "antes Chek" },
  { codigo: "063", nombre: "Tenpo", grupo: "frecuentes", nota: "cuenta del banco Tenpo" },

  // ---- Existen, pero se usan poco ----
  // Coopeuch está acá abajo a propósito: Felipe dijo que no la usa nadie.
  { codigo: "672", nombre: "Coopeuch", grupo: "otros", nota: "cooperativa" },
  { codigo: "028", nombre: "Banco BICE", grupo: "otros", nota: "absorbió a Banco Security" },
  { codigo: "055", nombre: "Banco Consorcio", grupo: "otros" },
  { codigo: "009", nombre: "Banco Internacional", grupo: "otros" },
  { codigo: "062", nombre: "Tanner Banco Digital", grupo: "otros" },
  { codigo: "730", nombre: "Tenpo Prepago", grupo: "otros", nota: "la cuenta prepago, distinta del banco" },
  { codigo: "738", nombre: "Global66", grupo: "otros", nota: "billetera" },
  { codigo: "732", nombre: "Tapp Caja Los Andes", grupo: "otros", nota: "billetera" },
  { codigo: "729", nombre: "Prepago Los Héroes", grupo: "otros", nota: "billetera" },
  { codigo: "743", nombre: "Prex", grupo: "otros", nota: "billetera" },
  { codigo: "746", nombre: "Fintual Prepago", grupo: "otros", nota: "billetera" },
  { codigo: "671", nombre: "Coocretal", grupo: "otros", nota: "cooperativa" },
  { codigo: "673", nombre: "Oriencoop", grupo: "otros", nota: "cooperativa" },
  { codigo: "674", nombre: "Capual", grupo: "otros", nota: "cooperativa" },
  { codigo: "675", nombre: "Detacoop", grupo: "otros", nota: "cooperativa" },
  { codigo: "676", nombre: "Ahorrocoop", grupo: "otros", nota: "cooperativa" },
  { codigo: "677", nombre: "Coonfía", grupo: "otros", nota: "cooperativa" },

  // ---- Banca de empresas: nadie cobra sueldo acá ----
  { codigo: "031", nombre: "HSBC Bank Chile", grupo: "empresas" },
  { codigo: "041", nombre: "JP Morgan Chase Bank", grupo: "empresas" },
  { codigo: "059", nombre: "Banco BTG Pactual Chile", grupo: "empresas" },
  { codigo: "060", nombre: "China Construction Bank", grupo: "empresas" },
  { codigo: "061", nombre: "Bank of China", grupo: "empresas" },
];

const POR_CODIGO = new Map(BANCOS.map((b) => [b.codigo, b]));

/** BancoEstado: el único que puede tener CuentaRUT. */
export const CODIGO_BANCOESTADO = "012";

/** Cómo se llama. Si el código no está en la lista, se muestra crudo en
 *  vez de dejar la casilla vacía — igual que en el diccionario de estados. */
export const nombreBanco = (codigo: string | null | undefined): string =>
  (codigo && POR_CODIGO.get(codigo)?.nombre) || codigo || "";

export const bancoPorCodigo = (codigo: string | null | undefined) =>
  codigo ? POR_CODIGO.get(codigo) : undefined;

/** Los encabezados de sección del desplegable. */
export const TITULO_GRUPO: Record<GrupoBanco, string> = {
  frecuentes: "Los de siempre",
  otros: "Otros",
  empresas: "Banca de empresas",
};

/* ------------------------------------------------------------------ *
 * TIPOS DE CUENTA
 *
 * En Chile hay TRES tipos de verdad (normativa CMF y el formulario 22 del
 * SII). Todo lo demás son nombres comerciales: "chequera electrónica",
 * "Cuenta Pro", "cuenta digital" y "cuenta joven" son todas cuenta vista.
 *
 * La CuentaRUT también ES una cuenta vista —lo dice ChileAtiende— y se
 * muestra aparte solo porque su número se llena solo.
 * ------------------------------------------------------------------ */

export type TipoCuenta = "cuenta_rut" | "corriente" | "vista" | "ahorro";

export interface DefTipoCuenta {
  readonly valor: TipoCuenta;
  readonly etiqueta: string;
  readonly nota?: string;
}

export const TIPOS_DE_CUENTA: readonly DefTipoCuenta[] = [
  {
    valor: "cuenta_rut",
    etiqueta: "CuentaRUT (BancoEstado)",
    nota: "el número se llena solo",
  },
  { valor: "corriente", etiqueta: "Cuenta corriente" },
  {
    valor: "vista",
    etiqueta: "Cuenta vista",
    nota: "incluye chequera electrónica y las billeteras",
  },
  { valor: "ahorro", etiqueta: "Cuenta de ahorro" },
];

const TIPOS_POR_VALOR = new Map(TIPOS_DE_CUENTA.map((t) => [t.valor, t]));

export const etiquetaTipoCuenta = (
  valor: string | null | undefined,
): string =>
  (valor && TIPOS_POR_VALOR.get(valor as TipoCuenta)?.etiqueta) || valor || "";
