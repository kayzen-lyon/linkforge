#!/usr/bin/env node
/**
 * `omnillink-mcp`: the server on standard input / output.
 * Standard output belongs to the protocol; anything for a human goes to stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { ConfigError, DEFAULT_BASE_URL, readConfig } from './config.js';
import { createServer, readVersion } from './server.js';

const HELP = `omnillink-mcp ${readVersion()} — Omnillink as tools for AI agents (Model Context Protocol, stdio)

This program is started by an MCP client (Claude Desktop, Claude Code, Cursor…),
not by hand. It speaks JSON-RPC on standard input and output.

Environment:
  OMNILLINK_URL                  origin of the Omnillink instance
                                 (default: ${DEFAULT_BASE_URL})
  OMNILLINK_API_KEY              API key, sent as the x-api-key header; requires OMNILLINK_URL
  OMNILLINK_TIMEOUT_MS           time allowed per request (default: 60000)
  OMNILLINK_MCP_MAX_CHARS        largest text returned before truncation (default: 20000)
  OMNILLINK_MCP_MAX_IMAGE_BYTES  largest screenshot returned inline (default: 700000)
  OMNILLINK_MCP_OUTPUT_DIR       where omnillink_pdf saves its files (default: <tmp>/omnillink-mcp)

Tools: omnillink_meta, omnillink_content, omnillink_extract, omnillink_screenshot, omnillink_pdf
`;

const [argument] = process.argv.slice(2);
if (argument === '--version' || argument === '-V') {
  process.stdout.write(`${readVersion()}\n`);
} else if (argument !== undefined) {
  (argument === '--help' || argument === '-h' ? process.stdout : process.stderr).write(HELP);
  process.exitCode = argument === '--help' || argument === '-h' ? 0 : 2;
} else {
  try {
    const config = readConfig(process.env);
    const server = createServer({ config });
    await server.connect(new StdioServerTransport());
    // Only the origin: a path or query could carry something private.
    process.stderr.write(`omnillink-mcp ${readVersion()} ready (instance: ${new URL(config.baseUrl).origin})\n`);
  } catch (error) {
    const message = error instanceof ConfigError ? error.message : `failed to start: ${error instanceof Error ? error.message : String(error)}`;
    process.stderr.write(`omnillink-mcp: ${message}\n`);
    process.exitCode = 1;
  }
}
