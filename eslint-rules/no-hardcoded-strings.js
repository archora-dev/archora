/**
 * Local ESLint rule: warn on user-visible strings hardcoded in Vue templates
 * instead of going through `t('…')` (vue-i18n).
 *
 * Heuristics (deliberately conservative - easier to widen than to apologize):
 *   - VText nodes whose content has ≥1 run of 4+ word characters with at
 *     least one lowercase letter (catches "Open project" / "Открыть").
 *     Pure-uppercase tokens (likely abbreviations / labels like "JSON") are
 *     ignored, as is punctuation, numbers, and short single tokens.
 *   - String Literals inside `{{ "..." }}` bindings (VExpressionContainer)
 *     are flagged with the same heuristic.
 *
 * False-positive escape hatches:
 *   - Inline disable: `<!-- eslint-disable-next-line local/no-hardcoded-strings -->`
 *   - The `ignore` option (regex) per-rule entry in eslint.config.js.
 *
 * Why not run in `<script>` too? Most user-visible strings in this project
 * already flow through `t()`. JS strings have far too many legitimate uses
 * (dictionary keys, CSS classes, internal codes) - covering them here
 * would generate noise without much new signal.
 */

const HUMAN_TEXT = /[A-Za-zА-Яа-яЁё]{4,}/u;

function looksHardcoded(raw) {
  const text = raw.trim();
  if (text.length === 0) return false;
  if (!HUMAN_TEXT.test(text)) return false;
  // All-uppercase sequences (e.g. "JSON", "API") aren't worth translating.
  if (/^[A-ZА-Я0-9 .,:_-]+$/u.test(text)) return false;
  return true;
}

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Warn on hardcoded user-facing strings in Vue templates' },
    schema: [
      {
        type: 'object',
        properties: {
          ignore: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      hardcoded: 'Hardcoded user-facing string "{{snippet}}". Wrap with `t(\'…\')` from vue-i18n.',
    },
  },
  create(context) {
    const opts = context.options[0] ?? {};
    const ignore = (opts.ignore ?? []).map((p) => new RegExp(p, 'u'));

    function isIgnored(text) {
      return ignore.some((re) => re.test(text));
    }

    function snippet(text) {
      const t = text.trim().replace(/\s+/gu, ' ');
      return t.length > 40 ? `${t.slice(0, 37)}…` : t;
    }

    const services = context.sourceCode.parserServices;
    if (!services?.defineTemplateBodyVisitor) {
      // Non-Vue file - nothing to do.
      return {};
    }

    return services.defineTemplateBodyVisitor({
      VText(node) {
        if (!looksHardcoded(node.value)) return;
        if (isIgnored(node.value)) return;
        context.report({ node, messageId: 'hardcoded', data: { snippet: snippet(node.value) } });
      },
      'VExpressionContainer > Literal[value]'(node) {
        // {{ 'literal' }} - i.e., a Literal directly inside a mustache.
        if (typeof node.value !== 'string') return;
        if (!looksHardcoded(node.value)) return;
        if (isIgnored(node.value)) return;
        context.report({
          node,
          messageId: 'hardcoded',
          data: { snippet: snippet(node.value) },
        });
      },
    });
  },
};
