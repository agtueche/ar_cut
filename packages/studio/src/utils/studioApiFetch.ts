import { STUDIO_API_SAME_ORIGIN_CREDENTIALS } from "../components/editor/manualEditingAvailability";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function studioApiCredentials(): RequestCredentials {
  if (STUDIO_API_SAME_ORIGIN_CREDENTIALS) return "same-origin";
  const host = globalThis.location?.hostname;
  return !host || LOOPBACK_HOSTS.has(host) ? "omit" : "same-origin";
}

export function studioApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (init?.method && !["GET", "HEAD"].includes(init.method.toUpperCase()) && typeof window !== "undefined") {
    window.dispatchEvent(new Event("studio:pending-mutation"));
  }
  return globalThis.fetch(input, { ...init, credentials: studioApiCredentials() });
}
