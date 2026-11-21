// Entry point for the Vercel serverless function (bundled to backend/dist/vercel.mjs
// and re-exported by api/index.mjs). The Express app is itself a (req, res) handler.
import { createApp } from './app';

const app = createApp({ lazyInit: true });
export default app;
