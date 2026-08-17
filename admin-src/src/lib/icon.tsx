import * as Icons from 'lucide-react';
import type { LucideProps } from 'lucide-react';

function toPascal(name: string) {
  return name.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

// Resolves a kebab-case lucide icon name (the same names used in the legacy
// builder's SCR_ICON map / user-entered "icon" fields) to its lucide-react
// component. Falls back to a plain square glyph for unknown/user-typo names.
export function DynIcon({ name, ...props }: { name: string } & LucideProps) {
  const Comp = (Icons as unknown as Record<string, React.ComponentType<LucideProps>>)[toPascal(name)];
  const Fallback = Icons.Square;
  const Resolved = Comp || Fallback;
  return <Resolved {...props} />;
}
