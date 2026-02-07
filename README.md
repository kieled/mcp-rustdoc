# mcp-rustdoc

An MCP server that gives AI assistants deep access to the Rust ecosystem. It scrapes docs.rs (and `doc.rust-lang.org` for `std`/`core`/`alloc`) with surgical DOM extraction (cheerio) and queries the crates.io API, exposing nine tools that cover everything from high-level crate overviews to individual method signatures, feature gates, trait impls, and code examples. Responses are cached in memory (5-minute TTL) to avoid redundant fetches.

## Tools

| Tool | What it returns |
|---|---|
| `get_crate_metadata` | Version, features, default features, optional/required deps, links (crates.io API) |
| `get_crate_brief` | One-shot bundle: metadata + overview + re-exports + module list + focused module items |
| `lookup_crate_docs` | Crate overview documentation, version, sections, re-exports |
| `get_crate_items` | Items in a module with types, feature gates, and descriptions |
| `lookup_crate_item` | Item detail: signature, docs, methods, variants, optionally trait impls + examples |
| `search_crate` | Ranked symbol search (exact > prefix > substring) with canonical paths |
| `search_crates` | Search crates.io by keyword — returns name, description, downloads, version |
| `get_crate_versions` | All published versions with dates and yanked status (crates.io API) |
| `get_source_code` | Raw source code of a file from docs.rs or doc.rust-lang.org |

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
bun install
```

### Run with bun (no build step)

```bash
bun run dev
```

### Build with Vite and run with Node.js

```bash
bun run build     # vite build → dist/index.js (single bundled ESM file)
node dist/index.js
```

### Build with tsc

```bash
bun run build:tsc  # tsc → dist/ (one .js per source file)
node dist/index.js
```

### Type check only

```bash
bun run typecheck  # tsc --noEmit
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

Returns: version, description, links (docs/repo/crates.io), license, download count, full feature list with activations, optional deps (feature-gated), required deps.

```
> get_crate_metadata({ crateName: "tokio" })

# tokio v1.49.0

An event-driven, non-blocking I/O platform for writing asynchronous applications...

## Links
  docs: https://docs.rs/tokio
  repo: https://github.com/tokio-rs/tokio
  license: MIT
  downloads: 312,456,789

## Features
  default = [macros, rt-multi-thread]
  fs = []
  full = [fs, io-util, io-std, macros, net, ...]
  io-util = [bytes]
  ...

## Optional Dependencies
  bytes ^1 (feature-gated)
  ...
```

---

### `get_crate_brief`

Single call to bootstrap context for a crate. Combines metadata, overview docs, re-exports, module list, and optionally expands focused modules.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |
| `version` | string | no | Pinned version |
| `focusModules` | string | no | Comma-separated modules to expand (e.g. `"sync,task"`) |

```
> get_crate_brief({ crateName: "tokio", focusModules: "sync,task" })

# tokio v1.49.0
...
## Features
  default = [macros, rt-multi-thread]
  all: bytes, fs, full, io-std, io-util, ...

## Overview
[truncated crate doc]

## Re-exports
  pub use task::spawn;
  ...

## Modules
  fs  io  macros  net  runtime  signal  sync  task  time

## Focus: tokio::sync
  [struct] Barrier — ...
  [struct] Mutex [sync] — ...
  [struct] Notify [sync] — ...
  ...

## Focus: tokio::task
  [fn] spawn — ...
  [struct] JoinHandle — ...
  ...
```

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

Lists all public items in a crate root or specific module.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |
| `modulePath` | string | no | Dot-separated path (e.g. `"sync"`, `"io.util"`) |
| `itemType` | enum | no | Filter: `mod` `struct` `enum` `trait` `fn` `macro` `type` `constant` `static` `union` `attr` `derive` |
| `version` | string | no | Pinned version |

Each item includes its type, name, feature gate (if any), and short description.

```
> get_crate_items({ crateName: "tokio", modulePath: "sync", itemType: "struct" })

# Items in tokio::sync [struct]
  [struct] Barrier — ...
  [struct] Mutex [feature: sync] — ...
  [struct] Notify [feature: sync] — ...
  [struct] OwnedMutexGuard [feature: sync] — ...
  ...
```

---

### `lookup_crate_item`

Retrieves full documentation for a single item.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |
| `itemType` | enum | yes | Item type (see `get_crate_items`) |
| `itemName` | string | yes | Item name (e.g. `"Mutex"`, `"spawn"`) |
| `modulePath` | string | no | Dot-separated module path |
| `version` | string | no | Pinned version |
| `includeImpls` | boolean | no | Include trait implementation list |
| `includeExamples` | boolean | no | Include code examples |

Returns: feature gate (if any), type signature, documentation text, methods list, enum variants, required/provided trait methods. Optionally includes trait implementations and code examples.

```
> lookup_crate_item({
    crateName: "tokio",
    itemType: "struct",
    itemName: "Mutex",
    modulePath: "sync",
    includeImpls: true
  })

# struct tokio::sync::Mutex
> Available on crate feature `sync` only.

## Signature
pub struct Mutex<T: ?Sized> { ... }

## Documentation
An asynchronous Mutex...

## Methods (12)
  pub fn new(t: T) -> Mutex<T>
  pub fn lock(&self) -> impl Future<Output = MutexGuard<'_, T>>
  pub fn try_lock(&self) -> Result<MutexGuard<'_, T>, TryLockError>
  ...

## Trait Implementations (15)
  impl<T: ?Sized + Debug> Debug for Mutex<T>
  impl<T> Default for Mutex<T>
  impl<T> From<T> for Mutex<T>
  impl<T: ?Sized> Send for Mutex<T>
  impl<T: ?Sized> Sync for Mutex<T>
  ...
```

---

### `search_crate`

Searches all items in a crate by name. Results are ranked: exact match on the bare item name scores highest, then prefix matches, then substring matches.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |
| `query` | string | yes | Search query (case-insensitive) |
| `version` | string | no | Pinned version |

```
> search_crate({ crateName: "tokio", query: "Mutex" })

# "Mutex" in tokio — 6 matches

[struct] tokio::sync::Mutex
[struct] tokio::sync::MutexGuard
[struct] tokio::sync::OwnedMutexGuard
[struct] tokio::sync::MappedMutexGuard
[enum] tokio::sync::TryLockError
...
```

---

### `search_crates`

Search for Rust crates on crates.io by keyword.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Search keywords |
| `page` | number | no | Page number (default 1) |
| `perPage` | number | no | Results per page (default 10, max 50) |

```
> search_crates({ query: "http" })

# Crate search: "http" — 1234 results (page 1)

  http v1.2.0 (50,000,000 downloads) — A set of types for representing HTTP requests and responses.
  hyper v1.5.2 (120,000,000 downloads) — A fast and correct HTTP library.
  reqwest v0.12.12 (100,000,000 downloads) — higher level HTTP client library
  ...
```

---

### `get_crate_versions`

List all published versions of a crate from crates.io.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |

```
> get_crate_versions({ crateName: "serde" })

# serde — 312 versions

  1.0.219  2025-02-01
  1.0.218  2025-01-12
  1.0.217  2024-12-23
  ...
  0.1.0  2014-12-09
```

---

### `get_source_code`

Fetch the raw source code of a file from docs.rs (or doc.rust-lang.org for std crates).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `crateName` | string | yes | Crate name |
| `path` | string | yes | Source path relative to crate root (e.g. `"src/lib.rs"`, `"src/sync/mutex.rs"`) |
| `version` | string | no | Pinned version |

```
> get_source_code({ crateName: "tokio", path: "src/sync/mutex.rs" })

# Source: tokio/src/sync/mutex.rs
https://docs.rs/tokio/latest/src/tokio/sync/mutex.rs

\`\`\`rust
use crate::sync::batch_semaphore as semaphore;
...
\`\`\`
```

---

## Recommended workflows

### Exploring a new crate

1. `get_crate_brief` with `focusModules` targeting the modules you care about
2. `search_crate` to find specific types or functions
3. `lookup_crate_item` for detailed signatures and docs

### Understanding feature flags

1. `get_crate_metadata` to see all features and their activations
2. `get_crate_items` to see which items require which features

### Finding the right type

1. `search_crate` with a keyword
2. `lookup_crate_item` with `includeImpls: true` to see what traits it implements
3. `lookup_crate_item` on referenced types to chase cross-links

---

## Architecture

```
src/
  index.ts              Entry point — registers tools + prompt, starts stdio server
  lib.ts                Shared: URL builders, HTTP/DOM helpers, crates.io API, extractors
  cache.ts              In-memory TTL cache (5-minute default)
  types/
    html-to-text.d.ts   Type declarations for html-to-text
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
```

### Data sources

- **docs.rs** — HTML pages parsed with cheerio for surgical DOM extraction (only the elements needed, not full-page conversion)
- **doc.rust-lang.org** — Same rustdoc HTML format, used for `std`, `core`, and `alloc`
- **crates.io API** — JSON endpoints for metadata, features, dependencies, and search

### Design decisions

- **cheerio over full-page text conversion** — Extracts only specific DOM elements (`.item-decl`, `.top-doc`, `.code-header`, `.stab.portability`) to minimize token usage
- **Ranked search** — `all.html` contains every public item; scoring by exact/prefix/substring gives better results than flat substring matching
- **Version parameter everywhere** — Agents working on projects with pinned dependencies need to read docs for specific versions
- **Optional sections** — `includeImpls` and `includeExamples` default to off so the base response stays compact; agents opt in when they need more detail
- **In-memory cache** — All HTTP responses are cached for 5 minutes, avoiding redundant fetches when agents issue multiple related tool calls

## License

MIT
