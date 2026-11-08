/**
 * Contract tests for system-prompt-inject.
 *
 * These cover what the module promises without a running Harness: it registers
 * one section with the resolved identity, honours `name` and `order` overrides,
 * never claims the complete-prompt slot, preserves braces verbatim, and
 * registers nothing for an empty rule or absent config.
 *
 * Run: node --test system-prompt-inject.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  apply,
  DEFAULT_SECTION_NAME,
  DEFAULT_SECTION_ORDER,
  inject,
  name,
  resolveSection,
} from './system-prompt-inject.mjs'

/**
 * A registry stand-in that records what the plugin registered.
 * @returns {{ctx: object, sections: object[], effects: object[]}}
 */
function fakeContext() {
  const sections = []
  const effects = []
  const ctx = {
    effect(fn, label) {
      effects.push({ label, dispose: fn() })
      return () => {}
    },
    systemPrompt: {
      section(options) {
        sections.push(options)
        return () => {}
      },
    },
  }
  return { ctx, sections, effects }
}

test('declares the registry it needs', () => {
  assert.equal(name, 'system-prompt-inject')
  assert.deepEqual(inject, ['systemPrompt'])
})

test('registers one section using the documented defaults', () => {
  const { ctx, sections, effects } = fakeContext()
  const text = '## 语言规则\n\n- 思考过程以中文为主。'

  apply(ctx, { text })

  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, DEFAULT_SECTION_NAME)
  assert.equal(sections[0].order, DEFAULT_SECTION_ORDER)
  assert.equal(sections[0].text, text)
  assert.equal(effects.length, 1)
  assert.equal(effects[0].label, 'system-prompt-inject.section()')
})

test('honours explicit name and order overrides', () => {
  const { ctx, sections } = fakeContext()

  apply(ctx, { text: 'rule', name: 'user:review-guidelines', order: 2500 })

  assert.equal(sections[0].name, 'user:review-guidelines')
  assert.equal(sections[0].order, 2500)
})

test('falls back to defaults for unusable name and order values', () => {
  const { ctx, sections } = fakeContext()

  apply(ctx, { text: 'rule', name: '   ', order: Number.NaN })
  assert.equal(sections[0].name, DEFAULT_SECTION_NAME)
  assert.equal(sections[0].order, DEFAULT_SECTION_ORDER)

  const second = fakeContext()
  apply(second.ctx, { text: 'rule', name: 42, order: 'early' })
  assert.equal(second.sections[0].name, DEFAULT_SECTION_NAME)
  assert.equal(second.sections[0].order, DEFAULT_SECTION_ORDER)
})

test('never claims the complete-prompt slot', () => {
  // The whole safety argument rests on this: `complete: true` would discard
  // every other section, and two of them fail prompt assembly outright.
  const { ctx, sections } = fakeContext()

  apply(ctx, { text: 'anything' })

  assert.equal(sections[0].complete, undefined)
})

test('preserves braces verbatim instead of interpolating them', () => {
  const { ctx, sections } = fakeContext()

  apply(ctx, { text: 'keep {{not_a_registered_variable}} as written' })

  assert.equal(sections[0].interpolate, false)
  assert.equal(sections[0].text, 'keep {{not_a_registered_variable}} as written')
})

test('registers nothing for an empty or whitespace-only rule', () => {
  for (const text of ['', '   ', '\n\t\n']) {
    const { ctx, sections } = fakeContext()
    apply(ctx, { text })
    assert.equal(sections.length, 0, `expected no section for ${JSON.stringify(text)}`)
  }
})

test('does not throw when configuration is absent or malformed', () => {
  for (const config of [undefined, null, {}, { text: 42 }]) {
    const { ctx, sections } = fakeContext()
    assert.doesNotThrow(() => apply(ctx, config))
    assert.equal(sections.length, 0)
  }
})

test('resolveSection reports nothing to add for an empty rule', () => {
  assert.equal(resolveSection({ text: '' }), undefined)
  assert.equal(resolveSection(undefined), undefined)
  assert.deepEqual(resolveSection({ text: 'x' }), {
    name: DEFAULT_SECTION_NAME,
    order: DEFAULT_SECTION_ORDER,
    text: 'x',
  })
})
