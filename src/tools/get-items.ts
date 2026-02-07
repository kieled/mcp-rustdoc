import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  docsUrl, fetchDom, modToUrlPrefix,
  textResult, errorResult, SECTION_TO_TYPE, MAX_SEARCH_RESULTS,
} from '../lib.js';
import { itemTypeEnum, versionParam } from './shared.js';

export function register(server: McpServer) {
  server.tool(
    'get_crate_items',
    'List public items in a crate root or module. Returns names, types, feature gates, and short descriptions. Supports filtering by item type and feature gate.',
    {
      crateName: z.string().describe('Crate name'),
      modulePath: z
        .string()
        .optional()
        .describe('Dot-separated module path (e.g. "sync", "io.util"). Omit for crate root.'),
      itemType: itemTypeEnum
        .optional()
        .describe('Filter results to a single item type'),
      feature: z
        .string()
        .optional()
        .describe('Filter to items gated behind this feature (e.g. "sync", "fs")'),
      version: versionParam,
    },
    { readOnlyHint: true },
    async ({ crateName, modulePath, itemType, feature, version }: {
      crateName: string; modulePath?: string; itemType?: string; feature?: string; version?: string;
    }) => {
      try {
        const ver = version ?? 'latest';
        const url = docsUrl(crateName, `${modToUrlPrefix(modulePath)}index.html`, ver);
        const $ = await fetchDom(url);

        const lines: string[] = [];

        $('h2.section-header').each((_, h2) => {
          const sectionId = $(h2).attr('id') ?? '';
          const type = SECTION_TO_TYPE[sectionId] ?? sectionId;
          if (itemType && type !== itemType) return;

          $(h2).next('dl.item-table').find('dt').each((_, dt) => {
            const $dt = $(dt);
            const name = $dt.find('a').first().text().trim();
            const desc = $dt.next('dd').text().trim();
            const gate = $dt.find('.stab.portability code').first().text().trim();
            if (!name) return;

            // Feature filter: skip items not behind the requested feature
            if (feature) {
              if (!gate || !gate.toLowerCase().includes(feature.toLowerCase())) return;
            }

            const tag = gate ? ` [feature: ${gate}]` : '';
            lines.push(`[${type}] ${name}${tag} — ${desc}`);
          });
        });

        const label = modulePath
          ? `${crateName}::${modulePath.replace(/\./g, '::')}`
          : crateName;

        const filters: string[] = [];
        if (itemType) filters.push(`type: ${itemType}`);
        if (feature) filters.push(`feature: ${feature}`);
        const filterLabel = filters.length ? ` (${filters.join(', ')})` : '';

        if (!lines.length) {
          return textResult(`No items found in ${label}${filterLabel}.`);
        }

        const capped = lines.slice(0, MAX_SEARCH_RESULTS);
        const overflow = lines.length > MAX_SEARCH_RESULTS
          ? `\n\n[…${lines.length - MAX_SEARCH_RESULTS} more items. Narrow with itemType or feature filter.]`
          : '';

        return textResult(
          [`# Items in ${label}${filterLabel} (${lines.length})`, url, '', ...capped].join('\n') + overflow,
        );
      } catch (e: unknown) {
        return errorResult(
          `Could not list items for "${crateName}". ${(e as Error).message}\n` +
          `Tip: check the module path exists with lookup_crate_docs({ crateName: "${crateName}" }).`,
        );
      }
    },
  );
}
