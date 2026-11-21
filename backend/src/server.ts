import { createApp } from './app';
import { PORT } from './config';
import { ensureReady } from './services/bootstrap';

async function main() {
  await ensureReady(console.log);
  createApp().listen(PORT, () => console.log(`FORGE API listening on http://localhost:${PORT}`));
}

main().catch((err) => {
  console.error('FORGE API failed to start:', err);
  process.exit(1);
});
