#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PKG_PATH = resolve(__dirname, '../package.json');
const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8'));

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const flags = new Set(args.filter((a) => a.startsWith('-')));

  // --version
  if (flags.has('--version') || flags.has('-v')) {
    console.log(pkg.version);
    return;
  }

  // init is the only command for now
  if (!command || command === 'init') {
    const { init } = await import('../src/init.js');
    await init({
      dryRun: flags.has('--dry-run'),
      force: flags.has('--force'),
    });
    return;
  }

  // Unknown command
  console.log(`Usage: commit-kit [command] [options]

Commands:
  init               Initialize commit config in the current project

Options:
  --dry-run          Preview changes without writing files
  --force            Overwrite existing config files
  --version, -v      Print version

Example:
  npx @xtmm/commit-kit init
  npx @xtmm/commit-kit init --dry-run
  npx @xtmm/commit-kit init --force`);
}

main().catch((err) => {
  console.error('\n❌  An unexpected error occurred:');
  console.error(err.message);
  process.exit(1);
});
