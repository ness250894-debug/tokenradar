const worker = {
  fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/compare" || url.pathname.startsWith("/compare/")) {
      return new Response("Gone", {
        status: 410,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=3600",
          "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
          "x-content-type-options": "nosniff",
          "x-frame-options": "DENY",
          "referrer-policy": "strict-origin-when-cross-origin",
          "cross-origin-opener-policy": "same-origin",
          "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
          "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};

export default worker;
