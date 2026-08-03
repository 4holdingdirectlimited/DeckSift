import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateScanId(): string {
  return crypto.randomUUID();
}

/**
 * Resolves a possibly-relative card image URL to an absolute one the browser
 * can load. The Gundam/Pokémon adapters return relative `/api/cards/image-proxy?...`
 * URLs that the API server serves; in production the web app may be hosted on
 * a different origin than the API, so those must be prefixed with API_BASE.
 */
export function resolveCardImageUrl(
  url: string | undefined,
): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/api/")) {
    const base = import.meta.env.VITE_API_URL ?? "";
    return `${base}${url}`;
  }
  return url;
}
