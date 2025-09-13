interface SheetProduct {
  codigo: string;
  nombre: string;
  precio: number;
  categoria?: string;
}

interface FixedService {
  codigo: string;
  nombre: string;
  precio_base: number;
  categoria?: string;
  tipo_calculo?: string;
  min_precio?: number;
  max_precio?: number;
  precio_por_persona?: number;
}

interface GoogleSheetsConfig {
  spreadsheetId: string;
  range: string;
  fixedRange: string;
  apiKey: string;
}

class GoogleSheetsService {
  private config: GoogleSheetsConfig;

  constructor() {
    this.config = {
      spreadsheetId: import.meta.env.VITE_GOOGLE_SHEETS_ID || "",
      range: import.meta.env.VITE_GOOGLE_SHEETS_RANGE || "Hoja1!A:D",
      fixedRange:
        import.meta.env.VITE_GOOGLE_SHEETS_FIXED_RANGE || "Servicios Fijos!A:H",
      apiKey: import.meta.env.VITE_GOOGLE_API_KEY || "",
    };

    if (!this.config.spreadsheetId || !this.config.apiKey) {
      console.warn(
        "Google Sheets no está configurado correctamente. Revisa las variables de entorno.",
      );
    }
  }

  /**
   * Obtiene los datos de la hoja de cálculo
   */
  async getProducts(): Promise<SheetProduct[]> {
    if (!this.config.spreadsheetId || !this.config.apiKey) {
      throw new Error(
        "Google Sheets no está configurado. Revisa las variables de entorno en el archivo .env",
      );
    }

    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.spreadsheetId}/values/${this.config.range}?key=${this.config.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(`Error 403: Acceso denegado. Verifica que:
1. Tu hoja de Google Sheets esté compartida como 'Cualquier persona con el enlace' con permisos de 'Lector'
2. La API de Google Sheets esté habilitada en Google Cloud Console
3. Tu API Key sea válida y esté restringida solo a Google Sheets API
4. El ID de la hoja sea correcto

Consulta GOOGLE_SHEETS_SETUP.md para más detalles.`);
        }
        if (response.status === 400) {
          throw new Error(`Error 400: Solicitud incorrecta. Verifica que:
1. El ID de Google Sheets sea válido (debe ser solo el ID, no la URL completa)
2. La API Key de Google sea correcta y válida
3. El rango de celdas esté en formato correcto (ej: 'Hoja1!A:D')
4. La hoja de cálculo exista y sea accesible

Valores actuales:
- Spreadsheet ID: ${this.config.spreadsheetId}
- Range: ${this.config.range}

Consulta GOOGLE_SHEETS_SETUP.md para obtener las credenciales correctas.`);
        }
        throw new Error(
          `Error al obtener datos: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (!data.values || data.values.length === 0) {
        return [];
      }

      // Asumimos que la primera fila son los headers
      const [, ...rows] = data.values;

      return rows
        .map(
          (row: string[]): SheetProduct => ({
            codigo: row[0] || "",
            nombre: row[1] || "",
            precio: parseFloat(row[2]) || 0,
            categoria: row[3] || "Otros",
          }),
        )
        .filter(
          (product: SheetProduct) =>
            product.codigo && product.nombre && product.precio > 0,
        );
    } catch (error) {
      console.error("Error al obtener datos de Google Sheets:", error);
      throw error;
    }
  }

  /**
   * Obtiene los servicios fijos de la hoja de cálculo
   */
  async getFixedServices(): Promise<FixedService[]> {
    if (!this.config.spreadsheetId || !this.config.apiKey) {
      throw new Error(
        "Google Sheets no está configurado. Revisa las variables de entorno en el archivo .env",
      );
    }

    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.spreadsheetId}/values/${this.config.fixedRange}?key=${this.config.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(`Error 403: Acceso denegado a servicios fijos. Verifica que:
1. Tu hoja 'Servicios Fijos' esté en el mismo documento
2. El documento esté compartido como 'Cualquier persona con el enlace' con permisos de 'Lector'
3. La hoja se llame exactamente 'Servicios Fijos'
4. El rango sea correcto: ${this.config.fixedRange}`);
        }
        if (response.status === 400) {
          throw new Error(`Error 400: No se encontró la hoja 'Servicios Fijos'. Verifica que:
1. Hayas creado la hoja 'Servicios Fijos' en tu documento de Google Sheets
2. El nombre sea exactamente 'Servicios Fijos' (con espacio y mayúsculas)
3. El rango sea correcto: ${this.config.fixedRange}`);
        }
        throw new Error(
          `Error al obtener servicios fijos: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (!data.values || data.values.length === 0) {
        return [];
      }

      // Headers esperados: Codigo, Nombre, Precio_Base, Categoria, Tipo_Calculo, Min_Precio, Max_Precio, Precio_Por_Persona
      const [, ...rows] = data.values;

      return rows
        .map(
          (row: string[]): FixedService => ({
            codigo: row[0] || "",
            nombre: row[1] || "", // Columna B: Item
            precio_base: parseFloat(row[2]) || 0, // Columna C: Precio
            categoria: row[3] || "General", // Columna D: Tipo servicios
            tipo_calculo: row[4] || "fijo", // Columna E: Tipo_Calculo
            min_precio: parseFloat(row[5]) || 0, // Columna F: Min_Precio
            max_precio: parseFloat(row[6]) || 0, // Columna G: Max_Precio
            precio_por_persona: parseFloat(row[7]) || 0, // Columna H: Precio_Por_Persona
          }),
        )
        .filter((service: FixedService) => service.codigo && service.nombre);
    } catch (error) {
      console.error(
        "Error al obtener servicios fijos de Google Sheets:",
        error,
      );
      throw error;
    }
  }

  /**
   * Calcula el precio de un servicio fijo basado en el número de personas
   */
  calculateFixedServicePrice(
    service: FixedService,
    peopleCount: number,
  ): number {
    switch (service.tipo_calculo) {
      case "variable_con_limites": {
        // Caso: Salón Cúpula/Auditorio
        const calculatedPrice = peopleCount * (service.precio_por_persona || 0);
        const minPrice = service.min_precio || service.precio_base;
        const maxPrice = service.max_precio || Infinity;

        if (calculatedPrice < minPrice) return Math.round(minPrice);
        if (calculatedPrice > maxPrice) return Math.round(maxPrice);
        return Math.round(calculatedPrice);
      }

      case "fijo_mas_variable": {
        // Caso: Sillas Chivari/Plegables
        const basePrice = service.precio_base || 0;
        const variablePrice = peopleCount * (service.precio_por_persona || 0);
        return Math.round(basePrice + variablePrice);
      }

      case "fijo":
      default: {
        // Precio fijo normal
        return Math.round(service.precio_base || 0);
      }
    }
  }

  /**
   * Busca un producto por código
   */
  async getProductByCode(codigo: string): Promise<SheetProduct | null> {
    const products = await this.getProducts();
    return products.find((p: SheetProduct) => p.codigo === codigo) || null;
  }

  /**
   * Busca productos por categoría
   */
  async getProductsByCategory(categoria: string): Promise<SheetProduct[]> {
    const products = await this.getProducts();
    return products.filter((p: SheetProduct) => p.categoria === categoria);
  }

  /**
   * Verifica si la configuración es válida
   */
  isConfigured(): boolean {
    return !!(this.config.spreadsheetId && this.config.apiKey);
  }
}

export const googleSheetsService = new GoogleSheetsService();
export type { SheetProduct };
