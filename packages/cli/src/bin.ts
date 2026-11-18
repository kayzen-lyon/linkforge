#!/usr/bin/env node
import { run } from './run.js';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());

// `omnillink content … | head`: the reader leaving early is not a crash.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') process.exit(0);
  });
}

// `exitCode` rather than `exit()`: buffered output is flushed before leaving.
process.exitCode = await run({
  argv: process.argv.slice(2),
  env: process.env,
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  signal: controller.signal,
});
