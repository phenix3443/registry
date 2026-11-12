> [!IMPORTANT]
> **This repository is archived and no longer maintained.** Agent Store no longer keeps hand-written manifests. Its catalog is now aggregated from upstream sources — the [official MCP Registry](https://registry.modelcontextprotocol.io) for MCP servers and public GitHub repositories containing `SKILL.md` for skills — by the `catalog-sync` workflow in [phenix3443/agent-store](https://github.com/phenix3443/agent-store). To list an MCP server, publish it to the official MCP Registry. See [agent-store#101](https://github.com/phenix3443/agent-store/issues/101).

# Agent Store registry

The package registry for [Agent Store](https://agent-store-alpha.vercel.app) — a
marketplace of **providers**, **skills**, and **MCP servers** for Claude Code,
Codex, and other AI coding agents.

Each package is a single JSON manifest. Anyone can contribute or update a package
by opening a pull request. Merged manifests are synced to the store within 15 minutes and go live.

## Repository layout

```
mcp/<slug>.json        # MCP servers (npx stdio, or remote http/sse)
skill/<slug>.json      # Skills (a SKILL.md fetched on install)
provider/<slug>.json   # Model providers / relays (pre-filled connection)
topic/<slug>.json      # Topics: curated groups of packages for one kind of work
schema/package.schema.json
schema/topic.schema.json
scripts/validate.ts    # the CI validator
```

## Contribute a package

1. Fork this repo.
2. Add a file `<category>/<slug>.json`. The filename **must** equal the `slug`.
   Point your editor at `schema/package.schema.json` (via the `$schema` field) for
   completion and inline validation.
3. Open a PR. CI validates the manifest (schema + that install URLs resolve).
4. A maintainer reviews the PR. On merge, the package is published to the store.

Report a broken package or request a new one via an **issue**.

## Manifest shape

```jsonc
{
  "$schema": "../schema/package.schema.json",
  "slug": "context7",
  "name": "Context7",
  "description": "Up-to-date code docs for any prompt.",
  "category": "mcp",
  "version": "1.0.0",
  "publisher": { "slug": "upstash", "name": "Upstash", "tier": "community" },
  "compatibleWith": ["claude", "codex"],
  "tags": ["mcp", "npm"],
  "installHook": { "steps": [] },
  "metadata": { "transport": "stdio", "serverCommand": "npx -y @upstash/context7-mcp" }
}
```

### Install hooks by category

- **MCP (stdio)** — set `metadata.transport: "stdio"` and `metadata.serverCommand`
  (e.g. `npx -y <package>`). No file download needed; the command runs at enable.
- **MCP (remote)** — set `metadata.transport: "http"` (or `"sse"`) and `metadata.url`.
- **Skill** — add a `file` step fetching the raw `SKILL.md` to `skill.md`, e.g.
  `{ "type": "file", "url": "https://raw.githubusercontent.com/.../SKILL.md", "dest": "skill.md" }`,
  and `metadata.source: { "repo": "owner/name", "ref": "main", "path": "skills/<dir>" }`
  pointing at the skill's **directory**, so clients can install its other files too.
  Add `"codex"` to `compatibleWith` only when the SKILL.md frontmatter has both
  `name` and `description` (Codex skips skills without them; CI checks this).
- **Provider** — add a `config` step pre-filling the connection, e.g.
  `{ "type": "config", "patch": { "apiKey": "", "baseUrl": "https://...", "authType": "bearer" } }`.
  The user only supplies their API key.

## Topics

A topic tells a visitor where to start for one kind of work ("Agent 工作流",
"浏览器自动化与调试" …). It is a hand-curated, ordered list of packages and can mix
skills, MCP servers and providers. Group by the work a visitor wants to do, not by
publisher; a package may appear in several topics.

```jsonc
{
  "$schema": "../schema/topic.schema.json",
  "slug": "browser-automation",
  "title": "浏览器自动化与调试",
  "description": "One sentence for the topic card.",
  "intro": "One paragraph for the top of the topic page.",
  "capabilities": ["What the agent can do with these installed", "…"],
  "packages": ["playwright-mcp", "chrome-devtools"],  // display order, at least 2
  "related": ["coding-practices"]                     // optional, other topic slugs
}
```

To add or change a topic, open a PR with `topic/<slug>.json` (the filename must equal
the `slug`). CI checks the schema, that every entry in `packages` exists under `mcp/`,
`skill/` or `provider/`, and that `related` names other existing topics, with no
duplicates. Write `intro` and `capabilities` only from what the listed packages'
manifests say they do. On merge the sync writes topics to the store, and deleting a
file removes the topic there.

Topic text is Chinese only for now, like the store UI. If the store adds another
language, add per-language fields next to the existing ones (e.g. `title_en`) in the
schema, validator, sync and the store's `topics` table together.

## Validate locally

```bash
bun scripts/validate.ts          # structure + URL reachability
CHECK_URLS=0 bun scripts/validate.ts   # structure only (offline)
bun test scripts/                      # validator unit tests
```

Popular packages can also be proposed by a crawler, which runs only when a maintainer
dispatches it and opens a PR here. Those PRs go through the same review as any other
contribution.
