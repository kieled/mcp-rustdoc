import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  docsUrl, fetchDom, modToUrlPrefix, modToRustPrefix,
  searchAllItems, extractMethods,
  textResult, errorResult, TYPE_FILE_PREFIX,
} from '../lib.js';
import { itemTypeEnum, versionParam } from './shared.js';

export function register(server: McpServer) {
  server.tool(
    'list_methods',
    'List methods of a struct, enum, or trait with signatures, deprecation status, and short descriptions.',
    {
      crateName: z.string().describe('Crate name'),
      itemType: itemTypeEnum.describe('Item type (struct, enum, or trait)'),
      itemName: z.string().describe('Item name (e.g. "HashMap", "Iterator")'),
      modulePath: z
        .string()
        .optional()
        .describe('Dot-separated module path (e.g. "collections"). Auto-discovered if omitted.'),
      version: versionParam,
    },
    { readOnlyHint: true },
    async ({ crateName, itemType, itemName, modulePath, version }: {
      crateName: string; itemType: string; itemName: string;
      modulePath?: string; version?: string;
    }) => {
      try {
        const ver = version ?? 'latest';

        // Auto-discover modulePath if not provided
        let resolvedModulePath = modulePath;
        if (resolvedModulePath === undefined) {
          const hits = await searchAllItems(crateName, itemName, ver);
          const match = hits.find((h) =>
            h.bareName.toLowerCase() === itemName.toLowerCase() && h.type === itemType,
          ) ?? hits.find((h) =>
            h.bareName.toLowerCase() === itemName.toLowerCase(),
          );
          if (match) resolvedModulePath = match.modulePath || undefined;
        }

        const prefix = modToUrlPrefix(resolvedModulePath);
        const page = `${prefix}${TYPE_FILE_PREFIX[itemType] ?? `${itemType}.`}${itemName}.html`;
        const url = docsUrl(crateName, page, ver);
        const $ = await fetchDom(url);

        const methods = extractMethods($);
        const fullName = `${crateName}::${modToRustPrefix(resolvedModulePath)}${itemName}`;

        if (!methods.length) {
          return textResult(`No methods found for ${itemType} ${fullName}.\n${url}`);
        }

        const lines: string[] = [
          `# Methods of ${itemType} ${fullName} (${methods.length})`,
          url,
          '',
        ];

        for (const m of methods) {
          const tags: string[] = [];
          if (m.deprecated) tags.push('DEPRECATED');
          if (m.featureGate) tags.push(`feature: ${m.featureGate}`);
          const tagStr = tags.length ? ` [${tags.join(', ')}]` : '';
          lines.push(`### ${m.name}${tagStr}`);
          lines.push('```rust', m.signature, '```');
          if (m.shortDoc) lines.push(m.shortDoc);
          lines.push('');
        }

        return textResult(lines.join('\n'));
      } catch (e: unknown) {
        return errorResult(
          `Could not list methods for ${itemType} "${itemName}". ${(e as Error).message}\n` +
          `Tip: verify the item exists with search_crate({ crateName: "${crateName}", query: "${itemName}" }).`,
        );
      }
    },
  );
}
