# mcp-rustdoc

An MCP server that gives AI assistants deep access to the Rust ecosystem. It scrapes docs.rs (and `doc.rust-lang.org` for `std`/`core`/`alloc`) with surgical DOM extraction (cheerio) and queries the crates.io API, exposing twelve tools that cover everything from high-level crate overviews to individual method signatures, feature gates, trait impls, code examples, changelogs, and source code.

Zero external HTTP dependencies — uses native `fetch` (Node.js >= 20). Responses are cached with LRU eviction (500 entries, 5-minute TTL, stale-while-revalidate) and all HTTP calls retry on transient failures.

## Tools

| Tool | What it returns |
|---|---|
| `get_crate_metadata` | Version, features, deps, MSRV, links (crates.io API) |
| `get_crate_brief` | One-shot bundle: metadata + overview + re-exports + module list + focused module items |
| `lookup_crate_docs` | Crate overview documentation, version, sections, re-exports |
| `get_crate_items` | Items in a module with types, feature gates, and descriptions. Filterable by type and feature. |
| `lookup_crate_item` | Item detail: signature, docs, methods, variants, trait impls, examples. Auto-discovers module path. |
| `search_crate` | Ranked symbol search (exact > prefix > substring) with canonical paths |
| `search_crates` | Search crates.io by keyword — returns name, description, downloads, version |
| `get_crate_versions` | All published versions with dates and yanked status (crates.io API) |
| `get_source_code` | Raw source code of a file from docs.rs or doc.rust-lang.org |
| `batch_lookup` | Look up multiple items in one call (up to 20) — saves round-trips |
| `get_crate_changelog` | Recent GitHub releases for a crate |
| `resolve_type` | Resolve a full Rust type path (e.g. `tokio::sync::Mutex`) to its documentation |

Every tool accepts an optional `version` parameter to pin a specific crate version instead of `latest`.

### Standard library support

All documentation tools work with `std`, `core`, and `alloc` — the Rust standard library crates hosted at `doc.rust-lang.org`. Use them exactly like any other crate:

```
> lookup_crate_docs({ crateName: "std" })
> get_crate_items({ crateName: "std", modulePath: "collections" })
> search_crate({ crateName: "core", query: "Option" })
```

`get_crate_metadata` returns a helpful message for std crates since they aren't published on crates.io.

## Install

No clone needed. Just configure your AI coding assistant with `npx`:

```
npx -y mcp-rustdoc
```

### Claude Code

```bash
claude mcp add mcp-rustdoc -- npx -y mcp-rustdoc
```

Or add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "mcp-rustdoc": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-rustdoc"]
    }
  }
}
```

### Gemini CLI

Add to `~/.gemini/settings.json` (global) or `.gemini/settings.json` (project):

```json
{
  "mcpServers": {
    "mcp-rustdoc": {
      "command": "npx",
      "args": ["-y", "mcp-rustdoc"]
    }
  }
}
```

### OpenAI Codex CLI

```bash
codex mcp add mcp-rustdoc -- npx -y mcp-rustdoc
```

Or add to `~/.codex/config.toml`:

```toml
[mcp_servers.mcp-rustdoc]
command = "npx"
args = ["-y", "mcp-rustdoc"]
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-rustdoc": {
      "command": "npx",
      "args": ["-y", "mcp-rustdoc"]
    }
  }
}
```

### MCP Inspector (testing)

```bash
npx @modelcontextprotocol/inspector -- npx -y mcp-rustdoc
```

---

## Development

```bash
git clone https://github.com/kieled/mcp-rustdoc.git
cd mcp-rustdoc
npm install
```

### Run with bun (no build step)

```bash
bun run dev
```

### Build with Vite and run with Node.js

```bash
npm run build     # vite build → dist/index.js (single bundled ESM file)
node dist/index.js
```

### Build with tsc

```bash
npm run build:tsc  # tsc → dist/ (one .js per source file)
node dist/index.js
```

### Type check only

```bash
npm run typecheck  # tsc --noEmit
```

### Publish

```bash
npm publish        # runs vite build via prepublishOnly, then publishes
```

---

## Tool reference

### `get_crate_metadata`

Fetches structured metadata from the crates.io API.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |
| `version` | string | no | Pinned version |

Returns: version, description, links (docs/repo/crates.io), license, download count, MSRV, full feature list with activations, optional deps (feature-gated), required deps.

---

### `get_crate_brief`

Single call to bootstrap context for a crate. Combines metadata, overview docs, re-exports, module list, and optionally expands focused modules.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |
| `version` | string | no | Pinned version |
| `focusModules` | string | no | Comma-separated modules to expand (e.g. `"sync,task"`) |

---

### `lookup_crate_docs`

Fetches the main documentation page for a crate.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |
| `version` | string | no | Pinned version |

Returns: crate version, overview documentation text, re-exports, and section list with item counts.

---

### `get_crate_items`

Lists all public items in a crate root or specific module. Supports filtering by item type and feature gate.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |
| `modulePath` | string | no | Dot-separated path (e.g. `"sync"`, `"io.util"`) |
| `itemType` | enum | no | Filter: `mod` `struct` `enum` `trait` `fn` `macro` `type` `constant` `static` `union` `attr` `derive` |
| `feature` | string | no | Filter to items behind this feature gate (e.g. `"sync"`, `"fs"`) |
| `version` | string | no | Pinned version |

---

### `lookup_crate_item`

Retrieves full documentation for a single item. Auto-discovers the module path if omitted by searching `all.html`. Falls back to fuzzy suggestions if the exact item is not found.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |
| `itemType` | enum | yes | Item type (see `get_crate_items`) |
| `itemName` | string | yes | Item name (e.g. `"Mutex"`, `"spawn"`) |
| `modulePath` | string | no | Dot-separated module path. Auto-discovered if omitted. |
| `version` | string | no | Pinned version |
| `includeImpls` | boolean | no | Include trait implementation list |
| `includeExamples` | boolean | no | Include code examples |

---

### `search_crate`

Searches all items in a crate by name. Results are ranked: exact match on the bare item name scores highest, then prefix matches, then substring matches.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |
| `query` | string | yes | Search query (case-insensitive) |
| `version` | string | no | Pinned version |

---

### `search_crates`

Search for Rust crates on crates.io by keyword.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Search keywords |
| `page` | number | no | Page number (default 1) |
| `perPage` | number | no | Results per page (default 10, max 50) |

---

### `get_crate_versions`

List all published versions of a crate from crates.io.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |

---

### `get_source_code`

Fetch the raw source code of a file from docs.rs (or doc.rust-lang.org for std crates).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |
| `path` | string | yes | Source path relative to crate root (e.g. `"src/lib.rs"`, `"src/sync/mutex.rs"`) |
| `version` | string | no | Pinned version |

---

### `batch_lookup`

Look up multiple items in a single call. Returns a compact summary (signature + short doc) for each item. Saves round-trips when you need several items at once.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |
| `items` | array | yes | Items to look up (max 20). Each: `{ itemType, itemName, modulePath? }` |
| `version` | string | no | Pinned version |

---

### `get_crate_changelog`

Fetch recent GitHub releases for a crate. Requires the crate to have a GitHub repository link on crates.io.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |
| `count` | number | no | Number of releases (default 5, max 20) |

---

### `resolve_type`

Resolve a full Rust type path to its documentation. Parses the path to determine the crate, module, and item name automatically.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `typePath` | string | yes | Full Rust type path (e.g. `"tokio::sync::Mutex"`, `"std::collections::HashMap"`) |
| `version` | string | no | Pinned version |

---

## Recommended workflows

### Exploring a new crate

1. `get_crate_brief` with `focusModules` targeting the modules you care about
2. `search_crate` to find specific types or functions
3. `lookup_crate_item` for detailed signatures and docs (no need to specify `modulePath` — it auto-discovers)

### Understanding feature flags

1. `get_crate_metadata` to see all features, their activations, and MSRV
2. `get_crate_items` with the `feature` parameter to see items behind a specific feature gate

### Finding the right type

1. `search_crate` with a keyword
2. `lookup_crate_item` with `includeImpls: true` to see what traits it implements
3. `resolve_type` to chase cross-crate type paths (e.g. `tokio::sync::Mutex`)

### Bulk lookups

1. `batch_lookup` to fetch signatures and docs for multiple items in one call
2. `get_crate_changelog` to see what changed in recent releases

---

## Architecture

```
src/
  index.ts              Entry point — registers 12 tools + prompt, starts stdio server
  lib.ts                HTTP (native fetch), URL builders, DOM helpers, crates.io API, extractors
  cache.ts              LRU cache (500 entries, 5-min TTL, stale-while-revalidate)
  tools/
    shared.ts           Shared Zod schemas (itemTypeEnum, versionParam)
    lookup-docs.ts      lookup_crate_docs
    get-items.ts        get_crate_items
    lookup-item.ts      lookup_crate_item
    search.ts           search_crate
    search-crates.ts    search_crates
    crate-versions.ts   get_crate_versions
    source-code.ts      get_source_code
    crate-metadata.ts   get_crate_metadata
    crate-brief.ts      get_crate_brief
    batch-lookup.ts     batch_lookup
    crate-changelog.ts  get_crate_changelog
    resolve-type.ts     resolve_type
```

### Data sources

- **docs.rs** — HTML pages parsed with cheerio for surgical DOM extraction (only the elements needed, not full-page conversion)
- **doc.rust-lang.org** — Same rustdoc HTML format, used for `std`, `core`, and `alloc`
- **crates.io API** — JSON endpoints for metadata, features, dependencies, and search
- **GitHub API** — Release notes for changelogs (via repository link from crates.io)

### Design decisions

- **Native fetch, zero HTTP deps** — Uses Node.js built-in `fetch` with `AbortController` timeouts. No axios, no node-fetch.
- **cheerio for DOM extraction** — Extracts only specific DOM elements (`.item-decl`, `.top-doc`, `.code-header`, `.stab.portability`) to minimize token usage. Also powers `cleanHtml()` as a replacement for `html-to-text`.
- **LRU cache with stale-while-revalidate** — 500-entry cap with LRU eviction. Stale entries (past 5-min TTL but within 15-min grace) are served immediately while a background refresh runs.
- **Retry with backoff** — Transient 5xx errors are retried up to 2 times with exponential backoff.
- **Ranked search** — `all.html` contains every public item; scoring by exact/prefix/substring gives better results than flat substring matching.
- **Auto-discovery** — `lookup_crate_item` searches `all.html` to find the module path when not provided, and falls back to fuzzy suggestions when an exact match fails.
- **Version parameter everywhere** — Agents working on projects with pinned dependencies can read docs for specific versions.
- **Optional sections** — `includeImpls` and `includeExamples` default to off so the base response stays compact; agents opt in when they need more detail.

## License

MIT
