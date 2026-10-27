// Sync all merged manifests into the store DB as published items. Runs in CI on
// push to main (i.e. after a PR merges). Requires DATABASE_URL (the store's Postgres).
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { SQL } from 'bun'

const ROOT = join(import.meta.dir, '..')
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('sync requires DATABASE_URL')
  process.exit(1)
}
const sql = new SQL(databaseUrl)

type Manifest = Record<string, any>

const items: Manifest[] = []
for (const cat of ['mcp', 'skill', 'provider']) {
  const dir = join(ROOT, cat)
  if (!existsSync(dir)) continue
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    items.push(JSON.parse(readFileSync(join(dir, f), 'utf-8')))
  }
}

// Dedupe publishers embedded in the manifests.
const pubMap = new Map<string, Manifest>()
for (const it of items) if (it.publisher?.slug) pubMap.set(it.publisher.slug, it.publisher)

const json = (v: unknown) => JSON.stringify(v)
// text[] from a JSON array, so Postgres does the array conversion.
const textArray = (v: unknown) => sql`ARRAY(SELECT jsonb_array_elements_text(${json(v ?? [])}::text::jsonb))`

const eligibleOf = (pubId: Map<string, string>) => items.filter((i) => pubId.has(i.publisher?.slug))
// metadata.source in the DB is the provenance tag ('registry' | 'crawler'); a
// skill's source object from the manifest is kept under skillSource instead.
const syncedMetadata = (m: Record<string, any> = {}) => ({
  ...m,
  ...(m.source && typeof m.source === 'object' ? { skillSource: m.source } : {}),
  source: 'registry',
})

const { rows, stale } = await sql.begin(async (tx) => {
  // 1. Upsert publishers.
  for (const p of pubMap.values()) {
    await tx`
      INSERT INTO publishers (slug, name, avatar_url, tier, bio)
      VALUES (${p.slug}, ${p.name}, ${p.avatarUrl ?? ''}, ${p.tier ?? 'community'}, ${p.bio ?? null})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url, tier = EXCLUDED.tier, bio = EXCLUDED.bio`
  }

  // 2. Resolve publisher ids.
  const pubRows: { id: string; slug: string }[] = await tx`SELECT id, slug FROM publishers`
  const pubId = new Map(pubRows.map((p) => [p.slug, p.id]))

  // 3. Upsert items as published (the registry is the reviewed source of truth).
  // downloads is set only on NEW inserts; updates preserve the accumulated
  // real-install count (downloads is store-owned once created).
  const eligible = eligibleOf(pubId)
  for (const i of eligible) {
    await tx`
      INSERT INTO items (slug, name, description, category, version, publisher_id, compatible_with, tags,
                         status, install_hook, metadata, downloads)
      VALUES (${i.slug}, ${i.name}, ${i.description}, ${i.category}, ${i.version}, ${pubId.get(i.publisher.slug)},
              ${textArray(i.compatibleWith)}, ${textArray(i.tags)}, 'published',
              ${json(i.installHook)}::text::jsonb, ${json(syncedMetadata(i.metadata))}::text::jsonb, ${i.downloads ?? 0})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
        version = EXCLUDED.version, publisher_id = EXCLUDED.publisher_id,
        compatible_with = EXCLUDED.compatible_with, tags = EXCLUDED.tags, status = EXCLUDED.status,
        install_hook = EXCLUDED.install_hook, metadata = EXCLUDED.metadata`
  }

  // 3b. Record version history — one row per (slug, version), first time seen.
  // Re-syncing the same version is a no-op; new versions append.
  for (const i of eligible) {
    await tx`
      INSERT INTO item_versions (item_slug, version) VALUES (${i.slug}, ${i.version})
      ON CONFLICT (item_slug, version) DO NOTHING`
  }

  // 4. Reconcile: the registry is the single source of truth, so unpublish any
  // published item not backed by a current manifest — except the built-in test
  // providers, which are seeded separately.
  const PRESERVE = new Set(['local', 'yls', 'skyapi'])
  const currentSlugs = new Set(eligible.map((r) => r.slug))
  const published: { slug: string }[] = await tx`SELECT slug FROM items WHERE status = 'published'`
  const stale = published.filter((p) => !currentSlugs.has(p.slug) && !PRESERVE.has(p.slug)).map((p) => p.slug)
  for (const slug of stale) await tx`UPDATE items SET status = 'rejected' WHERE slug = ${slug}`
  return { rows: eligible, stale }
})

if (stale.length) console.log(`Unpublished ${stale.length} removed package(s): ${stale.join(', ')}`)
console.log(`Synced ${pubMap.size} publishers, ${rows.length} items (published)`)
await sql.close()
