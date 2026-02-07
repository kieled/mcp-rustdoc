# mcp-rustdoc

An MCP server that gives AI assistants deep access to the Rust ecosystem. It scrapes docs.rs with surgical DOM extraction (cheerio) and queries the crates.io API, exposing six tools that cover everything from high-level crate overviews to individual method signatures, feature gates, trait impls, and code examples.

## Tools

| Tool | What it returns |
|---|---|
| `get_crate_metadata` | Version, features, default features, optional/required deps, links (crates.io API) |
| `get_crate_brief` | One-shot bundle: metadata + overview + re-exports + module list + focused module items |
| `lookup_crate_docs` | Crate overview documentation, version, sections, re-exports |
| `get_crate_items` | Items in a module with types, feature gates, and descriptions |
| `lookup_crate_item` | Item detail: signature, docs, methods, variants, optionally trait impls + examples |
| `search_crate` | Ranked symbol search (exact > prefix > substring) with canonical paths |

Every tool accepts an optional `version` parameter to pin a specific crate version instead of `latest`.

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
  types/
    html-to-text.d.ts   Type declarations for html-to-text
  tools/
    shared.ts           Shared Zod schemas (itemTypeEnum, versionParam)
    lookup-docs.ts      lookup_crate_docs
    get-items.ts        get_crate_items
    lookup-item.ts      lookup_crate_item
    search.ts           search_crate
    crate-metadata.ts   get_crate_metadata
    crate-brief.ts      get_crate_brief
```

### Data sources

- **docs.rs** — HTML pages parsed with cheerio for surgical DOM extraction (only the elements needed, not full-page conversion)
- **crates.io API** — JSON endpoints for metadata, features, and dependencies

### Design decisions

- **cheerio over full-page text conversion** — Extracts only specific DOM elements (`.item-decl`, `.top-doc`, `.code-header`, `.stab.portability`) to minimize token usage
- **Ranked search** — `all.html` contains every public item; scoring by exact/prefix/substring gives better results than flat substring matching
- **Version parameter everywhere** — Agents working on projects with pinned dependencies need to read docs for specific versions
- **Optional sections** — `includeImpls` and `includeExamples` default to off so the base response stays compact; agents opt in when they need more detail

## License

MIT
