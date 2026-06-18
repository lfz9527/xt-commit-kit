import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATES_DIR = resolve(__dirname, '../templates');
const CONFIGS_DIR = resolve(__dirname, 'configs');

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

function log(msg) {
  console.log(msg);
}

function success(msg) {
  console.log(`${GREEN}✅  ${msg}${RESET}`);
}

function warn(msg) {
  console.log(`${YELLOW}⚠️  ${msg}${RESET}`);
}

function info(msg) {
  console.log(`${CYAN}💡 ${msg}${RESET}`);
}

/**
 * Detect which package manager is used in the project.
 * Returns { name, installCmd } or null.
 */
function detectPackageManager(projectRoot) {
  const checks = [
    { name: 'pnpm', file: 'pnpm-lock.yaml', installCmd: 'pnpm add -D' },
    { name: 'yarn', file: 'yarn.lock', installCmd: 'yarn add -D' },
    { name: 'bun', file: 'bun.lockb', installCmd: 'bun add -D' },
    { name: 'npm', file: 'package-lock.json', installCmd: 'npm install -D' },
  ];

  for (const check of checks) {
    try {
      statSync(resolve(projectRoot, check.file));
      return { name: check.name, installCmd: check.installCmd };
    } catch {
      // file not found, try next
    }
  }

  // Default to npm if no lock file found
  return { name: 'npm', installCmd: 'npm install -D' };
}

/**
 * Check that we are in a git repo.
 */
function checkGitRepo(projectRoot) {
  try {
    execSync('git rev-parse --git-dir', { cwd: projectRoot, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and parse the project package.json.
 */
async function readPackageJson(projectRoot) {
  const pkgPath = resolve(projectRoot, 'package.json');
  const raw = await readFile(pkgPath, 'utf-8');
  return { path: pkgPath, data: JSON.parse(raw), raw };
}

/**
 * Format JSON with the same indentation as the original, or default 2.
 */
function formatJson(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

/**
 * Deep merge b into a. Arrays are replaced, not merged.
 */
function deepMerge(a, b) {
  const result = { ...a };
  for (const key of Object.keys(b)) {
    if (
      b[key] &&
      typeof b[key] === 'object' &&
      !Array.isArray(b[key]) &&
      a[key] &&
      typeof a[key] === 'object' &&
      !Array.isArray(a[key])
    ) {
      result[key] = deepMerge(a[key], b[key]);
    } else {
      result[key] = b[key];
    }
  }
  return result;
}

/**
 * Write a file, creating parent directories as needed.
 */
async function writeFileSafe(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
}

/**
 * Copy a file from package to project.
 * Returns: 'created' | 'skipped' | 'overwritten'
 */
async function copyTemplate(templateName, destPath, force) {
  const srcPath = resolve(TEMPLATES_DIR, templateName);

  // Check if destination exists
  try {
    await access(destPath, constants.F_OK);
    if (!force) {
      return 'skipped';
    }
    // force: overwrite
    const content = await readFile(srcPath, 'utf-8');
    await writeFile(destPath, content, 'utf-8');
    return 'overwritten';
  } catch {
    // File doesn't exist, create it
    const content = await readFile(srcPath, 'utf-8');
    await writeFileSafe(destPath, content);
    return 'created';
  }
}

/**
 * Copy a config file from package to project.
 * Returns: 'created' | 'skipped' | 'overwritten'
 */
async function copyConfig(configName, destPath, force) {
  const srcPath = resolve(CONFIGS_DIR, configName);

  try {
    await access(destPath, constants.F_OK);
    if (!force) {
      return 'skipped';
    }
    const content = await readFile(srcPath, 'utf-8');
    await writeFile(destPath, content, 'utf-8');
    return 'overwritten';
  } catch {
    const content = await readFile(srcPath, 'utf-8');
    await writeFileSafe(destPath, content);
    return 'created';
  }
}

/**
 * Check if a CLI tool is available in the project (node_modules/.bin or npx).
 */
function isToolAvailable(toolName, projectRoot) {
  const binPath = resolve(projectRoot, 'node_modules', '.bin', toolName);
  try {
    statSync(binPath);
    return true;
  } catch {
    // not in node_modules/.bin
  }
  // Try npx to see if it's globally available
  try {
    execSync(`npx --no-install ${toolName} --version`, {
      cwd: projectRoot,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build lint-staged config based on available tools.
 * Returns { config, missing: string[] }
 */
function buildLintStagedConfig(projectRoot) {
  const hasEslint = isToolAvailable('eslint', projectRoot);
  const hasPrettier = isToolAvailable('prettier', projectRoot);
  const missing = [];

  if (!hasEslint) missing.push('eslint');
  if (!hasPrettier) missing.push('prettier');

  if (!hasEslint && !hasPrettier) {
    return { config: {}, missing };
  }

  const config = {};

  if (hasEslint && hasPrettier) {
    config['*.{js,jsx,ts,tsx}'] = ['eslint --fix', 'prettier --write'];
  } else if (hasEslint) {
    config['*.{js,jsx,ts,tsx}'] = ['eslint --fix'];
  } else if (hasPrettier) {
    config['*.{js,jsx,ts,tsx}'] = ['prettier --write'];
  }

  if (hasPrettier) {
    config['*.{css,scss,less,md,html,json}'] = ['prettier --write'];
  }

  return { config, missing };
}

/**
 * Main init function.
 */
export async function init({ dryRun = false, force = false } = {}) {
  const projectRoot = process.cwd();

  log('');
  log(`${BOLD}@xtmm/commit-kit${RESET} — init`);
  log('');

  // 1. Environment checks
  log('🔍  Environment check...');

  if (!checkGitRepo(projectRoot)) {
    warn('Not a git repository. Run "git init" first, then retry.');
    return;
  }
  success('Found .git directory');

  let pkg;
  try {
    pkg = await readPackageJson(projectRoot);
    success('Found package.json');
  } catch {
    warn('No package.json found. Run "npm init" first, then retry.');
    return;
  }

  const pm = detectPackageManager(projectRoot);
  info(`Detected package manager: ${pm.name}`);

  // Collect changes for dry-run summary
  const changes = {
    hooks: [],
    configs: [],
    packageJson: [],
  };

  log('');
  log('📋  Plan:');

  // 2. Hook files
  const huskyDir = resolve(projectRoot, '.husky');

  for (const hook of ['pre-commit', 'commit-msg']) {
    const dest = resolve(huskyDir, hook);
    let exists = false;
    try {
      await access(dest, constants.F_OK);
      exists = true;
    } catch {
      // doesn't exist
    }

    if (exists && !force) {
      changes.hooks.push({ hook, action: 'skip' });
    } else if (exists && force) {
      changes.hooks.push({ hook, action: 'overwrite' });
    } else {
      changes.hooks.push({ hook, action: 'create' });
    }
  }

  // 3. Config files
  const configFiles = [
    { name: '.cz-config.cjs', src: 'cz-config.cjs' },
    { name: 'commitlint.config.js', src: 'commitlint.config.mjs' },
  ];

  for (const cfg of configFiles) {
    const dest = resolve(projectRoot, cfg.name);
    let exists = false;
    try {
      await access(dest, constants.F_OK);
      exists = true;
    } catch {
      // doesn't exist
    }

    if (exists && !force) {
      changes.configs.push({ ...cfg, action: 'skip' });
    } else if (exists && force) {
      changes.configs.push({ ...cfg, action: 'overwrite' });
    } else {
      changes.configs.push({ ...cfg, action: 'create' });
    }
  }

  // 4. package.json updates
  const pkgUpdates = [];

  if (!pkg.data.scripts?.prepare || pkg.data.scripts.prepare !== 'husky') {
    pkgUpdates.push({ key: 'scripts.prepare', value: 'husky', action: 'set' });
  } else {
    pkgUpdates.push({ key: 'scripts.prepare', value: 'husky', action: 'keep' });
  }

  // Remove deprecated husky v4 hooks config
  if (pkg.data.husky?.hooks) {
    pkgUpdates.push({ key: 'husky.hooks', value: null, action: 'remove' });
  }

  // Merge lint-staged config
  const { config: lintStagedConfig, missing: missingTools } =
    buildLintStagedConfig(projectRoot);

  // Warn about missing tools early
  for (const tool of missingTools) {
    info(
      `${tool} not found — "lint-staged" will skip ${tool}-related checks.\n` +
        `    Install with: ${pm.installCmd} ${tool}`
    );
  }

  if (pkg.data['lint-staged']) {
    pkgUpdates.push({ key: 'lint-staged', action: 'keep' });
  } else {
    pkgUpdates.push({
      key: 'lint-staged',
      value: lintStagedConfig,
      action: 'set',
    });
  }

  // Commitizen config
  const czConfig = {
    path: 'node_modules/cz-customizable',
    config: { path: './.cz-config.cjs' },
  };
  if (pkg.data.config?.commitizen) {
    pkgUpdates.push({ key: 'config.commitizen', action: 'keep' });
  } else {
    pkgUpdates.push({ key: 'config.commitizen', value: czConfig, action: 'set' });
  }

  // cz-customizable config
  const czCustomConfig = { config: './.cz-config.cjs' };
  if (pkg.data.config?.['cz-customizable']) {
    pkgUpdates.push({ key: 'config.cz-customizable', action: 'keep' });
  } else {
    pkgUpdates.push({
      key: 'config.cz-customizable',
      value: czCustomConfig,
      action: 'set',
    });
  }

  changes.packageJson = pkgUpdates;

  // Dry-run: print plan and exit
  if (dryRun) {
    log('');
    log('─── Hooks ───');
    for (const h of changes.hooks) {
      const icon = h.action === 'skip' ? '⏭️ ' : h.action === 'overwrite' ? '🔄' : '➕';
      log(`  ${icon} .husky/${h.hook} (${h.action})`);
    }
    log('');
    log('─── Configs ───');
    for (const c of changes.configs) {
      const icon = c.action === 'skip' ? '⏭️ ' : c.action === 'overwrite' ? '🔄' : '➕';
      log(`  ${icon} ${c.name} (${c.action})`);
    }
    log('');
    log('─── package.json ───');
    for (const u of changes.packageJson) {
      const icon = u.action === 'remove' ? '🗑️ ' : u.action === 'keep' ? '⏭️ ' : '✏️ ';
      if (u.action === 'remove') {
        log(`  ${icon} Remove "${u.key}"`);
      } else {
        log(`  ${icon} ${u.key} (${u.action})`);
      }
    }
    log('');
    log('─── Post-init ───');
    log('  🔧 Run husky to install git hooks');
    log('');
    return;
  }

  // 5. Execute changes
  log('');
  log('🚀  Executing...');

  // Write hooks
  for (const h of changes.hooks) {
    if (h.action === 'skip') {
      warn(`.husky/${h.hook} already exists — skipped`);
      continue;
    }
    await copyTemplate(h.hook, resolve(huskyDir, h.hook), force);
    if (h.action === 'overwrite') {
      success(`.husky/${h.hook} overwritten`);
    } else {
      success(`.husky/${h.hook} created`);
    }
  }

  // Write configs
  for (const c of changes.configs) {
    if (c.action === 'skip') {
      warn(`${c.name} already exists — skipped`);
      continue;
    }
    await copyConfig(c.src, resolve(projectRoot, c.name), force);
    if (c.action === 'overwrite') {
      success(`${c.name} overwritten`);
    } else {
      success(`${c.name} created`);
    }
  }

  // Update package.json
  if (changes.packageJson.some((u) => u.action !== 'keep')) {
    const updatedPkg = { ...pkg.data };

    for (const u of changes.packageJson) {
      if (u.action === 'remove') {
        // Handle nested keys like "husky.hooks"
        const parts = u.key.split('.');
        let obj = updatedPkg;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!obj[parts[i]]) break;
          obj = obj[parts[i]];
        }
        if (obj) {
          delete obj[parts[parts.length - 1]];
        }
        // Clean up empty parent if needed
        if (parts.length > 1) {
          let parent = updatedPkg;
          for (let i = 0; i < parts.length - 1; i++) {
            if (
              parent[parts[i]] &&
              typeof parent[parts[i]] === 'object' &&
              Object.keys(parent[parts[i]]).length === 0
            ) {
              delete parent[parts[i]];
              break;
            }
            if (parent[parts[i]]) {
              parent = parent[parts[i]];
            }
          }
        }
        success(`Removed "${u.key}" from package.json`);
      } else if (u.action === 'set') {
        // Handle nested keys
        const parts = u.key.split('.');
        let obj = updatedPkg;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!obj[parts[i]]) obj[parts[i]] = {};
          obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = u.value;
        success(`Set "${u.key}" in package.json`);
      }
    }

    await writeFile(pkg.path, formatJson(updatedPkg));
  }

  // 6. Run husky
  log('');
  log('🔧  Running husky...');
  try {
    execSync('npx husky', { cwd: projectRoot, stdio: 'pipe' });
    success('Husky initialized');
  } catch {
    warn('Husky init failed — run "npx husky" manually');
  }

  // 7. Summary
  log('');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(`${BOLD}${GREEN}🎉  Done!${RESET} Commit-kit is ready.`);
  log('');
  // Build tool description for summary
  const enabledTools = [];
  if (isToolAvailable('eslint', projectRoot)) enabledTools.push('eslint');
  if (isToolAvailable('prettier', projectRoot)) enabledTools.push('prettier');
  const toolDesc =
    enabledTools.length > 0 ? ` (${enabledTools.join(' + ')})` : '';

  log('Installed hooks:');
  log(`  • pre-commit → lint-staged${toolDesc}`);
  log('  • commit-msg → commitlint');
  log('');
  log('Next steps:');
  log(`  1. Install the package:  ${pm.installCmd} @xtmm/commit-kit`);
  log('  2. Customize .cz-config.cjs if needed');
  log('  3. Use "git cz" or "pnpm commit" for guided commits');
  log('');
  log(`   You can also edit "lint-staged" in package.json to adjust lint rules.`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('');
}
