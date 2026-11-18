/**
 * Programmatic entry point: the CLI as a function, for tests and wrappers.
 * The `omnillink` executable itself is `dist/bin.js`.
 */
export { run, type Io, type OutputRecord } from './run.js';
export { EXIT, DEFAULT_BASE_URL } from './commands.js';
export { UsageError } from './args.js';
