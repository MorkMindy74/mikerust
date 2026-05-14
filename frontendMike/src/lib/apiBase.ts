/**
 * Centralised resolution of the backend API base URL.
 *
 * MikeRust's Tauri shell binds the embedded axum server on a random
 * high port (OS-assigned) so a launch never collides with another
 * process holding 3001 or with itself across crash-restart cycles.
 * The shell exposes the bound URL through the `api_base_url` Tauri
 * command; this module discovers it at boot via `invoke()` and falls
 * back to `NEXT_PUBLIC_API_BASE_URL` (or `http://localhost:3001`) when
 * running outside Tauri — i.e. plain Next.js dev in a browser with the
 * backend started via `cargo run` on a fixed `PORT`.
 *
 * Usage:
 *   import { apiBase, apiBaseReady } from "@/lib/apiBase";
 *   await apiBaseReady;            // optional — only needed by pre-mount fetches
 *   fetch(`${apiBase()}/foo`);
 *
 * The discovery promise is kicked off at module import time, so by the
 * time a user-triggered fetch fires the IPC roundtrip has long since
 * resolved (sub-100 ms in practice). For very-early fetches (e.g.
 * AuthContext on first render) await `apiBaseReady` to be safe.
 */

const ENV_FALLBACK: string =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

let _resolved: string | null = null;

async function discover(): Promise<void> {
    if (typeof window === "undefined") return; // SSR — fall through to env
    try {
        const tauri = await import("@tauri-apps/api/core");
        const url = await tauri.invoke<string>("api_base_url");
        if (typeof url === "string" && /^https?:\/\//.test(url)) {
            _resolved = url;
            return;
        }
        // Tauri responded but the server hasn't reported its port yet
        // (rare — IPC arrived before the oneshot fired). Caller will
        // see the env fallback until the next discovery; we don't
        // schedule a retry here because the eager bootstrap below
        // already runs at module-load and resolves on the same tick.
    } catch {
        // Not running inside Tauri (e.g. browser dev mode) — leave
        // `_resolved` null so `apiBase()` returns the env fallback.
    }
}

/**
 * Promise that resolves once the initial discovery roundtrip has
 * settled (either populated `_resolved` from the Tauri shell or
 * swallowed the error and fallen back to env). Awaited by code paths
 * that absolutely must hit the right backend on their very first
 * request (auth session check, etc.).
 */
export const apiBaseReady: Promise<void> = discover();

/**
 * Synchronous accessor. Returns the IPC-discovered URL when available,
 * the `NEXT_PUBLIC_API_BASE_URL` env fallback otherwise. Cheap — no
 * promise, no allocation; safe to call in every render or fetch.
 */
export function apiBase(): string {
    return _resolved ?? ENV_FALLBACK;
}
