import { getDataConfig } from "@/services/data/config";
import type { Evidencia } from "@/types/db";

function encodeStoragePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

export function resolveEvidenceUrl(ev?: Evidencia | null): string | null {
  if (!ev) return null;
  if (ev.public_url) return ev.public_url;
  if (ev.signed_url) return ev.signed_url;
  if (!ev.storage_path) return null;
  if (/^https?:\/\//i.test(ev.storage_path)) return ev.storage_path;

  const { apiBaseUrl } = getDataConfig();
  if (!apiBaseUrl) return null;
  return `${apiBaseUrl.replace(/\/+$/, "")}/files/${encodeStoragePath(ev.storage_path)}`;
}

export async function fetchEvidenceBlob(ev: Evidencia): Promise<Blob | null> {
  const url = resolveEvidenceUrl(ev);
  if (!url) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}
