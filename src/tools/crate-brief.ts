import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  docsUrl, fetchDom, fetchCrateInfo, fetchCrateVersionInfo,
  cleanHtml, truncate, modToUrlPrefix, extractReExports,
  textResult, errorResult, SECTION_TO_TYPE, isStdCrate,
  type CrateInfo, type CrateVersionInfo,
} from '../lib.js';
import { versionParam } from './shared.js';

export function register(server: McpServer) {
  server.tool(
    'get_crate_brief',
    'Bundle call: fetches crate metadata, overview docs, module list, re-exports, and optionally items from focused modules — all in one shot.',
    {
      crateName: z.string().describe('Crate name'),
      version: versionParam,
      focusModules: z
        .string()
        .optional()
        .describe('Comma-separated module names to expand (e.g. "sync,task,io"). Omit for overview only.'),
    },
    { readOnlyHint: true },
    async ({ crateName, version, focusModules }: {
      crateName: string; version?: string; focusModules?: string;
    }) => {
      try {
        const isStd = isStdCrate(crateName);

        // 1. Metadata from crates.io (skip for std crates)
        let info: CrateInfo | null = null;
        let versionInfo: CrateVersionInfo | null = null;

        if (!isStd) {
          const crateInfo = await fetchCrateInfo(crateName);
          const ver = version ?? crateInfo.version;
          versionInfo = await fetchCrateVersionInfo(crateName, ver);
          info = crateInfo;
        }

        const ver = isStd ? 'latest' : (version ?? info!.version);

        // 2. Docs from rustdoc (docs.rs or doc.rust-lang.org)
        const rootUrl = docsUrl(crateName, 'index.html', ver);
        const $ = await fetchDom(rootUrl);

        const doc = truncate(cleanHtml($('details.toggle.top-doc').html() ?? ''), 3000);
        const reexports = extractReExports($);

        // Collect all items by section
        const itemsBySection: Record<string, string[]> = {};
        $('h2.section-header').each((_, h2) => {
          const sectionId = $(h2).attr('id') ?? '';
          const type = SECTION_TO_TYPE[sectionId] ?? sectionId;
          const items: string[] = [];
          $(h2).next('dl.item-table').find('dt').each((_, dt) => {
            const $dt = $(dt);
            const name = $dt.find('a').first().text().trim();
            const gate = $dt.find('.stab.portability code').first().text().trim();
            if (name) {
              items.push(gate ? `${name} [${gate}]` : name);
            }
          });
          if (items.length) itemsBySection[type] = items;
        });

        // ── Assemble output ──

        const parts: string[] = [];

        if (isStd) {
          const pageVersion = $('.sidebar-crate .version').text().trim() || 'stable';
          parts.push(
            `# ${crateName} (Rust standard library) v${pageVersion}`,
            rootUrl,
            '',
            `The "${crateName}" crate is part of the Rust standard library.`,
          );
        } else {
          parts.push(
            `# ${info!.name} v${versionInfo!.num}`,
            rootUrl,
            '',
            info!.description,
            '',
            `license: ${versionInfo!.license} | downloads: ${info!.downloads.toLocaleString()}`,
          );

          if (info!.repository) parts.push(`repo: ${info!.repository}`);

          // Features summary
          const { defaultFeatures, features } = versionInfo!;
          parts.push(
            '',
            '## Features',
            `  default = [${defaultFeatures.join(', ')}]`,
            `  all: ${Object.keys(features).filter((f) => f !== 'default').sort().join(', ')}`,
          );
        }

        // Overview
        if (doc) parts.push('', '## Overview', doc);

        // Re-exports
        if (reexports.length) {
          parts.push('', '## Re-exports', ...reexports.map((r) => `  ${r}`));
        }

        // Modules list (always shown)
        if (itemsBySection['mod']) {
          parts.push('', '## Modules', ...itemsBySection['mod'].map((m) => `  ${m}`));
        }

        // Other top-level items (compact)
        for (const [type, items] of Object.entries(itemsBySection)) {
          if (type === 'mod' || type === 'reexport') continue;
          parts.push('', `## ${type} (${items.length})`, ...items.map((i) => `  ${i}`));
        }

        // 3. Focused modules
        if (focusModules) {
          const modules = focusModules.split(',').map((m) => m.trim()).filter(Boolean);

          for (const mod of modules) {
            try {
              const modUrl = docsUrl(crateName, `${modToUrlPrefix(mod)}index.html`, ver);
              const $mod = await fetchDom(modUrl);

              parts.push('', `## Focus: ${crateName}::${mod.replace(/\./g, '::')}`, modUrl);

              $mod('h2.section-header').each((_, h2) => {
                const sectionId = $mod(h2).attr('id') ?? '';
                const type = SECTION_TO_TYPE[sectionId] ?? sectionId;

                $mod(h2).next('dl.item-table').find('dt').each((_, dt) => {
                  const $dt = $mod(dt);
                  const name = $dt.find('a').first().text().trim();
                  const desc = $dt.next('dd').text().trim();
                  const gate = $dt.find('.stab.portability code').first().text().trim();
                  if (!name) return;
                  const tag = gate ? ` [${gate}]` : '';
                  parts.push(`  [${type}] ${name}${tag} — ${desc}`);
                });
              });
            } catch {
              parts.push('', `## Focus: ${mod}`, `  (module not found)`);
            }
          }
        }

        return textResult(parts.join('\n'));
      } catch (e: unknown) {
        return errorResult(
          `Could not fetch brief for "${crateName}". ${(e as Error).message}\n` +
          `Tip: check the crate name with search_crates({ query: "${crateName}" }).`,
        );
      }
    },
  );
}
