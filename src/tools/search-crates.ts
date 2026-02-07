import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CRATES_IO, fetchJson, textResult, errorResult } from '../lib.js';
import { cacheGet, cacheSet } from '../cache.js';

interface CrateSearchResult {
  name: string;
  description: string;
  downloads: number;
  max_stable_version: string | null;
  max_version: string;
}

interface CrateSearchResponse {
  crates: CrateSearchResult[];
  meta?: { total?: number };
}

export function register(server: McpServer) {
  server.tool(
    'search_crates',
    'Search for Rust crates on crates.io by keyword. Returns name, description, downloads, and version.',
    {
      query: z.string().describe('Search keywords'),
      page: z.number().min(1).optional().describe('Page number (default 1)'),
      perPage: z.number().min(1).max(50).optional().describe('Results per page (default 10, max 50)'),
    },
    { readOnlyHint: true },
    async ({ query, page: rawPage, perPage: rawPerPage }: { query: string; page?: number; perPage?: number }) => {
      const page = rawPage ?? 1;
      const perPage = rawPerPage ?? 10;
      try {
        const cacheKey = `search-crates:${query}:${page}:${perPage}`;
        const cached = cacheGet<string>(cacheKey);
        if (cached) {
          console.log(`[cache hit] search-crates "${query}" page=${page}`);
          return textResult(cached);
        }

        const params = new URLSearchParams({
          q: query,
          per_page: String(perPage),
          page: String(page),
        });
        const data = await fetchJson<CrateSearchResponse>(`${CRATES_IO}/crates?${params}`);
        const crates = data.crates ?? [];

        if (!crates.length) {
          return textResult(`No crates found for "${query}".`);
        }

        const total = data.meta?.total ?? crates.length;
        const lines = crates.map((c) => {
          const ver = c.max_stable_version || c.max_version;
          const dl = c.downloads.toLocaleString();
          const desc = c.description ? ` — ${c.description.trim()}` : '';
          return `  ${c.name} v${ver} (${dl} downloads)${desc}`;
        });

        const hasMore = page * perPage < total;
        const pageHint = hasMore
          ? `\n\n[Page ${page} of ${Math.ceil(total / perPage)}. Use page: ${page + 1} for more.]`
          : '';

        const result = [
          `# Crate search: "${query}" — ${total} results (page ${page})`,
          '',
          ...lines,
        ].join('\n') + pageHint;

        cacheSet(cacheKey, result);
        return textResult(result);
      } catch (e: unknown) {
        return errorResult(`Could not search crates.io for "${query}". ${(e as Error).message}`);
      }
    },
  );
}
