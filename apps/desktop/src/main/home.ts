export function resolveHome(argv: string[], fallback: string): string {
  const arg = argv.find((a) => a.startsWith('--openfield-home='));
  if (!arg) return fallback;
  const value = arg.slice('--openfield-home='.length);
  return value.length > 0 ? value : fallback;
}
