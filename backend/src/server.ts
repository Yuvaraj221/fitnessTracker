import { DATA_DIR, PORT } from './config';
import { createApp } from './app';
import { initDataFiles } from './csv/init';
import { evaluateAndStore } from './services/achievements';

async function main() {
  console.log(`FORGE data directory: ${DATA_DIR}`);
  await initDataFiles();
  const fresh = await evaluateAndStore();
  if (fresh.length) console.log(`  ${fresh.length} achievement(s) unlocked from existing data`);
  createApp().listen(PORT, () => console.log(`FORGE API listening on http://localhost:${PORT}`));
}

main().catch((err) => {
  console.error('FORGE API failed to start:', err);
  process.exit(1);
});
