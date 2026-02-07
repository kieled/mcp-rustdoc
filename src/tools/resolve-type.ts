import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  docsUrl, fetchDom, cleanHtml, truncate,
  searchAllItems, extractItemFeatureGate,
  textResult, errorResult,
  TYPE_FILE_PREFIX, isStdCrate,
} from '../lib.js';
import { versionParam } from './shared.js';

export function register(server: McpServer) {
  server.tool(
    'resolve_type',
    'Resolve a Rust type path (e.g. "tokio::sync::Mutex" or "std::collections::HashMap") to its documentation. Parses the path to determine the crate, module, and item name automatically.',
    {
      typePath: z.string().describe('Full Rust type path (e.g. "tokio::sync::Mutex", "std::collections::HashMap")'),
      version: versionParam,
    },
    async ({ typePath, version }: { typePath: string; version?: string }) => {
      try {
        // Parse the type path: crate::module::path::ItemName
        const segments = typePath.split('::').filter(Boolean);
        if (segments.length < 2) {
          return errorResult(
            `Type path "${typePath}" must have at least a crate and item name (e.g. "serde::Serialize").`,
          );
        }

        const crateName = segments[0];
        const itemName = segments[segments.length - 1];
        const ver = version ?? 'latest';

        // Search all.html to find the item and its type
        const hits = await searchAllItems(crateName, itemName, ver);
        const exactMatch = hits.find((h) => {
          const fullPath = h.name.replace(/::/g, '::');
          const expectedPath = segments.slice(1).join('::');
          return fullPath === expectedPath && h.bareName === itemName;
        }) ?? hits.find((h) => h.bareName === itemName);

        if (!exactMatch) {
          // Return search results as suggestions
          const suggestions = hits.slice(0, 10).map((h) =>
            `  [${h.type}] ${crateName}::${h.name}`,
          );
          const parts = [`Could not resolve "${typePath}".`];
          if (suggestions.length) {
            parts.push('', 'Similar items found:', ...suggestions);
          }
          return textResult(parts.join('\n'));
        }

        // Build the URL and fetch
        const modulePath = exactMatch.modulePath
          ? exactMatch.modulePath.replace(/\./g, '/') + '/'
          : '';
        const prefix = TYPE_FILE_PREFIX[exactMatch.type] ?? `${exactMatch.type}.`;
        const page =
          exactMatch.type === 'mod'
            ? `${modulePath}${itemName}/index.html`
            : `${modulePath}${prefix}${itemName}.html`;

        const url = docsUrl(crateName, page, ver);
        const $ = await fetchDom(url);

        const decl = $('pre.rust.item-decl').text().trim();
        const featureGate = extractItemFeatureGate($);
        const doc = truncate(
          cleanHtml($('details.toggle.top-doc').html() ?? ''),
          2000,
        );

        const fullName = `${crateName}::${exactMatch.name}`;
        const parts: string[] = [`# ${exactMatch.type} ${fullName}`, url, ''];
        if (featureGate) parts.push(`> ${featureGate}`, '');
        if (decl) parts.push('```rust', decl, '```', '');
        if (doc) parts.push(doc);

        return textResult(parts.join('\n'));
      } catch (e: unknown) {
        return errorResult(`Could not resolve "${typePath}". ${(e as Error).message}`);
      }
    },
  );
}
