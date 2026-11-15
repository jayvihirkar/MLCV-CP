import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const python = process.platform === 'win32'
  ? resolve(root, '.venv-document', 'Scripts', 'python.exe')
  : resolve(root, '.venv-document', 'bin', 'python');

if (!existsSync(python)) {
  console.error('Document worker Python environment is missing. Create .venv-document and install services/document_pipeline/requirements.txt once; then npm run dev starts everything.');
  process.exit(1);
}

const worker = spawn(python, [
  '-m', 'uvicorn', 'services.document_pipeline.app:app',
  '--host', '127.0.0.1', '--port', '8000', '--workers', '1',
  '--env-file', '.env',
], { cwd: root, stdio: 'inherit', env: process.env });

worker.on('error', failure => {
  console.error(`Could not start the document worker: ${failure.message}`);
  process.exitCode = 1;
});
worker.on('exit', code => {
  process.exitCode = code ?? 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!worker.killed) worker.kill(signal);
  });
}
