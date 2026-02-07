import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  docsUrl, fetchDom, cleanHtml, truncate,
  modToUrlPrefix, modToRustPrefix,
  textResult, errorResult,
  extractItemFeatureGate, extractTraitImpls, extractExamples,
  TYPE_FILE_PREFIX, MAX_DOC_LENGTH,
} from '../lib.js';
import { itemTypeEnum, versionParam } from './shared.js';

export function register(server: McpServer) {
  server.tool(
    'lookup_crate_item',
    'Get detailed documentation for a specific item. Returns signature, docs, feature gate, methods, trait impls, and optionally examples.',
    {
      crateName: z.string().describe('Crate name'),
      itemType: itemTypeEnum.describe('Item type'),
      itemName: z.string().describe('Item name (e.g. "Mutex", "spawn", "Serialize")'),
      modulePath: z
        .string()
        .optional()
        .describe('Dot-separated module path (e.g. "sync"). Omit if at crate root.'),
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
    // @ts-expect-error — MCP SDK deep type instantiation with Zod schemas
    async ({ crateName, itemType, itemName, modulePath, version, includeExamples, includeImpls }: {
      crateName: string; itemType: string; itemName: string;
      modulePath?: string; version?: string;
      includeExamples?: boolean; includeImpls?: boolean;
    }) => {
      try {
        const ver = version ?? 'latest';
        const prefix = modToUrlPrefix(modulePath);
        const page =
          itemType === 'mod'
            ? `${prefix}${itemName}/index.html`
            : `${prefix}${TYPE_FILE_PREFIX[itemType] ?? `${itemType}.`}${itemName}.html`;

        const url = docsUrl(crateName, page, ver);
        const $ = await fetchDom(url);

        const fullName = `${crateName}::${modToRustPrefix(modulePath)}${itemName}`;

        // Signature
        const decl = $('pre.rust.item-decl').text().trim();

        // Feature gate
        const featureGate = extractItemFeatureGate($);

        // Doc comment
        const doc = truncate(
          cleanHtml($('details.toggle.top-doc').html() ?? ''),
          MAX_DOC_LENGTH,
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
          parts.push(`## Methods (${methods.length})`, ...methods.map((m) => `  ${m}`), '');

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
          `Could not fetch ${itemType} "${itemName}". ${(e as Error).message}`,
        );
      }
    },
  );
}
