import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  docsUrl, fetchDom, cleanHtml, truncate,
  modToUrlPrefix, modToRustPrefix, searchAllItems,
  extractItemFeatureGate,
  TYPE_FILE_PREFIX, textResult, errorResult,
} from '../lib.js';
import { itemTypeEnum, versionParam } from './shared.js';

const querySchema = z.object({
  itemType: itemTypeEnum.describe('Item type'),
  itemName: z.string().describe('Item name'),
  modulePath: z.string().optional().describe('Dot-separated module path'),
});

export function register(server: McpServer) {
  server.tool(
    'batch_lookup',
    'Look up multiple items in a single call. Returns a compact summary (signature + short doc) for each item. Saves round-trips when you need several items.',
    {
      crateName: z.string().describe('Crate name'),
      items: z.array(querySchema).min(1).max(20).describe('Items to look up (max 20)'),
      version: versionParam,
    },
    async ({ crateName, items, version }: {
      crateName: string;
      items: { itemType: string; itemName: string; modulePath?: string }[];
      version?: string;
    }) => {
      const ver = version ?? 'latest';
      const parts: string[] = [`# Batch lookup: ${crateName} (${items.length} items)`, ''];

      const results = await Promise.allSettled(
        items.map(async ({ itemType, itemName, modulePath }) => {
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
          const page =
            itemType === 'mod'
              ? `${prefix}${itemName}/index.html`
              : `${prefix}${TYPE_FILE_PREFIX[itemType] ?? `${itemType}.`}${itemName}.html`;

          const url = docsUrl(crateName, page, ver);
          const $ = await fetchDom(url);

          const fullName = `${crateName}::${modToRustPrefix(resolvedModulePath)}${itemName}`;
          const decl = $('pre.rust.item-decl').text().trim();
          const featureGate = extractItemFeatureGate($);
          const doc = truncate(
            cleanHtml($('details.toggle.top-doc').html() ?? ''),
            500,
          );

          return { itemType, fullName, decl, featureGate, doc, url };
        }),
      );

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const { itemType, itemName } = items[i];

        if (r.status === 'fulfilled') {
          const { fullName, decl, featureGate, doc, url } = r.value;
          parts.push(`## ${itemType} ${fullName}`, url);
          if (featureGate) parts.push(`> ${featureGate}`);
          if (decl) parts.push('```rust', decl, '```');
          if (doc) parts.push(doc);
          parts.push('');
        } else {
          parts.push(`## ${itemType} ${itemName}`, `  Error: ${r.reason?.message ?? 'unknown error'}`, '');
        }
      }

      return textResult(parts.join('\n'));
    },
  );
}
