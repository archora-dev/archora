// Shared HTML escaping for the report renderers. Report content is interpolated
// into a standalone HTML document, so every dynamic value (module ids, paths,
// messages) must be escaped to keep the output safe to open in a browser.
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });
}

export function escapeAttr(value: string): string {
  return escapeHtml(value);
}
