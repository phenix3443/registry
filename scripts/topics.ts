// Topics: curated groupings of packages under topic/. Shared by validate.ts and sync.ts.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface Topic {
  slug: string
  title: string
  description: string
  intro: string
  capabilities: string[]
  packages: string[]
  related?: string[]
}

export interface TopicFile {
  file: string
  data: unknown
}

const FIELDS = new Set(['$schema', 'slug', 'title', 'description', 'intro', 'capabilities', 'packages', 'related'])
const SLUG = /^[a-z0-9-]+$/

export function readTopicFiles(root: string): TopicFile[] {
  const dir = join(root, 'topic')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const file = `topic/${f}`
      try {
        return { file, data: JSON.parse(readFileSync(join(dir, f), 'utf-8')) }
      } catch (e) {
        return { file, data: new SyntaxError((e as Error).message) }
      }
    })
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string' && s !== '')

function duplicates(list: string[]): string[] {
  return [...new Set(list.filter((s, i) => list.indexOf(s) !== i))]
}

/** Returns "<file>: <message>" errors; an empty list means every topic is valid. */
export function validateTopics(files: TopicFile[], packageSlugs: Set<string>): string[] {
  const errors: string[] = []
  const topicSlugs = new Set(
    files.map((f) => (f.data as Record<string, unknown> | null)?.slug).filter((s): s is string => typeof s === 'string'),
  )

  for (const { file, data } of files) {
    const err = (msg: string) => errors.push(`${file}: ${msg}`)
    if (data instanceof SyntaxError) {
      err(`invalid JSON: ${data.message}`)
      continue
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      err('must be a JSON object')
      continue
    }
    const t = data as Record<string, unknown>

    for (const key of Object.keys(t)) if (!FIELDS.has(key)) err(`unknown field "${key}"`)

    const slug = file.replace(/^topic\//, '').replace(/\.json$/, '')
    if (t.slug !== slug) err(`slug "${t.slug}" must match filename "${slug}"`)
    if (typeof t.slug !== 'string' || !SLUG.test(t.slug)) err('slug must be kebab-case ([a-z0-9-])')
    for (const f of ['title', 'description', 'intro']) {
      if (typeof t[f] !== 'string' || !(t[f] as string).trim()) err(`missing ${f}`)
    }

    if (!isStringArray(t.capabilities) || t.capabilities.length === 0) {
      err('capabilities must be a non-empty array of strings')
    } else {
      for (const d of duplicates(t.capabilities)) err(`duplicate capability "${d}"`)
    }

    if (!isStringArray(t.packages) || t.packages.length < 2) {
      err('packages must be an array of at least 2 package slugs')
    } else {
      for (const d of duplicates(t.packages)) err(`duplicate package "${d}"`)
      for (const p of new Set(t.packages)) {
        if (!packageSlugs.has(p)) err(`package "${p}" does not exist in mcp/, skill/ or provider/`)
      }
    }

    if (t.related !== undefined) {
      if (!isStringArray(t.related)) {
        err('related must be an array of topic slugs')
      } else {
        for (const d of duplicates(t.related)) err(`duplicate related topic "${d}"`)
        for (const r of new Set(t.related)) {
          if (r === t.slug) err('related must not list the topic itself')
          else if (!topicSlugs.has(r)) err(`related topic "${r}" does not exist in topic/`)
        }
      }
    }
  }

  return errors
}
