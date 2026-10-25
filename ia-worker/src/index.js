/* Lisanga — Serveur IA (Cloudflare Worker).
   Reçoit { system, messages } depuis l'application et renvoie { text }.
   La clé ANTHROPIC_API_KEY reste secrète côté serveur ; seules les origines autorisées peuvent appeler ce serveur. */
import Anthropic from "@anthropic-ai/sdk";

const MAX_MESSAGES = 30;
const MAX_TEXT = 12000;
const MAX_IMAGE_B64 = 1_500_000;
const RATE = { windowMs: 10 * 60 * 1000, max: 40 };
const hits = new Map();

function cors(origin, allowed) {
  const ok = allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] || "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });

/* Limite simple par adresse IP (par instance du worker) */
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE.windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE.max;
}

/* N'accepte que des messages texte / image bien formés */
function clean(messages) {
  if (!Array.isArray(messages) || !messages.length) throw new Error("Aucun message.");
  const out = messages.slice(-MAX_MESSAGES).map((m) => {
    if (m.role !== "user" && m.role !== "assistant") throw new Error("Rôle invalide.");
    if (typeof m.content === "string") return { role: m.role, content: m.content.slice(0, MAX_TEXT) };
    if (!Array.isArray(m.content)) throw new Error("Contenu invalide.");
    const blocks = m.content.map((b) => {
      if (b.type === "text") return { type: "text", text: String(b.text || "").slice(0, MAX_TEXT) };
      if (b.type === "image" && m.role === "user" && b.source && b.source.type === "base64" &&
          ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(b.source.media_type) &&
          typeof b.source.data === "string" && b.source.data.length <= MAX_IMAGE_B64) {
        return { type: "image", source: { type: "base64", media_type: b.source.media_type, data: b.source.data } };
      }
      throw new Error("Bloc non pris en charge.");
    });
    return { role: m.role, content: blocks };
  });
  if (out[0].role !== "user") out.shift();
  if (!out.length) throw new Error("Aucun message.");
  return out;
}

export default {
  async fetch(request, env) {
    const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get("Origin") || "";
    const h = cors(origin, allowed);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405, h);
    if (!allowed.includes(origin)) return json({ error: "Origine non autorisée." }, 403, h);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "Clé API absente sur le serveur IA." }, 500, h);
    if (limited(request.headers.get("CF-Connecting-IP") || "?"))
      return json({ error: "Trop de demandes. Réessayez dans quelques minutes." }, 429, h);

    let body;
    try { body = await request.json(); } catch { return json({ error: "Requête illisible." }, 400, h); }
    let messages;
    try { messages = clean(body.messages); } catch (e) { return json({ error: e.message }, 400, h); }
    const system = String(body.system || "").slice(0, 4000);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const response = await client.beta.messages.create({
        model: env.MODEL || "claude-opus-5-5",
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system,
        messages,
      });
      if (response.stop_reason === "refusal")
        return json({ text: "Désolée, je ne peux pas vous aider pour cette demande." }, 200, h);
      const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      return json({ text }, 200, h);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return json({ error: "Le service IA est très sollicité. Réessayez dans un instant." }, 429, h);
      if (e instanceof Anthropic.AuthenticationError) return json({ error: "Clé API invalide sur le serveur IA." }, 500, h);
      if (e instanceof Anthropic.BadRequestError) return json({ error: "Demande refusée par le service IA." }, 400, h);
      if (e instanceof Anthropic.APIError) return json({ error: "Service IA indisponible (" + e.status + ")." }, 502, h);
      return json({ error: "Erreur du serveur IA." }, 500, h);
    }
  },
};
