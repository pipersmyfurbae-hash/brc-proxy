/* ════════════════════════════════════════════════════════════════════
   EVERCRAFTED — WREATH RENDER STUDIO · SERVER PROXY · v4
   Upload this file INTO the api folder of your brc-proxy repo,
   replacing the existing realism.js. (Open the api folder on GitHub
   first, then Add file → Upload files, so it lands inside api/.)

   New in v4: forwards a seed to the model, so the same Proof + same
   prompt + same seed returns the same Editorial render. Reproducible.
   ════════════════════════════════════════════════════════════════════ */

const REPLICATE_API = "https://api.replicate.com/v1";
const KONTEXT_MODEL = "black-forest-labs/flux-kontext-pro";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return res.status(500).json({ error: "REPLICATE_API_TOKEN not configured on server" });

  try {
    const { image, prompt, seed } = req.body || {};
    if (!image || !image.startsWith("data:image/")) {
      return res.status(400).json({ error: "Body must include `image` as a data URL" });
    }
    if (!prompt) return res.status(400).json({ error: "Body must include `prompt`" });

    const input = {
      prompt,
      input_image: image,
      output_format: "png",
      safety_tolerance: 2,
    };
    if (Number.isFinite(Number(seed))) input.seed = Math.floor(Number(seed));

    const create = await fetch(`${REPLICATE_API}/models/${KONTEXT_MODEL}/predictions`, {
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
    return res.status(200).json({ output, id: prediction.id, seed: input.seed ?? null });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Realism pass failed" });
  }
}
