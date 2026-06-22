// Used only via Vue template/runtime registration.
// Static analysis sees fanIn = 0 and flags it as `unused-utility`.
export function mfeDisplayName(name: string): string {
  return name.replace(/-/g, ' ');
}
