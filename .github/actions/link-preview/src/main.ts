/** Entry point of the bundle (`dist/index.mjs`): what the runner executes. */
import { run } from './action.js';

process.exitCode = await run({ env: process.env, log: (line) => process.stdout.write(`${line}\n`) });
