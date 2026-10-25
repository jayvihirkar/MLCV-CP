import { readFile } from 'node:fs/promises';

// Import this before configuring services; deployed environment variables win.
try {
  const content = await readFile(new URL('../.env', import.meta.url), 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
