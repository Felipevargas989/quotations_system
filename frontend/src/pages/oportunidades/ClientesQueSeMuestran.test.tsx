// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as experiencia from "../../services/experiencia.service";
import type { VistaDelOferente } from "../../services/oportunidades.service";
import ClientesQueSeMuestran from "./ClientesQueSeMuestran";

// LOS CLIENTES QUE SE PUEDEN MOSTRAR (decisión 76, 24-10): solo se eligen
// los privados; los públicos se muestran solos y los particulares nunca.

vi.mock("../../services/clients.service", () => ({
  clientsQueryOptions: {
    queryKey: ["clients"],
    queryFn: () =>
      Promise.resolve([
        { id: "cliente-ccu", name: "CCU", client_type: "Empresas" },
        {
          id: "cliente-quillon",
          name: "Municipalidad de Quillón",
          client_type: "Empresas Publicas",
        },
        {
          id: "cliente-barbara",
          name: "Bárbara López",
          client_type: "Particulares",
        },
        { id: "cliente-rudel", name: "Rudel S.A.", client_type: "Empresas" },
      ]),
  },
}));
vi.mock("../../services/experiencia.service", () => ({
  guardarClientesQueSeMuestran: vi.fn(),
}));
vi.mock("../../components/toast/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const x = vi.mocked(experiencia);

const vista = (ids: string[]) =>
  ({
    oferente: { clientes_que_se_muestran: ids },
    empresa: {},
    documentos: [],
  }) as unknown as VistaDelOferente;

beforeEach(() => {
  x.guardarClientesQueSeMuestran.mockImplementation((ids) =>
    Promise.resolve(vista(ids)),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pintar = (ids: string[]) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ClientesQueSeMuestran vista={vista(ids)} />
    </QueryClientProvider>,
  );

describe("Los clientes que puedes mostrar", () => {
  it("muestra los elegidos y se agrega un privado; los públicos y los particulares no se ofrecen", async () => {
    pintar(["cliente-ccu"]);
    expect(await screen.findByText("CCU")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Agregar un cliente privado"));
    expect(await screen.findByText("Rudel S.A.")).toBeInTheDocument();
    expect(
      screen.queryByText("Municipalidad de Quillón"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Bárbara López")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Rudel S.A."));
    await waitFor(() =>
      expect(x.guardarClientesQueSeMuestran).toHaveBeenCalledWith([
        "cliente-ccu",
        "cliente-rudel",
      ]),
    );
  });

  it("se saca uno con la cruz", async () => {
    pintar(["cliente-ccu", "cliente-rudel"]);
    fireEvent.click(await screen.findByLabelText("Sacar a CCU"));
    await waitFor(() =>
      expect(x.guardarClientesQueSeMuestran).toHaveBeenCalledWith([
        "cliente-rudel",
      ]),
    );
  });

  it("sin privados elegidos, lo dice", () => {
    pintar([]);
    expect(
      screen.getByText(/Todavía no hay privados en la lista/),
    ).toBeInTheDocument();
  });
});
