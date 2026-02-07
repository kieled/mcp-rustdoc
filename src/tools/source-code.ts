import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  DOCS_BASE, crateSlug, fetchDom, isStdCrate,
  textResult, errorResult, truncate,
} from '../lib.js';
import { versionParam } from './shared.js';

export function register(server: McpServer) {
  server.tool(
    'get_source_code',
    'Fetch the source code of a Rust item from docs.rs. Returns the raw source implementation.',
    {
      crateName: z.string().describe('Crate name'),
      path: z.string().describe('Source path relative to crate root (e.g. "src/lib.rs", "src/sync/mutex.rs")'),
      version: versionParam,
    },
    async ({ crateName, path, version }: { crateName: string; path: string; version?: string }) => {
      try {
        // Strip leading "src/" — the URL templates already include /src/
        const srcPath = path.replace(/^src\//, '');

        if (isStdCrate(crateName)) {
          const url = `https://doc.rust-lang.org/stable/src/${crateName}/${srcPath}.html`;
          const $ = await fetchDom(url);
          const code = $('#source-code').text().trim() || $('pre.rust').text().trim();
          if (!code) return errorResult(`No source code found at ${url}`);
          return textResult([
            `# Source: ${crateName}/${path}`,
            url,
            '',
            '```rust',
            truncate(code, 12000),
            '```',
          ].join('\n'));
        }

        const ver = version ?? 'latest';
        const url = `${DOCS_BASE}/${crateName}/${ver}/src/${crateSlug(crateName)}/${srcPath}.html`;
        const $ = await fetchDom(url);

        // docs.rs source pages have the code in #source-code or pre elements inside .rust-src
        const code = $('#source-code').text().trim()
          || $('pre.rust').text().trim()
          || $('.src-line-numbers + code').text().trim();

        if (!code) {
          return errorResult(`No source code found at ${url}. Check that the path is correct.`);
        }

        return textResult([
          `# Source: ${crateName}/${path}`,
          url,
          '',
          '```rust',
          truncate(code, 12000),
          '```',
        ].join('\n'));
      } catch (e: unknown) {
        return errorResult(`Could not fetch source for "${crateName}/${path}". ${(e as Error).message}`);
      }
    },
  );
}
