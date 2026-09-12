// Vercel's Node.js Function runtime sometimes hands the handler a Request
// whose `.url` is a relative path (e.g. "/api/health?x=1") instead of an
// absolute URL — unlike Deno/Cloudflare Workers/a plain node:http server,
// where request.url built via @whatwg-node/server is always absolute.
// `new URL(relativePath)` throws ERR_INVALID_URL ("Invalid URL") in that
// case, so build the absolute URL ourselves using the request's own Host
// header (and X-Forwarded-Proto, which Vercel sets) as the base whenever
// req.url isn't already absolute.
export function absoluteUrl(req: Request): URL {
  try {
    return new URL(req.url);
  } catch {
    const host = req.headers.get("host") || "localhost";
    const proto = req.headers.get("x-forwarded-proto") || "https";
    return new URL(req.url, `${proto}://${host}`);
  }
}
