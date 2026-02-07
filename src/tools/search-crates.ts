import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import axios from 'axios';
import { CRATES_IO, USER_AGENT, textResult, errorResult } from '../lib.js';
import { cacheGet, cacheSet } from '../cache.js';

interface CrateSearchResult {
  name: string;
  description: string;
  downloads: number;
  max_stable_version: string | null;
  max_version: string;
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

        const { data } = await axios.get(`${CRATES_IO}/crates`, {
          params: { q: query, per_page: perPage, page },
          headers: { 'User-Agent': USER_AGENT },
          timeout: 10_000,
        });

        const crates: CrateSearchResult[] = data.crates ?? [];

        if (!crates.length) {
          return textResult(`No crates found for "${query}".`);
        }

        const total: number = data.meta?.total ?? crates.length;
        const lines = crates.map((c) => {
          const ver = c.max_stable_version || c.max_version;
          const dl = c.downloads.toLocaleString();
          const desc = c.description ? ` — ${c.description.trim()}` : '';
          return `  ${c.name} v${ver} (${dl} downloads)${desc}`;
        });

        const result = [
          `# Crate search: "${query}" — ${total} results (page ${page})`,
          '',
          ...lines,
        ].join('\n');

        cacheSet(cacheKey, result);
        return textResult(result);
      } catch (e: unknown) {
        return errorResult(`Could not search crates.io for "${query}". ${(e as Error).message}`);
      }
    },
  );
}
