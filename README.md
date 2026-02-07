# mcp-rustdoc

MCP server for browsing Rust crate documentation. Scrapes docs.rs, doc.rust-lang.org (`std`/`core`/`alloc`), and the crates.io API. Zero HTTP dependencies — native `fetch` only.

## Tools

| Tool | Description |
|---|---|
| `get_crate_metadata` | Version, features, deps, MSRV, links |
| `get_crate_brief` | Metadata + overview + modules + focused module items in one call |
| `lookup_crate_docs` | Crate overview, version, sections, re-exports |
| `get_crate_items` | Items in a module. Filter by type and feature gate. |
| `lookup_crate_item` | Full item docs: signature, methods, variants, impls, examples. Auto-discovers module path. |
| `search_crate` | Ranked symbol search within a crate |
| `search_crates` | Search crates.io by keyword |
| `get_crate_versions` | All published versions with dates and yanked status |
| `get_source_code` | Raw source code from docs.rs |
| `batch_lookup` | Multiple item lookups in one call (up to 20) |
| `get_crate_changelog` | GitHub releases for a crate |
| `resolve_type` | Resolve a type path like `tokio::sync::Mutex` to its docs |

All tools accept an optional `version` parameter.

## Install

```
npx -y mcp-rustdoc
```

### Claude Code

```bash
claude mcp add mcp-rustdoc -- npx -y mcp-rustdoc
```

### Gemini CLI

```json
{ "mcpServers": { "mcp-rustdoc": { "command": "npx", "args": ["-y", "mcp-rustdoc"] } } }
```

### OpenAI Codex CLI

```bash
codex mcp add mcp-rustdoc -- npx -y mcp-rustdoc
```

### Claude Desktop

```json
{ "mcpServers": { "mcp-rustdoc": { "command": "npx", "args": ["-y", "mcp-rustdoc"] } } }
```

## Parameters

Every tool takes `crateName` (string, required) and `version` (string, optional). Additional parameters:

| Tool | Extra parameters |
|---|---|
| `get_crate_brief` | `focusModules` — comma-separated modules to expand |
| `get_crate_items` | `modulePath`, `itemType`, `feature` |
| `lookup_crate_item` | `itemType` (required), `itemName` (required), `modulePath`, `includeImpls`, `includeExamples` |
| `search_crate` | `query` (required) |
| `search_crates` | `query` (required), `page`, `perPage` |
| `get_source_code` | `path` (required) |
| `batch_lookup` | `items` (required) — array of `{ itemType, itemName, modulePath? }`, max 20 |
| `get_crate_changelog` | `count` — number of releases (default 5) |
| `resolve_type` | `typePath` (required) — e.g. `"tokio::sync::Mutex"` |

## Development

```bash
git clone https://github.com/kieled/mcp-rustdoc.git
cd mcp-rustdoc && npm install
```

```bash
bun run dev          # run with bun (no build)
npm run build        # vite build → dist/index.js
npm run typecheck    # tsc --noEmit
npm publish          # build + publish
```

## Architecture

- **cheerio** — surgical DOM extraction from rustdoc HTML
- **Native fetch** — `AbortController` timeouts, retry with backoff on 5xx
- **LRU cache** — 500 entries, 5-min TTL, 15-min stale-while-revalidate
- **Ranked search** — exact > prefix > substring scoring on `all.html`
- **Auto-discovery** — `lookup_crate_item` finds module paths via `all.html`, fuzzy fallback on miss

## License

MIT
