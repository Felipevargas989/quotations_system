import { afterEach, describe, expect, it, vi } from "vitest";
import * as facturas from "../../services/facturas.service";
import { revisarUnoParaLaMasiva } from "./revisarUnoParaLaMasiva";

vi.mock("../../services/facturas.service", () => ({
  prepararDte: vi.fn(),
  armarBorradorDeDte: vi.fn(),
}));

const f = vi.mocked(facturas);

afterEach(() => vi.clearAllMocks());

const preparacion = {
  tipo: 33,
  ocs: [
    { id: 4, numero: "33000132942", total: 5611559, facturado: 5611559 },
    { id: 5, numero: "32000066941", total: 5239858, facturado: 0 },
    { id: 6, numero: "33000132941", total: 450000, facturado: 0 },
  ],
  sin_leer: 0,
  evento: { numero: 481, total: 11301500, facturado: 5611559, cliente: "x" },
} as unknown as facturas.PreparacionDelDte;

describe("El documento de un evento en la revisión", () => {
  it("sin OC pedida, el de la primera OC con saldo", async () => {
    f.armarBorradorDeDte.mockResolvedValue({ pedida: {}, vista: {} } as never);
    const preparar = vi.fn().mockResolvedValue(preparacion);
    await revisarUnoParaLaMasiva("ev-481", null, preparar);
    expect(f.armarBorradorDeDte).toHaveBeenCalledWith("ev-481", 33, 5);
  });

  it("con una OC pedida, el de esa OC (una factura por cada OC, 08-11)", async () => {
    f.armarBorradorDeDte.mockResolvedValue({ pedida: {}, vista: {} } as never);
    const preparar = vi.fn().mockResolvedValue(preparacion);
    await revisarUnoParaLaMasiva("ev-481", 6, preparar);
    expect(preparar).toHaveBeenCalledWith("ev-481");
    expect(f.armarBorradorDeDte).toHaveBeenCalledWith("ev-481", 33, 6);
  });

  it("una OC que ya no es del evento no se pide: va la primera con saldo", async () => {
    f.armarBorradorDeDte.mockResolvedValue({ pedida: {}, vista: {} } as never);
    await revisarUnoParaLaMasiva(
      "ev-481",
      99,
      vi.fn().mockResolvedValue(preparacion),
    );
    expect(f.armarBorradorDeDte).toHaveBeenCalledWith("ev-481", 33, 5);
  });
});
