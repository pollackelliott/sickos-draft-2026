import { writeFileSync, mkdirSync } from 'node:fs';

const checkOnly = process.argv.includes('--check');
const databaseId = checkOnly
  ? '00000000-0000-4000-8000-000000000000'
  : process.env.SICKOS_D1_DATABASE_ID?.trim();

if (!databaseId) {
  throw new Error('SICKOS_D1_DATABASE_ID is required.');
}

const config = {
  $schema: './node_modules/wrangler/config-schema.json',
  name: 'sickos-draft-2026',
  main: './src/server/worker.ts',
  compatibility_date: '2026-10-11',
  assets: {
    directory: './dist',
    binding: 'ASSETS',
    not_found_handling: 'single-page-application',
    run_worker_first: ['/api/*'],
  },
  d1_databases: [
    {
      binding: 'DB',
      database_name: 'sickos-draft-2026',
      database_id: databaseId,
      migrations_dir: 'migrations',
    },
  ],
};

mkdirSync('.wrangler', { recursive: true });
writeFileSync('.wrangler/deploy.jsonc', `${JSON.stringify(config, null, 2)}\n`);
console.log(checkOnly ? 'Wrote dry-run Wrangler config.' : 'Wrote deployment Wrangler config.');
