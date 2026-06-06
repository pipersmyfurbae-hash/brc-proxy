/* ════════════════════════════════════════════════════════════════════
   EVERCRAFTED — BRC PHASE 3 · REALISM PASS PROXY
   Vercel serverless function. Drop this file at /api/realism.js in any
   Vercel project (or a fresh one), set REPLICATE_API_TOKEN in the
   project's Environment Variables, deploy. The Anthropic/Replicate key
   NEVER touches the browser — established Evercrafted proxy pattern.

   Deploy steps:
     1. mkdir brc-proxy && cd brc-proxy && mkdir api
     2. save this file as api/realism.js
     3. npx vercel  (link/create project)
     4. npx vercel env add REPLICATE_API_TOKEN   (paste your token)
     5. npx vercel --prod
     6. Endpoint: https://<your-project>.vercel.app/api/realism
        → paste that URL into the BRC-3.0 Editorial panel.

   Model: black-forest-labs/flux-kontext-pro (instruction-based editing,
   strongest structure preservation). An optional flux-dev strength path
   is included below, clamped to the doctrine ceiling of 0.35.
   ════════════════════════════════════════════════════════════════════ */

const REPLICATE_API = "https://api.replicate.com/v1";
const KONTEXT_MODEL = "black-forest-labs/flux-kontext-pro";
const FLUX_DEV_MODEL = "black-forest-labs/flux-dev";
const MAX_STRENGTH = 0.35; // doctrine clamp — AI may retexture, never recompose

export default async function handler(req, res) {
  /* CORS — the claude.ai artifact (or your app) calls this directly */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return res.status(500).json({ error: "REPLICATE_API_TOKEN not configured on server" });

  try {
    const { image, prompt, mode = "kontext", strength = 0.3 } = req.body || {};
    if (!image || !image.startsWith("data:image/")) {
      return res.status(400).json({ error: "Body must include `image` as a data URL" });
    }
    if (!prompt) return res.status(400).json({ error: "Body must include `prompt`" });

    let model, input;
    if (mode === "flux-dev") {
      /* strength-based img2img path — hard clamp */
      model = FLUX_DEV_MODEL;
      input = {
        prompt,
        image,
        prompt_strength: Math.min(MAX_STRENGTH, Math.max(0.15, Number(strength) || 0.3)),
        num_inference_steps: 40,
        guidance: 3,
        output_format: "png",
        disable_safety_checker: false,
      };
    } else {
      /* default: Kontext instruction editing — preserves structure by design */
      model = KONTEXT_MODEL;
      input = {
        prompt,
        input_image: image,
        output_format: "png",
        safety_tolerance: 2,
      };
    }

    /* Prefer: wait holds the connection until the prediction finishes (≤60s) */
    const create = await fetch(`${REPLICATE_API}/models/${model}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({ input }),
    });

    let prediction = await create.json();
    if (!create.ok) {
      return res.status(create.status).json({ error: prediction?.detail || "Replicate request failed" });
    }

    /* Poll if still running (rare with Prefer: wait, but safe) */
    let tries = 0;
    while (prediction.status && !["succeeded", "failed", "canceled"].includes(prediction.status) && tries < 60) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await fetch(`${REPLICATE_API}/predictions/${prediction.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      prediction = await poll.json();
      tries++;
    }

    if (prediction.status !== "succeeded") {
      return res.status(502).json({ error: prediction?.error || `Prediction ${prediction.status}` });
    }

    const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    return res.status(200).json({ output, id: prediction.id, model });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Realism pass failed" });
  }
}
