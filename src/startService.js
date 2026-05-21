'use strict';

const { spawn } = require('child_process');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function start() {
  if (process.env.SKIP_MIGRATIONS !== 'true') {
    await run('npx', ['prisma', 'migrate', 'deploy']);
  }

  const role = (process.env.SERVICE_ROLE || 'api').toLowerCase();
  if (role === 'worker') {
    const { startWorker } = require('./worker');
    await startWorker();
    return;
  }

  require('../server');
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
