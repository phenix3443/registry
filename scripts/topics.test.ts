import { expect, test } from 'bun:test'
import { validateTopics, type TopicFile } from './topics'

const PACKAGES = new Set(['context7', 'biel-ai', 'playwright-mcp'])

const topic = (slug: string, extra: Record<string, unknown> = {}): TopicFile => ({
  file: `topic/${slug}.json`,
  data: {
    slug,
    title: '标题',
    description: '一句话。',
    intro: '一段话。',
    capabilities: ['能做的事'],
    packages: ['context7', 'biel-ai'],
    ...extra,
  },
})

test('a well-formed topic passes', () => {
  expect(validateTopics([topic('docs', { related: ['browser'] }), topic('browser')], PACKAGES)).toEqual([])
})

test('a package that does not exist fails', () => {
  const errors = validateTopics([topic('docs', { packages: ['context7', 'no-such-package'] })], PACKAGES)
  expect(errors).toEqual(['topic/docs.json: package "no-such-package" does not exist in mcp/, skill/ or provider/'])
})

test('a topic listing itself as related fails', () => {
  const errors = validateTopics([topic('docs', { related: ['docs'] })], PACKAGES)
  expect(errors).toEqual(['topic/docs.json: related must not list the topic itself'])
})

test('a related topic that does not exist fails', () => {
  const errors = validateTopics([topic('docs', { related: ['nope'] })], PACKAGES)
  expect(errors).toEqual(['topic/docs.json: related topic "nope" does not exist in topic/'])
})

test('duplicate packages fail', () => {
  const errors = validateTopics([topic('docs', { packages: ['context7', 'biel-ai', 'context7'] })], PACKAGES)
  expect(errors).toEqual(['topic/docs.json: duplicate package "context7"'])
})

test('fewer than 2 packages fails', () => {
  const errors = validateTopics([topic('docs', { packages: ['context7'] })], PACKAGES)
  expect(errors).toEqual(['topic/docs.json: packages must be an array of at least 2 package slugs'])
})

test('slug must match the filename and unknown fields fail', () => {
  const errors = validateTopics([{ ...topic('docs', { faq: [] }), file: 'topic/other.json' }], PACKAGES)
  expect(errors).toContain('topic/other.json: slug "docs" must match filename "other"')
  expect(errors).toContain('topic/other.json: unknown field "faq"')
})

