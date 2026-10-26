const BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

type Opts = { method?: string; body?: unknown };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText || "Something went wrong";
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* keep the status text */
    }
    throw new Error(msg);
  }
  return res.json();
}
