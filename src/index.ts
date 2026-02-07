import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { register as lookupDocs } from './tools/lookup-docs.js';
import { register as getItems } from './tools/get-items.js';
import { register as lookupItem } from './tools/lookup-item.js';
import { register as search } from './tools/search.js';
import { register as crateMetadata } from './tools/crate-metadata.js';
import { register as crateBrief } from './tools/crate-brief.js';
import { register as searchCrates } from './tools/search-crates.js';
import { register as crateVersions } from './tools/crate-versions.js';
import { register as sourceCode } from './tools/source-code.js';
import { register as batchLookup } from './tools/batch-lookup.js';
import { register as crateChangelog } from './tools/crate-changelog.js';
import { register as resolveType } from './tools/resolve-type.js';

// Keep stdout clean for MCP protocol — redirect console.log to stderr
console.log = (...args: unknown[]) => console.error(...args);

// ─── Server ──────────────────────────────────────────────

const server = new McpServer({ name: 'rust-docs', version: '4.0.0' });

// Register tools
lookupDocs(server);
getItems(server);
lookupItem(server);
search(server);
crateMetadata(server);
crateBrief(server);
searchCrates(server);
crateVersions(server);
sourceCode(server);
batchLookup(server);
crateChangelog(server);
resolveType(server);

// ─── Prompt ──────────────────────────────────────────────

server.prompt(
  'lookup_crate_docs',
  { crateName: z.string().describe('Crate name') },
  ({ crateName }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Analyze the documentation for the Rust crate '${crateName}'. Focus on:`,
            '1. Main purpose and features',
            '2. Key types and functions',
            '3. Common usage patterns',
            '4. Important notes or warnings',
            '5. Latest version',
          ].join('\n'),
        },
      },
    ],
  }),
);

// ─── Start ───────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error('Failed to start server:', e);
  process.exit(1);
});
