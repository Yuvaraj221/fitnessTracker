// Usage: npm run sample:load   — replace sample rows with a fresh 3-week set ending today
//        npm run sample:remove — delete every sample row (a backup is taken first)
import { initDataFiles } from '../src/csv/init';
import { evaluateAndStore } from '../src/services/achievements';
import { loadSampleData, removeSampleData } from '../src/services/sample';

const cmd = process.argv[2];

async function main() {
  await initDataFiles(() => undefined);
  if (cmd === 'load') {
    const r = await loadSampleData();
    const unlocked = await evaluateAndStore();
    console.log(`Loaded sample data: ${r.workouts} workouts, ${r.meals} food entries, ${r.bodyMetrics} body metrics.`);
    console.log(`${unlocked.length} achievement(s) unlocked.`);
  } else if (cmd === 'remove') {
    const r = await removeSampleData();
    const unlocked = await evaluateAndStore();
    console.log(`Removed ${r.removed} sample record(s). Rebuilt ${unlocked.length} achievement(s) from your own data.`);
  } else {
    console.log('Usage: tsx scripts/sample-data.ts <load|remove>');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
