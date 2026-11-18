/**
 * Programmatic entry point: embed the server in your own process or connect
 * it to another transport. The `omnillink-mcp` executable is `dist/bin.js`.
 */
export { createServer, describeError, type ServerOptions } from './server.js';
export { readConfig, ConfigError, DEFAULT_BASE_URL, type Config } from './config.js';
export { TOOLS, type ToolDefinition } from './tools.js';
