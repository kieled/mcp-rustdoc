import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  fetchCrateInfo, fetchCrateVersionInfo, fetchCrateDeps,
  textResult, errorResult, isStdCrate,
} from '../lib.js';
import { versionParam } from './shared.js';

export function register(server: McpServer) {
  server.tool(
    'get_crate_metadata',
    'Get crate metadata from crates.io: version, features, default features, optional dependencies, and links.',
    {
      crateName: z.string().describe('Crate name'),
      version: versionParam,
    },
    async ({ crateName, version }: { crateName: string; version?: string }) => {
      try {
        if (isStdCrate(crateName)) {
          return textResult(
            `"${crateName}" is part of the Rust standard library and is not published on crates.io.\n` +
            `Use lookup_crate_docs, get_crate_items, lookup_crate_item, or search_crate to browse its documentation.`
          );
        }

        const info = await fetchCrateInfo(crateName);
        const ver = version ?? info.version;
        const [versionInfo, deps] = await Promise.all([
          fetchCrateVersionInfo(crateName, ver),
          fetchCrateDeps(crateName, ver),
        ]);

        const parts: string[] = [
          `# ${info.name} v${versionInfo.num}`,
          '',
          `${info.description}`,
          '',
          '## Links',
        ];

        if (info.documentation) parts.push(`  docs: ${info.documentation}`);
        if (info.repository) parts.push(`  repo: ${info.repository}`);
        parts.push(`  crates.io: https://crates.io/crates/${info.name}`);
        parts.push(`  license: ${versionInfo.license}`);
        parts.push(`  downloads: ${info.downloads.toLocaleString()}`);

        // Features
        const { features, defaultFeatures } = versionInfo;
        parts.push('', '## Features');
        parts.push(`  default = [${defaultFeatures.join(', ')}]`);

        const featureNames = Object.keys(features).filter((f) => f !== 'default').sort();
        for (const name of featureNames) {
          const activates = features[name];
          const tag = activates.length ? ` = [${activates.join(', ')}]` : '';
          parts.push(`  ${name}${tag}`);
        }

        // Optional dependencies (behind features)
        const optionalDeps = deps.filter((d) => d.optional && d.kind === 'normal');
        if (optionalDeps.length) {
          parts.push('', '## Optional Dependencies');
          for (const dep of optionalDeps) {
            parts.push(`  ${dep.name} ${dep.req} (feature-gated)`);
          }
        }

        // Required dependencies
        const requiredDeps = deps.filter((d) => !d.optional && d.kind === 'normal');
        if (requiredDeps.length) {
          parts.push('', '## Required Dependencies');
          for (const dep of requiredDeps) {
            parts.push(`  ${dep.name} ${dep.req}`);
          }
        }

        if (versionInfo.yanked) {
          parts.push('', '> WARNING: This version has been yanked.');
        }

        return textResult(parts.join('\n'));
      } catch (e: unknown) {
        return errorResult(`Could not fetch metadata for "${crateName}". ${(e as Error).message}`);
      }
    },
  );
}
