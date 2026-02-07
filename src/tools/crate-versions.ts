import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import axios from 'axios';
import { CRATES_IO, USER_AGENT, textResult, errorResult, isStdCrate } from '../lib.js';
import { cacheGet, cacheSet } from '../cache.js';

interface VersionEntry {
  num: string;
  yanked: boolean;
  created_at: string;
  license: string;
}

export function register(server: McpServer) {
  server.tool(
    'get_crate_versions',
    'List all published versions of a crate from crates.io, with yanked status and release dates.',
    {
      crateName: z.string().describe('Crate name'),
    },
    async ({ crateName }: { crateName: string }) => {
      try {
        if (isStdCrate(crateName)) {
          return textResult(
            `"${crateName}" is part of the Rust standard library and is not published on crates.io.\n` +
            `Its version matches the Rust toolchain version.`
          );
        }

        const cacheKey = `crate-versions:${crateName}`;
        const cached = cacheGet<string>(cacheKey);
        if (cached) {
          console.log(`[cache hit] crate-versions ${crateName}`);
          return textResult(cached);
        }

        const { data } = await axios.get(`${CRATES_IO}/crates/${crateName}/versions`, {
          headers: { 'User-Agent': USER_AGENT },
          timeout: 10_000,
        });

        const versions: VersionEntry[] = (data.versions ?? []).map((v: Record<string, unknown>) => ({
          num: v.num as string,
          yanked: v.yanked as boolean,
          created_at: v.created_at as string,
          license: (v.license as string) ?? '',
        }));

        if (!versions.length) {
          return textResult(`No versions found for "${crateName}".`);
        }

        const lines = versions.map((v) => {
          const date = v.created_at.slice(0, 10);
          const yanked = v.yanked ? ' [YANKED]' : '';
          return `  ${v.num}  ${date}${yanked}`;
        });

        const result = [
          `# ${crateName} — ${versions.length} versions`,
          '',
          ...lines,
        ].join('\n');

        cacheSet(cacheKey, result);
        return textResult(result);
      } catch (e: unknown) {
        return errorResult(`Could not fetch versions for "${crateName}". ${(e as Error).message}`);
      }
    },
  );
}
