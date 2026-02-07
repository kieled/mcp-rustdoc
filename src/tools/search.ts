import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  docsUrl, fetchDom,
  textResult, errorResult,
  SECTION_TO_TYPE, MAX_SEARCH_RESULTS,
} from '../lib.js';
import { versionParam } from './shared.js';

interface SearchHit {
  type: string;
  name: string;     // display name from all.html (e.g. "sync::Mutex")
  href: string;
  score: number;
}

function scoreMatch(name: string, query: string): number {
  const lower = name.toLowerCase();
  const q = query.toLowerCase();

  // Extract the bare item name (after last ::)
  const bareName = lower.includes('::') ? lower.split('::').pop()! : lower;

  if (bareName === q) return 100;       // exact match on item name
  if (lower === q) return 95;           // exact match on full path
  if (bareName.startsWith(q)) return 60; // prefix match on item name
  if (lower.startsWith(q)) return 55;   // prefix match on full path
  if (lower.includes(q)) return 20;     // substring match
  return 0;
}

export function register(server: McpServer) {
  server.tool(
    'search_crate',
    'Search for items by name within a Rust crate. Returns ranked results with canonical paths and item types.',
    {
      crateName: z.string().describe('Crate name'),
      query: z.string().describe('Search query (matched against item names)'),
      version: versionParam,
    },
    async ({ crateName, query, version }: { crateName: string; query: string; version?: string }) => {
      try {
        const ver = version ?? 'latest';
        const url = docsUrl(crateName, 'all.html', ver);
        const $ = await fetchDom(url);

        const hits: SearchHit[] = [];

        $('h3').each((_, h3) => {
          const rawId = $(h3).attr('id') ?? '';
          const type = SECTION_TO_TYPE[rawId] ?? rawId;

          $(h3)
            .next('ul.all-items')
            .find('li a')
            .each((_, a) => {
              const name = $(a).text().trim();
              const href = $(a).attr('href') ?? '';
              const score = scoreMatch(name, query);
              if (score > 0) hits.push({ type, name, href, score });
            });
        });

        if (!hits.length) return textResult(`No matches for "${query}" in ${crateName}.`);

        // Sort by score descending, then alphabetically
        hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

        const capped = hits.slice(0, MAX_SEARCH_RESULTS);
        const lines = capped.map((h) => {
          const canonical = `${crateName}::${h.name.replace(/::/g, '::')}`;
          return `[${h.type}] ${canonical}`;
        });
        const overflow =
          hits.length > MAX_SEARCH_RESULTS ? ` (showing first ${MAX_SEARCH_RESULTS})` : '';

        return textResult(
          [`# "${query}" in ${crateName} — ${hits.length} matches${overflow}`, '', ...lines].join(
            '\n',
          ),
        );
      } catch (e: unknown) {
        return errorResult(`Could not search "${crateName}". ${(e as Error).message}`);
      }
    },
  );
}
