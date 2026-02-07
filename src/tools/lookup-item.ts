import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  docsUrl, fetchDom, cleanHtml, truncate,
  modToUrlPrefix, modToRustPrefix,
  textResult, errorResult, searchAllItems,
  extractItemFeatureGate, extractTraitImpls, extractExamples,
  extractDeprecation, extractStability,
  TYPE_FILE_PREFIX, MAX_DOC_LENGTH,
} from '../lib.js';
import { itemTypeEnum, versionParam } from './shared.js';

export function register(server: McpServer) {
  server.tool(
    'lookup_crate_item',
    'Get detailed documentation for a specific item. Returns signature, docs, feature gate, methods, trait impls, and optionally examples. Auto-discovers modulePath if omitted.',
    {
      crateName: z.string().describe('Crate name'),
      itemType: itemTypeEnum.describe('Item type'),
      itemName: z.string().describe('Item name (e.g. "Mutex", "spawn", "Serialize")'),
      modulePath: z
        .string()
        .optional()
        .describe('Dot-separated module path (e.g. "sync"). Auto-discovered if omitted.'),
      version: versionParam,
      includeExamples: z
        .boolean()
        .optional()
        .describe('Include code examples from the docs. Default: false.'),
      includeImpls: z
        .boolean()
        .optional()
        .describe('Include trait implementation list. Default: false.'),
    },
    { readOnlyHint: true },
    async ({ crateName, itemType, itemName, modulePath, version, includeExamples, includeImpls }: {
      crateName: string; itemType: string; itemName: string;
      modulePath?: string; version?: string;
      includeExamples?: boolean; includeImpls?: boolean;
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

          if (match) {
            resolvedModulePath = match.modulePath || undefined;
            console.log(`[auto-discovery] ${itemName} → ${match.name} (${match.type})`);
          }
        }

        const prefix = modToUrlPrefix(resolvedModulePath);
        const page =
          itemType === 'mod'
            ? `${prefix}${itemName}/index.html`
            : `${prefix}${TYPE_FILE_PREFIX[itemType] ?? `${itemType}.`}${itemName}.html`;

        const url = docsUrl(crateName, page, ver);
        let $;
        try {
          $ = await fetchDom(url);
        } catch (fetchErr: unknown) {
          // Fuzzy fallback: if exact fetch fails, search for similar names
          const hits = await searchAllItems(crateName, itemName, ver);
          const fuzzy = hits.filter((h) =>
            h.bareName.toLowerCase().includes(itemName.toLowerCase()) ||
            itemName.toLowerCase().includes(h.bareName.toLowerCase()),
          );

          if (fuzzy.length) {
            const suggestions = fuzzy.slice(0, 10).map((h) =>
              `  [${h.type}] ${crateName}::${h.name}`,
            );
            return textResult([
              `Could not find ${itemType} "${itemName}" at the expected path.`,
              '',
              'Did you mean one of these?',
              ...suggestions,
              '',
              'Tip: use search_crate to find the exact name and module path.',
            ].join('\n'));
          }
          throw fetchErr;
        }

        const fullName = `${crateName}::${modToRustPrefix(resolvedModulePath)}${itemName}`;

        // Signature
        const decl = $('pre.rust.item-decl').text().trim();

        // Feature gate
        const featureGate = extractItemFeatureGate($);

        // Deprecation / stability
        const deprecation = extractDeprecation($);
        const stability = extractStability($);

        // Doc comment
        const docLimit = MAX_DOC_LENGTH;
        const doc = truncate(
          cleanHtml($('details.toggle.top-doc').html() ?? ''),
          docLimit,
        );

        // Inherent methods (structs, enums)
        const methods: string[] = [];
        $('#implementations-list section.method h4.code-header').each((_, el) => {
          methods.push($(el).text().trim());
        });

        // Required trait methods
        const required: string[] = [];
        $('h2#required-methods')
          .first()
          .nextUntil('h2')
          .find('section h4.code-header')
          .each((_, el) => {
            required.push($(el).text().trim());
          });

        // Provided trait methods
        const provided: string[] = [];
        $('h2#provided-methods')
          .first()
          .nextUntil('h2')
          .find('section h4.code-header')
          .each((_, el) => {
            provided.push($(el).text().trim());
          });

        // Enum variants
        const variants: string[] = [];
        $('section.variant h3.code-header, div.variant h3.code-header').each((_, el) => {
          variants.push($(el).text().trim());
        });

        // ── Assemble output ──
        const parts: string[] = [`# ${itemType} ${fullName}`, url, ''];

        if (deprecation) parts.push(`> DEPRECATED: ${deprecation}`, '');
        if (stability) parts.push(`> ${stability}`, '');
        if (featureGate) parts.push(`> ${featureGate}`, '');
        if (decl) parts.push('## Signature', '```rust', decl, '```', '');
        if (doc) parts.push('## Documentation', doc, '');
        if (variants.length)
          parts.push(`## Variants (${variants.length})`, ...variants.map((v) => `  ${v}`), '');
        if (required.length)
          parts.push(
            `## Required Methods (${required.length})`,
            ...required.map((m) => `  ${m}`),
            '',
          );
        if (provided.length)
          parts.push(
            `## Provided Methods (${provided.length})`,
            ...provided.map((m) => `  ${m}`),
            '',
          );
        if (methods.length)
          parts.push(
            `## Methods (${methods.length})`,
            ...methods.map((m) => `  ${m}`),
            '',
            'Tip: use list_methods for full method details including deprecation and docs.',
          );

        // Optional: trait implementations
        if (includeImpls) {
          const impls = extractTraitImpls($);
          if (impls.length) {
            parts.push(`## Trait Implementations (${impls.length})`, ...impls.map((i) => `  ${i}`), '');
          }
        }

        // Optional: code examples
        if (includeExamples) {
          const examples = extractExamples($);
          if (examples.length) {
            parts.push(`## Examples (${examples.length})`);
            examples.forEach((ex, i) => {
              parts.push(`### Example ${i + 1}`, '```rust', ex, '```', '');
            });
          }
        }

        return textResult(parts.join('\n'));
      } catch (e: unknown) {
        return errorResult(
          `Could not fetch ${itemType} "${itemName}". ${(e as Error).message}\n` +
          `Tip: verify the item with search_crate({ crateName: "${crateName}", query: "${itemName}" }).`,
        );
      }
    },
  );
}
