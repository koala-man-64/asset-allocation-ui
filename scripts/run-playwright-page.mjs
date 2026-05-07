import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE_REGISTRY_PATH = path.join(REPO_ROOT, 'src', 'app', 'routeRegistry.ts');
const STOCK_ROUTES_PATH = path.join(REPO_ROOT, 'src', 'features', 'stocks', 'stockRoutes.ts');
const DEFAULT_PREVIEW_PORT = '4173';
const rawCliArgs = process.argv.slice(2);
const cliArgs = new Set(rawCliArgs);

function readCliOption(name) {
  const prefix = `--${name}=`;
  return rawCliArgs.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readText(filePath) {
  return readFileSync(filePath, 'utf8');
}

function extractArraySource(source, name) {
  const declarationIndex = source.search(new RegExp(`(?:export\\s+)?const\\s+${name}\\b`));
  if (declarationIndex < 0) {
    throw new Error(`Could not find ${name} in ${ROUTE_REGISTRY_PATH}.`);
  }

  const equalsIndex = source.indexOf('=', declarationIndex);
  if (equalsIndex < 0) {
    throw new Error(`Could not find initializer for ${name}.`);
  }

  const openIndex = source.indexOf('[', equalsIndex);
  if (openIndex < 0) {
    throw new Error(`Could not find array initializer for ${name}.`);
  }

  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex + 1, index);
      }
    }
  }

  throw new Error(`Could not parse array initializer for ${name}.`);
}

function splitTopLevelObjects(arraySource) {
  const blocks = [];
  let depth = 0;
  let start = -1;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < arraySource.length; index += 1) {
    const char = arraySource[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        blocks.push(arraySource.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return blocks;
}

function readStockRouteConstants() {
  const source = readText(STOCK_ROUTES_PATH);
  const basePath = source.match(/STOCK_DETAIL_BASE_PATH\s*=\s*'([^']+)'/)?.[1] ?? '/stock-detail';
  return {
    STOCK_DETAIL_BASE_PATH: basePath,
    STOCK_DETAIL_ROUTE: basePath
  };
}

function resolvePathExpression(rawExpression, constants) {
  const expression = rawExpression.trim();
  const literalMatch = expression.match(/^'([^']+)'$/);
  if (literalMatch) {
    return literalMatch[1];
  }

  return constants[expression] ?? null;
}

function titleCaseKey(key) {
  return key
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseRoutePages() {
  const source = readText(ROUTE_REGISTRY_PATH);
  const constants = readStockRouteConstants();
  const routeBlocks = splitTopLevelObjects(extractArraySource(source, 'APP_ROUTE_REGISTRY'));
  const navigationOnlyBlocks = splitTopLevelObjects(
    extractArraySource(source, 'NAVIGATION_ONLY_ITEMS')
  );
  const pages = [];

  for (const block of routeBlocks) {
    const key = block.match(/key:\s*'([^']+)'/)?.[1];
    const routePathExpression = block.match(/^\s*path:\s*([^,\n]+)/m)?.[1];
    if (!key || !routePathExpression) {
      continue;
    }

    const navSection = block.match(/nav:\s*\{([\s\S]*?)\n\s{4}\}/)?.[1] ?? '';
    const label = navSection.match(/label:\s*'([^']+)'/)?.[1] ?? titleCaseKey(key);
    const navPathExpression = navSection.match(/^\s*path:\s*([^,\n]+)/m)?.[1];
    const resolvedPath = resolvePathExpression(navPathExpression ?? routePathExpression, constants);

    if (resolvedPath) {
      pages.push({ key, label, path: resolvedPath });
    }
  }

  for (const block of navigationOnlyBlocks) {
    const label = block.match(/label:\s*'([^']+)'/)?.[1];
    const pathExpression = block.match(/^\s*path:\s*([^,\n]+)/m)?.[1];
    const resolvedPath = pathExpression ? resolvePathExpression(pathExpression, constants) : null;

    if (label && resolvedPath) {
      pages.push({ key: label.toLowerCase().replace(/\s+/g, '-'), label, path: resolvedPath });
    }
  }

  const seen = new Set();
  return pages.filter((page) => {
    if (seen.has(page.path)) {
      return false;
    }
    seen.add(page.path);
    return true;
  });
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    readText(filePath)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        if (separatorIndex < 0) {
          return null;
        }

        const key = line.slice(0, separatorIndex).trim();
        const value = line
          .slice(separatorIndex + 1)
          .trim()
          .replace(/^"|"$/g, '');
        return [key, value];
      })
      .filter(Boolean)
  );
}

function normalizeBaseUrl(value) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}

function resolveAzureBaseUrl() {
  const localEnv = parseEnvFile(path.join(REPO_ROOT, '.env.local'));
  const webEnv = parseEnvFile(path.join(REPO_ROOT, '.env.web'));
  const candidates = [
    process.env.PLAYWRIGHT_AZURE_BASE_URL,
    process.env.UI_PUBLIC_HOSTNAME,
    process.env.VITE_UI_PUBLIC_HOSTNAME,
    localEnv.UI_PUBLIC_HOSTNAME,
    localEnv.VITE_UI_PUBLIC_HOSTNAME,
    webEnv.UI_PUBLIC_HOSTNAME,
    webEnv.VITE_UI_PUBLIC_HOSTNAME
  ];

  for (const candidate of candidates) {
    const baseUrl = normalizeBaseUrl(candidate);
    if (baseUrl) {
      return baseUrl;
    }
  }

  return null;
}

function printPages(pages) {
  console.log('Pages:');
  for (const [index, page] of pages.entries()) {
    console.log(`${String(index + 1).padStart(2, ' ')}. ${page.label} (${page.path})`);
  }
}

async function promptForPage(readline, pages) {
  while (true) {
    const answer = (await readline.question(`Choose a page [1-${pages.length}]: `)).trim();
    const page = findPage(answer, pages);
    if (page) {
      return page;
    }

    console.log('Enter a page number, label, or path from the list.');
  }
}

function findPage(answer, pages) {
  const selectedIndex = Number(answer);
  if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= pages.length) {
    return pages[selectedIndex - 1];
  }

  return pages.find(
    (candidate) =>
      candidate.path.toLowerCase() === answer.toLowerCase() ||
      candidate.label.toLowerCase() === answer.toLowerCase() ||
      candidate.key.toLowerCase() === answer.toLowerCase()
  );
}

function resolveLocalTarget() {
  const localOverride = normalizeBaseUrl(process.env.PLAYWRIGHT_LOCAL_BASE_URL);
  return {
    name: 'local',
    baseUrl: localOverride,
    usesPlaywrightPreviewServer: !localOverride
  };
}

async function resolveAzureTarget(readline) {
  const cliAzureBaseUrl = normalizeBaseUrl(readCliOption('azure-url'));
  const baseUrl =
    cliAzureBaseUrl ??
    resolveAzureBaseUrl() ??
    normalizeBaseUrl(await readline.question('Azure base URL: '));

  if (!baseUrl) {
    return null;
  }

  return {
    name: 'azure',
    baseUrl,
    usesPlaywrightPreviewServer: false
  };
}

function printTargets() {
  const localOverride = normalizeBaseUrl(process.env.PLAYWRIGHT_LOCAL_BASE_URL);
  const localLabel =
    localOverride ??
    `local preview server on http://127.0.0.1:${process.env.PLAYWRIGHT_PREVIEW_PORT ?? DEFAULT_PREVIEW_PORT}`;
  const azureBaseUrl = resolveAzureBaseUrl();

  console.log('');
  console.log('Targets:');
  console.log(`1. Local (${localLabel})`);
  console.log(`2. Azure (${azureBaseUrl ?? 'prompt for URL'})`);
}

async function promptForTarget(readline) {
  printTargets();

  while (true) {
    const answer = (await readline.question('Choose a target [1-2]: ')).trim().toLowerCase();

    if (answer === '1' || answer === 'local' || answer === 'l') {
      return resolveLocalTarget();
    }

    if (answer === '2' || answer === 'azure' || answer === 'a') {
      const azureTarget = await resolveAzureTarget(readline);
      if (!azureTarget) {
        console.log('Enter a valid Azure hostname or URL.');
        continue;
      }

      return azureTarget;
    }

    console.log('Enter 1 for local or 2 for Azure.');
  }
}

function runPlaywright(selectedPage, target) {
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const args = ['exec', 'playwright', 'test', 'e2e/manual-page.spec.ts', '--headed'];
  const env = {
    ...process.env,
    PLAYWRIGHT_MANUAL_PAGE_LABEL: selectedPage.label,
    PLAYWRIGHT_MANUAL_PAGE_PATH: selectedPage.path
  };

  if (target.baseUrl) {
    env.PLAYWRIGHT_BASE_URL = target.baseUrl;
  }

  console.log('');
  console.log(`Launching headed Playwright for ${selectedPage.label} on ${target.name}.`);
  if (target.usesPlaywrightPreviewServer) {
    console.log('Playwright will build and start the local preview server first.');
  } else {
    console.log(`Base URL: ${target.baseUrl}`);
  }

  if (cliArgs.has('--dry-run')) {
    console.log(`Dry run command: ${pnpmCommand} ${args.join(' ')}`);
    return;
  }

  const child = spawn(pnpmCommand, args, {
    cwd: REPO_ROOT,
    env,
    stdio: 'inherit',
    shell: false
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });
}

async function main() {
  const pages = parseRoutePages();
  if (pages.length === 0) {
    throw new Error('No pages were parsed from the route registry.');
  }

  printPages(pages);
  if (cliArgs.has('--list')) {
    return;
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const pageOption = readCliOption('page');
    const selectedPage = pageOption
      ? findPage(pageOption, pages)
      : await promptForPage(readline, pages);
    if (!selectedPage) {
      throw new Error(`Unknown page '${pageOption}'. Use --list to see available pages.`);
    }

    const targetOption = readCliOption('target')?.toLowerCase();
    const target =
      targetOption === 'local' || targetOption === '1' || targetOption === 'l'
        ? resolveLocalTarget()
        : targetOption === 'azure' || targetOption === '2' || targetOption === 'a'
          ? await resolveAzureTarget(readline)
          : await promptForTarget(readline);
    if (!target) {
      throw new Error(
        'Azure target requires PLAYWRIGHT_AZURE_BASE_URL, --azure-url, or an entered URL.'
      );
    }

    runPlaywright(selectedPage, target);
  } finally {
    readline.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
