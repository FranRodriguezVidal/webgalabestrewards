const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept"
};

const base64EncodeArrayBuffer = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    try {
      // Endpoint para subir imágenes
      if (request.method === "POST" && url.pathname === "/upload") {
        const contentType = request.headers.get("content-type") || "";

        if (!contentType.includes("multipart/form-data")) {
          return new Response(JSON.stringify({ error: "Formato inválido" }), {
            status: 400,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": "application/json"
            }
          });
        }

        const formData = await request.formData();
        const file = formData.get("file");

        if (!file) {
          return new Response(JSON.stringify({ error: "No se envió archivo" }), {
            status: 400,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": "application/json"
            }
          });
        }

        // Convertir a Base64 de forma segura para archivos grandes
        const arrayBuffer = await file.arrayBuffer();
        const base64 = base64EncodeArrayBuffer(arrayBuffer);
        const mimeType = file.type || "application/octet-stream";

        const fileName = Date.now() + "-" + file.name;

        // Guardar en KV como JSON para preservar el tipo MIME
        await env.IMAGES.put(fileName, JSON.stringify({
          mime: mimeType,
          content: base64,
        }));

        return new Response(JSON.stringify({ fileName }), {
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/json"
          }
        });
      }

      // Endpoint para servir imágenes
      if (request.method === "GET" && url.pathname.startsWith("/image/")) {
        const fileName = url.pathname.replace("/image/", "");
        const stored = await env.IMAGES.get(fileName);

        if (!stored) {
          return new Response(JSON.stringify({ error: "Imagen no encontrada" }), {
            status: 404,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": "application/json"
            }
          });
        }

        let parsed;
        try {
          parsed = JSON.parse(stored);
        } catch (err) {
          return new Response(JSON.stringify({ error: "Formato de imagen inválido" }), {
            status: 500,
            headers: {
              ...CORS_HEADERS,
              "Content-Type": "application/json"
            }
          });
        }

        const { mime, content } = parsed;
        const binary = Uint8Array.from(atob(content), c => c.charCodeAt(0));

        return new Response(binary, {
          headers: {
            ...CORS_HEADERS,
            "Content-Type": mime
          }
        });
      }

      return new Response("OK", { headers: CORS_HEADERS });
    } catch (err) {
      return new Response(JSON.stringify({ error: err?.message || "Error interno" }), {
        status: 500,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json"
        }
      });
    }
  }
};
