const ALLOWED_ORIGIN = "https://eribosch.github.io";
const MODEL = "fal-ai/flux-pro/kontext";

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (origin !== ALLOWED_ORIGIN) return json({ error: "Origen no autorizado." }, 403, origin);
    if (request.method !== "POST") return json({ error: "Usa POST para generar." }, 405, origin);
    if (!env.FAL_API_KEY) return json({ error: "Falta configurar FAL_API_KEY en Cloudflare." }, 500, origin);

    try {
      const body = await request.json();
      const { prompt, imageDataUrl } = body || {};
      if (typeof prompt !== "string" || prompt.length < 10 || prompt.length > 5000) {
        return json({ error: "Las instrucciones deben tener entre 10 y 5000 caracteres." }, 400, origin);
      }
      if (typeof imageDataUrl !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(imageDataUrl)) {
        return json({ error: "Adjunta una imagen PNG, JPG o WEBP válida." }, 400, origin);
      }
      if (imageDataUrl.length > 8_000_000) return json({ error: "La imagen supera el límite de 6 MB. Reduce su tamaño e inténtalo de nuevo." }, 413, origin);

      const upstream = await fetch("https://fal.run/" + MODEL, {
        method: "POST",
        headers: {
          "Authorization": "Key " + env.FAL_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt,
          image_url: imageDataUrl,
          num_images: 1,
          output_format: "png",
          guidance_scale: 3.5
        })
      });
      const result = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        return json({ error: result.detail || result.message || "El servicio de imágenes rechazó la solicitud.", upstreamStatus: upstream.status }, 502, origin);
      }
      const imageUrl = result.images && result.images[0] && result.images[0].url;
      if (!imageUrl) return json({ error: "El servicio respondió, pero no devolvió una imagen." }, 502, origin);
      return json({ imageUrl, width: result.images[0].width || null, height: result.images[0].height || null }, 200, origin);
    } catch (error) {
      return json({ error: "No se pudo procesar la solicitud. " + (error && error.message ? error.message : "") }, 500, origin);
    }
  }
};