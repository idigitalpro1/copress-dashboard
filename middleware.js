// Edge Middleware runs before the filesystem/static layer, so it can serve a
// subdirectory at a custom domain root (rewrites for "/" otherwise lose to the
// root index.html). Maps ricks.conews.press/ -> /ricks-conews-press (the hub).
export const config = { matcher: '/' };

export default function middleware(request) {
  const host = (request.headers.get('host') || '').toLowerCase();
  if (host === 'ricks.conews.press') {
    const dest = new URL('/ricks-conews-press', request.url).toString();
    return new Response(null, { headers: { 'x-middleware-rewrite': dest } });
  }
  // pass everything else through unchanged
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}
