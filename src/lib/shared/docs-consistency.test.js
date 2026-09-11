// src/lib/shared/docs-consistency.test.js
// Keeps README.md's tool list in step with the home page. The README
// used to describe three tools long after the app shipped eight — later
// consolidated to seven when FlowState was absorbed into MyLedger.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const README = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8')
const HOME = readFileSync(new URL('../../app/page.js', import.meta.url), 'utf8')

// The tool routes the home page's TOOLS array links to. Quote-agnostic
// and allows digits / hyphens in a route, so a formatter change or a
// route like `/foo-bar` doesn't produce a misleading count mismatch.
const routes = [...HOME.matchAll(/href:\s*['"](\/[\w-]+)['"]/g)].map((m) => m[1])
// How many entries the TOOLS array declares — the count `routes` must match.
const toolEntryCount = (HOME.match(/^\s*href:\s*['"]\//gm) || []).length

test('every TOOLS entry links to a distinct tool route', () => {
  assert.ok(toolEntryCount >= 7, `TOOLS array has only ${toolEntryCount} entries`)
  assert.equal(
    new Set(routes).size, toolEntryCount,
    `expected ${toolEntryCount} distinct tool routes, got ${routes.join(', ')}`,
  )
})

test('README.md documents every tool route the home page links to', () => {
  const missing = [...new Set(routes)].filter((r) => !README.includes(`\`${r}\``))
  assert.deepEqual(missing, [], `README is missing tool routes: ${missing.join(', ')}`)
})

test('README.md and docs/architecture.md exist and are non-trivial', () => {
  assert.ok(README.length > 1500, 'README.md looks empty/stale')
  const arch = readFileSync(new URL('../../../docs/architecture.md', import.meta.url), 'utf8')
  assert.ok(arch.includes('My Numbers') && arch.includes('data pipeline'))
})
