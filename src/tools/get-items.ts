import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  docsUrl, fetchDom, modToUrlPrefix,
  textResult, errorResult, SECTION_TO_TYPE,
} from '../lib.js';
import { itemTypeEnum, versionParam } from './shared.js';

export function register(server: McpServer) {
  server.tool(
    'get_crate_items',
    'List public items in a crate root or module. Returns names, types, feature gates, and short descriptions.',
    {
      crateName: z.string().describe('Crate name'),
      modulePath: z
        .string()
        .optional()
        .describe('Dot-separated module path (e.g. "sync", "io.util"). Omit for crate root.'),
      itemType: itemTypeEnum
        .optional()
        .describe('Filter results to a single item type'),
      version: versionParam,
    },
    async ({ crateName, modulePath, itemType, version }: {
      crateName: string; modulePath?: string; itemType?: string; version?: string;
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

            const tag = gate ? ` [feature: ${gate}]` : '';
            lines.push(`[${type}] ${name}${tag} — ${desc}`);
          });
        });

        const label = modulePath
          ? `${crateName}::${modulePath.replace(/\./g, '::')}`
          : crateName;

        if (!lines.length) {
          return textResult(
            `No items found in ${label}${itemType ? ` (type: ${itemType})` : ''}.`,
          );
        }

        return textResult(
          [`# Items in ${label}${itemType ? ` [${itemType}]` : ''}`, url, '', ...lines].join('\n'),
        );
      } catch (e: unknown) {
        return errorResult(`Could not list items. ${(e as Error).message}`);
      }
    },
  );
}
