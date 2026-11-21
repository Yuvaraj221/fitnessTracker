// Vercel serverless function for every /api/* request (see vercel.json rewrites).
// The Express app is bundled from backend/src/vercel.ts by `npm run bundle:api`,
// which Vercel runs during install (before functions are built).
import app from '../backend/dist/vercel.mjs';

export default function handler(req, res) {
  // The rewrite `/api/:path*` -> `/api` may hand the function `/api?path=<rest>`
  // instead of the original URL. Restore the original path so Express routes match.
  const url = new URL(req.url ?? '/', 'http://localhost');
  if ((url.pathname === '/api' || url.pathname === '/api/') && url.searchParams.has('path')) {
    const rest = url.searchParams.get('path') ?? '';
    url.searchParams.delete('path');
    const qs = url.searchParams.toString();
    req.url = `/api/${rest}${qs ? `?${qs}` : ''}`;
  }
  return app(req, res);
}
