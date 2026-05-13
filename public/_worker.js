export default {
  fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/compare" || url.pathname.startsWith("/compare/")) {
      return new Response("Gone", {
        status: 410,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=3600",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
