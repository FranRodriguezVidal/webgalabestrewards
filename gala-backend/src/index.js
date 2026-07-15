const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
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

    // Endpoint para subir imágenes
    if (request.method === "POST" && url.pathname === "/upload") {
      const contentType = request.headers.get("content-type") || "";

      if (!contentType.includes("multipart/form-data")) {
        return new Response("Formato inválido", {
          status: 400,
          headers: CORS_HEADERS
        });
      }

      const formData = await request.formData();
      const file = formData.get("file");

      if (!file) {
        return new Response("No se envió archivo", {
          status: 400,
          headers: CORS_HEADERS
        });
      }

      // Convertir a Base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );

      const fileName = Date.now() + "-" + file.name;

      // Guardar en KV
      await env.IMAGES.put(fileName, base64);

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
      const base64 = await env.IMAGES.get(fileName);

      if (!base64) {
        return new Response("Imagen no encontrada", {
          status: 404,
          headers: CORS_HEADERS
        });
      }

      // Convertir Base64 a binario
      const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      return new Response(binary, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "image/jpeg"
        }
      });
    }

    return new Response("OK", { headers: CORS_HEADERS });
  }
};
