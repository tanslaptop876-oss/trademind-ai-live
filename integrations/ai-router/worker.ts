/**
 * TradeMind / MarketingMind shared AI router — Cloudflare Worker starter.
 * Secrets: GEMINI_API_KEY, ROUTER_TOKEN (set via wrangler secret put).
 * No code is pushed to GitHub by this endpoint. Human review required.
 */
export interface Env { GEMINI_API_KEY: string; ROUTER_TOKEN: string; GEMINI_MODEL?: string }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, service: "ai-router", provider: "gemini", deployed: true });
    if (url.pathname !== "/api/ai/generate" || request.method !== "POST") return json({ error: "Not found" }, 404);
    if (!env.ROUTER_TOKEN || request.headers.get("authorization") !== `Bearer ${env.ROUTER_TOKEN}`) return json({ error: "Unauthorized" }, 401);
    if (!env.GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY not configured" }, 503);
    let body: { task?: unknown; project?: unknown };
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (typeof body.task !== "string" || !body.task.trim() || body.task.length > 12000) return json({ error: "task must be 1–12000 characters" }, 400);
    if (!["TradeMind", "MarketingMind"].includes(String(body.project))) return json({ error: "Invalid project" }, 400);
    const model = env.GEMINI_MODEL || "gemini-2.5-flash";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: "You are a software coding assistant. Produce reviewable code suggestions only. Never claim to have deployed, committed, or tested code." }] }, contents: [{ role: "user", parts: [{ text: `Project: ${body.project}\nTask: ${body.task}` }] }], generationConfig: { maxOutputTokens: 4096 } }),
        signal: controller.signal
      });
      if (!response.ok) return json({ error: "Gemini provider error", provider_status: response.status }, 502);
      const result: any = await response.json();
      const output = (result.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("\n");
      return json({ project: body.project, model, output, status: "draft_requires_review" });
    } catch { return json({ error: "Provider unavailable or timed out" }, 504); }
    finally { clearTimeout(timeout); }
  }
};
