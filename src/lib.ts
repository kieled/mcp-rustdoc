import axios from 'axios';
import { load, type CheerioAPI } from 'cheerio';
import { convert as htmlToText } from 'html-to-text';
import { cacheGet, cacheSet } from './cache.js';

// ─── Constants ───────────────────────────────────────────

export const DOCS_BASE = 'https://docs.rs';
export const CRATES_IO = 'https://crates.io/api/v1';
export const USER_AGENT = 'mcp-rust-docs/3.0.0';
export const MAX_DOC_LENGTH = 6000;
export const MAX_SEARCH_RESULTS = 100;

/** Maps section heading IDs to singular item types. */
export const SECTION_TO_TYPE: Record<string, string> = {
  modules: 'mod', structs: 'struct', enums: 'enum',
  traits: 'trait', functions: 'fn', macros: 'macro',
  types: 'type', constants: 'constant', statics: 'static',
  unions: 'union', attributes: 'attr', derives: 'derive',
  reexports: 'reexport',
};

/** Maps item types to rustdoc file-name prefixes. */
export const TYPE_FILE_PREFIX: Record<string, string> = {
  struct: 'struct.', enum: 'enum.', trait: 'trait.',
  fn: 'fn.', macro: 'macro.', type: 'type.',
  constant: 'constant.', static: 'static.',
  union: 'union.', attr: 'attr.', derive: 'derive.',
};

// ─── Standard library crates ─────────────────────────────

export const STD_CRATES = new Set(['std', 'core', 'alloc']);

export function isStdCrate(name: string): boolean {
  return STD_CRATES.has(name);
}

function stdDocsUrl(crate: string, path: string): string {
  return `https://doc.rust-lang.org/stable/${crate}/${path}`;
}

// ─── URL helpers ─────────────────────────────────────────

export function crateSlug(name: string): string {
  return name.replace(/-/g, '_');
}

export function docsUrl(crate: string, path = 'index.html', version = 'latest'): string {
  if (isStdCrate(crate)) return stdDocsUrl(crate, path);
  return `${DOCS_BASE}/${crate}/${version}/${crateSlug(crate)}/${path}`;
}

export function modToUrlPrefix(modulePath?: string): string {
  return modulePath ? modulePath.replace(/\./g, '/') + '/' : '';
}

export function modToRustPrefix(modulePath?: string): string {
  return modulePath ? modulePath.replace(/\./g, '::') + '::' : '';
}

// ─── HTTP / DOM helpers ──────────────────────────────────

export async function fetchDom(url: string): Promise<CheerioAPI> {
  const cached = cacheGet<string>(`dom:${url}`);
  if (cached) {
    console.log(`[cache hit] ${url}`);
    return load(cached);
  }
  const { data } = await axios.get<string>(url, { timeout: 15_000 });
  cacheSet(`dom:${url}`, data);
  return load(data);
}

export function cleanHtml(html: string): string {
  return htmlToText(html, {
    wordwrap: 120,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  }).trim();
}

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '\n\n[…truncated]' : text;
}

// ─── MCP result helpers ──────────────────────────────────

export function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

export function errorResult(msg: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
}

// ─── Crates.io API types ─────────────────────────────────

export interface CrateInfo {
  name: string;
  version: string;
  description: string;
  documentation: string | null;
  repository: string | null;
  downloads: number;
}

export interface CrateVersionInfo {
  num: string;
  features: Record<string, string[]>;
  defaultFeatures: string[];
  yanked: boolean;
  license: string;
}

export interface CrateDep {
  name: string;
  req: string;
  optional: boolean;
  kind: string;
  features: string[];
}

// ─── Crates.io API helpers ───────────────────────────────

const cratesIoHeaders = { 'User-Agent': USER_AGENT };

export async function fetchCrateInfo(name: string): Promise<CrateInfo> {
  const cacheKey = `crate-info:${name}`;
  const cached = cacheGet<CrateInfo>(cacheKey);
  if (cached) { console.log(`[cache hit] crate-info ${name}`); return cached; }

  const { data } = await axios.get(`${CRATES_IO}/crates/${name}`, {
    headers: cratesIoHeaders,
    timeout: 10_000,
  });
  const c = data.crate;
  const info: CrateInfo = {
    name: c.name,
    version: c.max_stable_version || c.max_version,
    description: c.description,
    documentation: c.documentation,
    repository: c.repository,
    downloads: c.downloads,
  };
  cacheSet(cacheKey, info);
  return info;
}

export async function fetchCrateVersionInfo(name: string, version: string): Promise<CrateVersionInfo> {
  const cacheKey = `crate-version:${name}@${version}`;
  const cached = cacheGet<CrateVersionInfo>(cacheKey);
  if (cached) { console.log(`[cache hit] crate-version ${name}@${version}`); return cached; }

  const { data } = await axios.get(`${CRATES_IO}/crates/${name}/${version}`, {
    headers: cratesIoHeaders,
    timeout: 10_000,
  });
  const v = data.version;
  const features: Record<string, string[]> = v.features ?? {};
  const info: CrateVersionInfo = {
    num: v.num,
    features,
    defaultFeatures: features['default'] ?? [],
    yanked: v.yanked,
    license: v.license,
  };
  cacheSet(cacheKey, info);
  return info;
}

export async function fetchCrateDeps(name: string, version: string): Promise<CrateDep[]> {
  const cacheKey = `crate-deps:${name}@${version}`;
  const cached = cacheGet<CrateDep[]>(cacheKey);
  if (cached) { console.log(`[cache hit] crate-deps ${name}@${version}`); return cached; }

  const { data } = await axios.get(`${CRATES_IO}/crates/${name}/${version}/dependencies`, {
    headers: cratesIoHeaders,
    timeout: 10_000,
  });
  const deps: CrateDep[] = (data.dependencies ?? []).map((d: Record<string, unknown>) => ({
    name: d.crate_id as string,
    req: d.req as string,
    optional: d.optional as boolean,
    kind: d.kind as string,
    features: (d.features as string[]) ?? [],
  }));
  cacheSet(cacheKey, deps);
  return deps;
}

// ─── DOM extraction helpers ──────────────────────────────

/** Extract the feature gate tag from the item-level portability span. */
export function extractItemFeatureGate($: CheerioAPI): string | null {
  const gate = $('.item-info .stab.portability').first().text().trim();
  return gate || null;
}

/** Extract feature gate from a dt element in an item table. */
export function extractDtFeatureGate($dt: ReturnType<CheerioAPI>, $: CheerioAPI): string | null {
  const code = $dt.find('.stab.portability code').first().text().trim();
  return code || null;
}

/** Extract code examples from a page. */
export function extractExamples($: CheerioAPI): string[] {
  const examples: string[] = [];
  $('div.example-wrap pre.rust').each((_, el) => {
    const code = $(el).text().trim();
    if (code) examples.push(code);
  });
  return examples;
}

/** Extract trait implementation headers from a detail page. */
export function extractTraitImpls($: CheerioAPI): string[] {
  const impls: string[] = [];
  $('#trait-implementations-list > details > summary h3.code-header').each((_, el) => {
    impls.push($(el).text().trim());
  });
  return impls;
}

/** Extract re-exports from a module/crate index page. */
export function extractReExports($: CheerioAPI): string[] {
  const reexports: string[] = [];
  $('h2#reexports').next('dl.item-table').find('dt code').each((_, el) => {
    reexports.push($(el).text().trim());
  });
  return reexports;
}
