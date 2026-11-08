/**
 * system-prompt-inject — append an arbitrary, user-authored section to the
 * DeepSeek Harness system prompt.
 *
 * ## Why a plugin rather than configuration
 *
 * Two mechanisms look like they should already cover this and do not:
 *
 * 1. **`AGENTS.md` / workspace instructions.** `dsh-agent-instructions` renders
 *    the whole chain as one *user-role* message. The model reads it below every
 *    system section, and the rendered frame says outright that it does not
 *    override system, developer, or direct user instructions.
 * 2. **`dsh-system-prompt`'s `personaPrefix` / `personaSuffix`.** Under the Web
 *    and Desktop applications an agent preset owns the prompt, and each shipped
 *    preset mounts a `@deepseek-ai/dsh-persona` row. That row registers
 *    `deployment:persona-prefix` and `deployment:persona-suffix`
 *    *unconditionally*, including as empty strings, and scoped registrations
 *    shadow global ones by name. A profile-level persona edit is therefore
 *    invisible whenever a preset is active — which is always, in Web.
 *
 * Registering a distinctly named section is the only supported way to add text
 * at system rank without rewriting a preset's entire plugin list.
 *
 * ## Contract
 *
 * Append-only and additive. This module never sets `complete: true`, so it
 * cannot replace, truncate, or reorder any existing section: the harness
 * identity, the persona, plan and tool guidance, and runtime context all
 * survive untouched. Deleting the row restores the previous prompt exactly.
 *
 * One row contributes one section. Mount several rows (distinct entry ids) to
 * inject several sections at different positions; each must carry a distinct
 * `name`, because the name is the replacement key and a duplicate silently
 * shadows the earlier registration instead of adding to it.
 *
 * The text is static. A dynamic section would change the request prefix on
 * every step and defeat provider prompt caching, so `text` is a plain string
 * read from configuration.
 *
 * @module dsh-system-prompt-inject
 */

/** Cordis plugin name. */
export const name = 'system-prompt-inject'

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt']

/** Section name used when the row does not set one. */
export const DEFAULT_SECTION_NAME = 'user:custom'

/**
 * Section order used when the row does not set one.
 *
 * The registry allocates -1000 to the harness identity, 0 to the deployment
 * persona prefix, 500 through ~3100 to policy and per-tool guidance, 9000
 * through 10100 to deliverable and surface guidance, and 10200 to the persona
 * suffix. 50 seats a rule directly after the persona and before any policy or
 * tool text, so it reads as part of the agent's identity rather than as an
 * afterthought appended at the end. An explicit `order` overrides it.
 */
export const DEFAULT_SECTION_ORDER = 50

/**
 * Resolve one section definition from a row config.
 *
 * @param config - resolved row config; `text` is required, `name` and `order`
 *   are optional overrides.
 * @returns the section to register, or `undefined` when there is nothing to add.
 */
export function resolveSection(config) {
  const text = typeof config?.text === 'string' ? config.text : ''
  // An empty section contributes nothing; skipping registration means a cleared
  // setting leaves no empty entry behind in the assembled prompt.
  if (text.trim() === '') return undefined

  const name =
    typeof config?.name === 'string' && config.name.trim() !== ''
      ? config.name
      : DEFAULT_SECTION_NAME

  // The registry accepts any finite order. A non-numeric value is a
  // configuration mistake that would otherwise sort unpredictably, so fall back
  // to the documented default rather than emitting NaN into the sort.
  const order =
    typeof config?.order === 'number' && Number.isFinite(config.order)
      ? config.order
      : DEFAULT_SECTION_ORDER

  return { name, order, text }
}

/**
 * Register the section for the mounting context's scope.
 *
 * @param ctx - context carrying the `systemPrompt` registry.
 * @param config - resolved row config; see {@link resolveSection}.
 */
export function apply(ctx, config) {
  const section = resolveSection(config)
  if (section === undefined) return

  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: section.name,
        order: section.order,
        text: section.text,
        // Keep the author's text verbatim. Injected text may legitimately
        // contain `{{...}}` braces, and interpolation would either mangle them
        // or fail assembly outright on a name no plugin registered.
        interpolate: false,
      }),
    'system-prompt-inject.section()',
  )
}
