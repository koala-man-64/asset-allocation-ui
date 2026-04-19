import { execFileSync } from 'node:child_process';

const baseRef = process.env.FORMAT_BASE_REF ?? 'main';
const sourcePattern = /^src\/.*\.(ts|tsx|css|md)$/;

function git(args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function resolveMergeBase() {
  try {
    return git(['merge-base', 'HEAD', baseRef]);
  } catch {
    return 'HEAD';
  }
}

function listChangedSourceFiles() {
  const mergeBase = resolveMergeBase();
  const output = git(['diff', '--name-only', '--diff-filter=ACMRTUXB', mergeBase, '--', 'src']);

  return output
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => sourcePattern.test(file));
}

function resolvePnpmCommand() {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath]
    };
  }

  return {
    command: process.platform === 'win32' ? 'corepack.cmd' : 'corepack',
    args: ['pnpm']
  };
}

const files = listChangedSourceFiles();

if (files.length === 0) {
  console.log(`No changed src files to format-check against ${baseRef}.`);
  process.exit(0);
}

const pnpm = resolvePnpmCommand();

execFileSync(
  pnpm.command,
  [...pnpm.args, 'exec', 'prettier', '--config', '.prettierrc', '--check', ...files],
  {
    cwd: process.cwd(),
    stdio: 'inherit'
  }
);
