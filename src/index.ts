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
import { register as listMethods } from './tools/list-methods.js';

// Keep stdout clean for MCP protocol — redirect console.log to stderr
console.log = (...args: unknown[]) => console.error(...args);

// ─── Server ──────────────────────────────────────────────

const INSTRUCTIONS = [
  'Rust documentation server for docs.rs, crates.io, and the standard library (std/core/alloc).',
  '',
  'Recommended workflow:',
  '1. Discovery: search_crates to find crates, get_crate_brief for a quick overview',
  '2. Navigation: get_crate_items to list module contents, search_crate to find items by name',
  '3. Details: lookup_crate_item for full docs (use includeExamples/includeImpls for extras)',
  '4. Methods: list_methods to see all methods on a struct/enum/trait',
  '5. Shortcuts: resolve_type to go from a full path like "tokio::sync::Mutex" directly to docs',
  '6. Batch: batch_lookup to fetch multiple items in one call',
  '',
  'Tips:',
  '- modulePath uses dots not colons: "sync.mpsc" not "sync::mpsc"',
  '- lookup_crate_item auto-discovers modulePath when omitted',
  '- get_source_code paths are relative to crate root (e.g. "src/lib.rs")',
].join('\n');

const server = new McpServer(
  { name: 'rust-docs', version: '5.0.0' },
  { instructions: INSTRUCTIONS } as Record<string, unknown>,
);

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
listMethods(server);

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
