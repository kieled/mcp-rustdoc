import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  docsUrl, fetchDom, cleanHtml, truncate, extractReExports,
  textResult, errorResult, MAX_DOC_LENGTH,
} from '../lib.js';
import { versionParam } from './shared.js';

export function register(server: McpServer) {
  server.tool(
    'lookup_crate_docs',
    'Fetch the main documentation for a Rust crate. Returns overview, version, sections, and re-exports.',
    {
      crateName: z.string().describe('Crate name (e.g. "tokio", "serde-json")'),
      version: versionParam,
    },
    { readOnlyHint: true },
    async ({ crateName, version }: { crateName: string; version?: string }) => {
      try {
        const ver = version ?? 'latest';
        const url = docsUrl(crateName, 'index.html', ver);
        const $ = await fetchDom(url);

        const pageVersion = $('.sidebar-crate .version').text().trim() || ver;
        const doc = truncate(
          cleanHtml($('details.toggle.top-doc').html() ?? ''),
          MAX_DOC_LENGTH,
        );

        const sections: string[] = [];
        $('h2.section-header').each((_, el) => {
          const id = $(el).attr('id') ?? '';
          const count = $(el).next('dl.item-table').find('dt').length;
          if (id && count) sections.push(`  ${$(el).text().trim()} (${count})`);
        });

        const reexports = extractReExports($);

        const parts = [`# ${crateName} v${pageVersion}`, url, '', doc];

        if (reexports.length) {
          parts.push('', '## Re-exports', ...reexports.map((r) => `  ${r}`));
        }

        parts.push('', '## Sections', ...sections);

        return textResult(parts.join('\n'));
      } catch (e: unknown) {
        return errorResult(
          `Could not fetch docs for "${crateName}". ${(e as Error).message}\n` +
          `Tip: check the crate name with search_crates({ query: "${crateName}" }).`,
        );
      }
    },
  );
}
