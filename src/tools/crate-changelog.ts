import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  fetchCrateInfo, fetchJson, truncate,
  textResult, errorResult, isStdCrate,
} from '../lib.js';
import { cacheGet, cacheSet } from '../cache.js';

interface GhRelease {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
}

function extractGhOwnerRepo(url: string): string | null {
  const m = url.match(/github\.com\/([^/]+\/[^/]+)/);
  if (!m) return null;
  return m[1].replace(/\.git$/, '');
}

export function register(server: McpServer) {
  server.tool(
    'get_crate_changelog',
    'Fetch recent GitHub releases for a crate. Requires the crate to have a GitHub repository link on crates.io.',
    {
      crateName: z.string().describe('Crate name'),
      count: z.number().min(1).max(20).optional().describe('Number of releases to fetch (default 5, max 20)'),
    },
    async ({ crateName, count: rawCount }: { crateName: string; count?: number }) => {
      const count = rawCount ?? 5;
      try {
        if (isStdCrate(crateName)) {
          return textResult(
            `"${crateName}" is part of the Rust standard library.\n` +
            `See https://github.com/rust-lang/rust/blob/master/RELEASES.md for changelogs.`
          );
        }

        const cacheKey = `changelog:${crateName}:${count}`;
        const cached = cacheGet<string>(cacheKey);
        if (cached) {
          console.log(`[cache hit] changelog ${crateName}`);
          return textResult(cached);
        }

        const info = await fetchCrateInfo(crateName);
        if (!info.repository) {
          return errorResult(`No repository link found for "${crateName}" on crates.io.`);
        }

        const ownerRepo = extractGhOwnerRepo(info.repository);
        if (!ownerRepo) {
          return errorResult(`Repository "${info.repository}" is not a GitHub URL.`);
        }

        const releases = await fetchJson<GhRelease[]>(
          `https://api.github.com/repos/${ownerRepo}/releases?per_page=${count}`,
        );

        if (!releases.length) {
          return textResult(`No GitHub releases found for ${ownerRepo}.`);
        }

        const parts: string[] = [
          `# ${crateName} — recent releases (${ownerRepo})`,
          '',
        ];

        for (const r of releases) {
          const date = r.published_at?.slice(0, 10) ?? 'unknown';
          const title = r.name || r.tag_name;
          const body = r.body ? truncate(r.body.trim(), 1000) : '(no release notes)';
          parts.push(`## ${title} (${date})`, body, '');
        }

        const result = parts.join('\n');
        cacheSet(cacheKey, result);
        return textResult(result);
      } catch (e: unknown) {
        return errorResult(`Could not fetch changelog for "${crateName}". ${(e as Error).message}`);
      }
    },
  );
}
