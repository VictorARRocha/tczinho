import { beforeEach, describe, expect, it, vi } from "vitest";
import { recarregarAposPublicacao } from "@/lib/recarregarAposPublicacao";

describe("recarregar apos publicacao", () => {
  beforeEach(() => sessionStorage.clear());

  it("recarrega uma vez e, se falhar de novo logo em seguida, deixa o erro aparecer", () => {
    const recarregar = vi.fn();
    const primeiro = new Event("vite:preloadError", { cancelable: true });
    expect(recarregarAposPublicacao(primeiro, 1_000_000, recarregar)).toBe(true);
    expect(primeiro.defaultPrevented).toBe(true);

    const segundo = new Event("vite:preloadError", { cancelable: true });
    expect(recarregarAposPublicacao(segundo, 1_010_000, recarregar)).toBe(false);
    expect(segundo.defaultPrevented).toBe(false);
    expect(recarregar).toHaveBeenCalledTimes(1);

    // Bem depois (outra publicacao), recarrega de novo.
    expect(recarregarAposPublicacao(new Event("vite:preloadError", { cancelable: true }), 1_100_000, recarregar)).toBe(true);
    expect(recarregar).toHaveBeenCalledTimes(2);
  });
});
