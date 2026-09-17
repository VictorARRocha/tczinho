import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Evidencia } from "@/types/db";

vi.mock("@/services/data/config", () => ({
  getDataConfig: () => ({ provider: "api", apiBaseUrl: "/api" }),
}));

vi.mock("@/services/authApi", () => ({
  getAuthHeader: () => ({ Authorization: "Bearer sessao-local" }),
}));

import { ApiQaDataSource } from "@/services/data/apiSource";
import { fetchEvidenceBlob, resolveEvidenceUrl } from "@/lib/evidenceUrl";

describe("authenticated API access", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the local session token on dashboard data requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await ApiQaDataSource.fetchModules();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/modules",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sessao-local" }),
      }),
    );
  });

  it("uses the proxied API and authenticates evidence downloads", async () => {
    const evidence = {
      storage_path: "run 1/prints/erro.png",
      public_url: "http://192.168.9.201:8000/files/legado.png",
      signed_url: "http://192.168.9.201:8000/files/legado.png",
    } as Evidencia;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Blob(["evidencia"]), { status: 200 }),
    );

    expect(resolveEvidenceUrl(evidence)).toBe("/api/files/run%201/prints/erro.png");
    await expect(fetchEvidenceBlob(evidence)).resolves.toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledWith("/api/files/run%201/prints/erro.png", {
      headers: { Authorization: "Bearer sessao-local" },
    });
  });
});
