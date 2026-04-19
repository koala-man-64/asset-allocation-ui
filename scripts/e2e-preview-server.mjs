import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const portFlagIndex = args.findIndex((value) => value === '--port');
const previewPort =
  portFlagIndex >= 0 && args[portFlagIndex + 1] ? args[portFlagIndex + 1] : '4173';
const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

function spawnCorepack(args, options = {}) {
  if (process.platform === 'win32') {
    return spawn(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', `corepack ${args.join(' ')}`],
      {
        stdio: 'inherit',
        shell: false,
        ...options
      }
    );
  }

  return spawn(corepackCommand, args, {
    stdio: 'inherit',
    shell: false,
    ...options
  });
}

function runCorepack(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnCorepack(args, options);

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Command ${args.join(' ')} terminated with signal ${signal}.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Command ${args.join(' ')} exited with code ${code}.`));
        return;
      }
      resolve();
    });
  });
}

async function main() {
  const env = {
    ...process.env,
    VITE_UI_AUTH_ENABLED: 'false'
  };

  await runCorepack(['pnpm', 'build'], { env });

  const previewProcess = spawnCorepack(
    ['pnpm', 'preview', '--host', '127.0.0.1', '--port', previewPort],
    {
      env
    }
  );

  const forwardSignal = (signal) => {
    if (!previewProcess.killed) {
      previewProcess.kill(signal);
    }
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  previewProcess.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });

  previewProcess.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
