import { load, type CheerioAPI } from 'cheerio';
import { cacheGet, cacheSet, cacheIsStale } from './cache.js';

// ─── Constants ───────────────────────────────────────────

export const DOCS_BASE = 'https://docs.rs';
export const CRATES_IO = 'https://crates.io/api/v1';
export const USER_AGENT = 'mcp-rust-docs/5.0.0';
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

// ─── HTTP helpers ────────────────────────────────────────

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  baseDelay = 500,
): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      if (i === retries) throw e;
      const isRetryable = e instanceof HttpError && e.status >= 500;
      if (!isRetryable) throw e;
      console.log(`[retry ${i + 1}/${retries}] ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, baseDelay * (i + 1)));
    }
  }
  throw new Error('unreachable');
}

export async function fetchText(url: string, timeout = 15_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T = unknown>(url: string, timeout = 10_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ─── DOM helpers ─────────────────────────────────────────

export async function fetchDom(url: string): Promise<CheerioAPI> {
  const cacheKey = `dom:${url}`;
  const cached = cacheGet<string>(cacheKey);
  if (cached) {
    console.log(`[cache hit] ${url}`);
    if (cacheIsStale(cacheKey)) {
      console.log(`[stale refresh] ${url}`);
      fetchWithRetry(() => fetchText(url))
        .then((html) => cacheSet(cacheKey, html))
        .catch(() => {});
    }
    return load(cached);
  }
  const html = await fetchWithRetry(() => fetchText(url));
  cacheSet(cacheKey, html);
  return load(html);
}

export function cleanHtml(html: string): string {
  const $ = load(`<body>${html}</body>`);
  $('img').remove();
  $('summary.hideme').remove();

  // Preserve code blocks as markdown fenced blocks
  $('div.example-wrap').each((_, wrap) => {
    const code = $(wrap).find('pre').text().trim();
    if (code) $(wrap).replaceWith(`\n\`\`\`rust\n${code}\n\`\`\`\n`);
  });
  $('pre.rust').each((_, el) => {
    const code = $(el).text().trim();
    if (code) $(el).replaceWith(`\n\`\`\`rust\n${code}\n\`\`\`\n`);
  });
  $('pre').each((_, el) => {
    const code = $(el).text().trim();
    if (code) $(el).replaceWith(`\n\`\`\`\n${code}\n\`\`\`\n`);
  });

  // Inline code as backticks
  $('code').each((_, el) => {
    const t = $(el).text();
    if (t && !t.includes('\n')) { $(el).replaceWith(`\`${t}\``); }
  });

  // Headings
  $('h1').each((_, el) => { $(el).replaceWith(`\n# ${$(el).text().trim()}\n`); });
  $('h2').each((_, el) => { $(el).replaceWith(`\n## ${$(el).text().trim()}\n`); });
  $('h3').each((_, el) => { $(el).replaceWith(`\n### ${$(el).text().trim()}\n`); });
  $('h4,h5,h6').each((_, el) => { $(el).replaceWith(`\n#### ${$(el).text().trim()}\n`); });

  // Block elements
  $('p, div, br, li, tr').each((_, el) => { $(el).before('\n'); });

  return $('body').text().replace(/\n{3,}/g, '\n\n').trim();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const sliced = text.slice(0, max);
  const fences = sliced.match(/```/g);
  const unclosed = fences && fences.length % 2 !== 0;
  return sliced + (unclosed ? '\n```' : '') + '\n\n[…truncated]';
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
  msrv: string | null;
}

export interface CrateDep {
  name: string;
  req: string;
  optional: boolean;
  kind: string;
  features: string[];
}

// ─── Crates.io API helpers ───────────────────────────────

interface CratesIoCrateResponse {
  crate: Record<string, unknown>;
}

interface CratesIoVersionResponse {
  version: Record<string, unknown>;
}

interface CratesIoDepsResponse {
  dependencies: Record<string, unknown>[];
}

export async function fetchCrateInfo(name: string): Promise<CrateInfo> {
  const cacheKey = `crate-info:${name}`;
  const cached = cacheGet<CrateInfo>(cacheKey);
  if (cached) { console.log(`[cache hit] crate-info ${name}`); return cached; }

  const data = await fetchWithRetry(() =>
    fetchJson<CratesIoCrateResponse>(`${CRATES_IO}/crates/${name}`),
  );
  const c = data.crate;
  const info: CrateInfo = {
    name: c.name as string,
    version: (c.max_stable_version || c.max_version) as string,
    description: c.description as string,
    documentation: (c.documentation as string) ?? null,
    repository: (c.repository as string) ?? null,
    downloads: c.downloads as number,
  };
  cacheSet(cacheKey, info);
  return info;
}

export async function fetchCrateVersionInfo(name: string, version: string): Promise<CrateVersionInfo> {
  const cacheKey = `crate-version:${name}@${version}`;
  const cached = cacheGet<CrateVersionInfo>(cacheKey);
  if (cached) { console.log(`[cache hit] crate-version ${name}@${version}`); return cached; }

  const data = await fetchWithRetry(() =>
    fetchJson<CratesIoVersionResponse>(`${CRATES_IO}/crates/${name}/${version}`),
  );
  const v = data.version;
  const features = (v.features as Record<string, string[]>) ?? {};
  const info: CrateVersionInfo = {
    num: v.num as string,
    features,
    defaultFeatures: features['default'] ?? [],
    yanked: v.yanked as boolean,
    license: v.license as string,
    msrv: (v.rust_version as string) ?? null,
  };
  cacheSet(cacheKey, info);
  return info;
}

export async function fetchCrateDeps(name: string, version: string): Promise<CrateDep[]> {
  const cacheKey = `crate-deps:${name}@${version}`;
  const cached = cacheGet<CrateDep[]>(cacheKey);
  if (cached) { console.log(`[cache hit] crate-deps ${name}@${version}`); return cached; }

  const data = await fetchWithRetry(() =>
    fetchJson<CratesIoDepsResponse>(`${CRATES_IO}/crates/${name}/${version}/dependencies`),
  );
  const deps: CrateDep[] = (data.dependencies ?? []).map((d) => ({
    name: d.crate_id as string,
    req: d.req as string,
    optional: d.optional as boolean,
    kind: d.kind as string,
    features: (d.features as string[]) ?? [],
  }));
  cacheSet(cacheKey, deps);
  return deps;
}

// ─── Item discovery helpers ─────────────────────────────

export interface ItemLocation {
  type: string;
  name: string;
  path: string;
  modulePath: string;
  bareName: string;
}

export async function searchAllItems(
  crateName: string,
  query: string,
  version = 'latest',
): Promise<ItemLocation[]> {
  const url = docsUrl(crateName, 'all.html', version);
  const $ = await fetchDom(url);
  const q = query.toLowerCase();
  const results: (ItemLocation & { score: number })[] = [];

  $('h3').each((_, h3) => {
    const rawId = $(h3).attr('id') ?? '';
    const type = SECTION_TO_TYPE[rawId] ?? rawId;

    $(h3).next('ul.all-items').find('li a').each((_, a) => {
      const name = $(a).text().trim();
      const lower = name.toLowerCase();
      const bareName = name.includes('::') ? name.split('::').pop()! : name;
      const bareNameLower = bareName.toLowerCase();

      let score = 0;
      if (bareNameLower === q) score = 100;
      else if (lower === q) score = 95;
      else if (bareNameLower.startsWith(q)) score = 60;
      else if (lower.startsWith(q)) score = 55;
      else if (lower.includes(q)) score = 20;

      if (score > 0) {
        const parts = name.split('::');
        const modulePath = parts.length > 1 ? parts.slice(0, -1).join('.') : '';
        results.push({ type, name, path: name, modulePath, bareName, score });
      }
    });
  });

  results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return results;
}

// ─── DOM extraction helpers ──────────────────────────────

export function extractItemFeatureGate($: CheerioAPI): string | null {
  const gate = $('.item-info .stab.portability').first().text().trim();
  return gate || null;
}

export function extractDtFeatureGate($dt: ReturnType<CheerioAPI>, $: CheerioAPI): string | null {
  const code = $dt.find('.stab.portability code').first().text().trim();
  return code || null;
}

export function extractExamples($: CheerioAPI): string[] {
  const examples: string[] = [];
  $('div.example-wrap pre.rust').each((_, el) => {
    const code = $(el).text().trim();
    if (code) examples.push(code);
  });
  return examples;
}

export function extractTraitImpls($: CheerioAPI): string[] {
  const impls: string[] = [];
  $('#trait-implementations-list > details > summary h3.code-header').each((_, el) => {
    impls.push($(el).text().trim());
  });
  return impls;
}

export function extractReExports($: CheerioAPI): string[] {
  const reexports: string[] = [];
  $('h2#reexports').next('dl.item-table').find('dt code').each((_, el) => {
    reexports.push($(el).text().trim());
  });
  return reexports;
}

// ─── Method extraction ──────────────────────────────────

export interface MethodInfo {
  name: string;
  signature: string;
  deprecated: boolean;
  featureGate: string | null;
  shortDoc: string;
}

export function extractMethods($: CheerioAPI): MethodInfo[] {
  const methods: MethodInfo[] = [];
  const seen = new Set<string>();

  $('section[id^="method."], section[id^="tymethod."]').each((_, el) => {
    const $el = $(el);
    const id = $el.attr('id') ?? '';
    if (seen.has(id)) return;
    seen.add(id);

    const name = id.replace(/^(ty)?method\./, '');
    const signature = $el.find('h4.code-header').first().text().trim();
    const deprecated = $el.find('.stab.deprecated').length > 0
      || $el.parent('details').find('.stab.deprecated').length > 0;
    const featureGate = $el.find('.stab.portability code').first().text().trim() || null;
    const shortDoc = $el.parent('details').find('.docblock p').first().text().trim()
      || $el.next('.docblock').find('p').first().text().trim();

    if (name && signature) {
      methods.push({ name, signature, deprecated, featureGate, shortDoc });
    }
  });

  return methods;
}

// ─── Deprecation / stability extraction ─────────────────

export function extractDeprecation($: CheerioAPI): string | null {
  const dep = $('.item-info .stab.deprecated').first().text().trim();
  return dep || null;
}

export function extractStability($: CheerioAPI): string | null {
  const unstable = $('.item-info .stab.unstable').first().text().trim();
  return unstable || null;
}

// ─── Levenshtein distance ───────────────────────────────

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}
