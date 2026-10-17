// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { DragEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { useArrastreDeArchivos } from "./useArrastreDeArchivos";

/** Un evento de arrastre de mentira: qué trae y qué archivos. */
const evento = (tipos: string[], archivos: File[] = []) =>
  ({
    preventDefault: vi.fn(),
    dataTransfer: { types: tipos, files: archivos },
  }) as unknown as DragEvent;

const pdf = new File(["x"], "bases.pdf", { type: "application/pdf" });

describe("useArrastreDeArchivos", () => {
  it("se enciende con archivos y entrega lo soltado", () => {
    const recibir = vi.fn();
    const { result } = renderHook(() => useArrastreDeArchivos(recibir));

    act(() => result.current.zona.onDragEnter(evento(["Files"])));
    expect(result.current.arrastrando).toBe(true);

    act(() => result.current.zona.onDrop(evento(["Files"], [pdf])));
    expect(result.current.arrastrando).toBe(false);
    expect(recibir).toHaveBeenCalledWith([pdf]);
  });

  it("un texto o un enlace arrastrado no la enciende", () => {
    const { result } = renderHook(() => useArrastreDeArchivos(vi.fn()));
    act(() => result.current.zona.onDragEnter(evento(["text/plain"])));
    expect(result.current.arrastrando).toBe(false);
  });

  it("no parpadea al pasar sobre los hijos: se apaga al salir del último", () => {
    const { result } = renderHook(() => useArrastreDeArchivos(vi.fn()));
    act(() => {
      result.current.zona.onDragEnter(evento(["Files"])); // la zona
      result.current.zona.onDragEnter(evento(["Files"])); // un hijo
      result.current.zona.onDragLeave(); // sale de la zona hacia el hijo
    });
    expect(result.current.arrastrando).toBe(true);
    act(() => result.current.zona.onDragLeave());
    expect(result.current.arrastrando).toBe(false);
  });

  it("desactivada no recibe nada", () => {
    const recibir = vi.fn();
    const { result } = renderHook(() =>
      useArrastreDeArchivos(recibir, { desactivado: true }),
    );
    act(() => result.current.zona.onDragEnter(evento(["Files"])));
    act(() => result.current.zona.onDrop(evento(["Files"], [pdf])));
    expect(result.current.arrastrando).toBe(false);
    expect(recibir).not.toHaveBeenCalled();
  });
});
