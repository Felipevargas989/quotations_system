import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
vi.mock("./api", () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a) }));

import { getQuotations } from "./quotations.service";
import {
  QuotationRequestType,
  QuotationStatus,
} from "../types/quotations.types";

// El calendario pide su propia vista (doc 21, 04-11-2026): a recepción el
// motor le entrega ahí todos los eventos, los que no son de particulares
// sin plata. El tablero no la pide y le llegan solo los suyos.
describe("getQuotations", () => {
  beforeEach(() => apiRequest.mockReset().mockResolvedValue([]));

  it("el calendario pide vista=calendario", async () => {
    await getQuotations(
      QuotationRequestType.COTIZACION,
      [QuotationStatus.ACEPTADA],
      undefined,
      undefined,
      undefined,
      "calendario",
    );
    expect(apiRequest.mock.calls[0][0]).toContain("&vista=calendario");
  });

  it("el tablero, no", async () => {
    await getQuotations(QuotationRequestType.COTIZACION, [
      QuotationStatus.ENVIADA,
    ]);
    expect(apiRequest.mock.calls[0][0]).not.toContain("vista=");
  });
});
