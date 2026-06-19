#!/usr/bin/env node
// commit-kit-cz: dispatch to commitizen with resolved adapter path
// Works regardless of package manager hoisting strategy

import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const req = createRequire(import.meta.url);

// Resolve cz-customizable from our own dependency tree (pnpm-safe)
const adapterPath = req.resolve('cz-customizable');

// Load commitizen's git-cz bootstrap and call it directly,
// passing the resolved adapter path to bypass configLoader
const gitCz = req('commitizen/dist/cli/git-cz.js');

// commitizen root is needed for the cliPath
const czDir = dirname(req.resolve('commitizen/package.json'));

gitCz.bootstrap(
  {
    cliPath: czDir,
    config: {
      path: adapterPath,
      config: { path: './.cz-config.cjs' },
    },
  },
  process.argv
);
