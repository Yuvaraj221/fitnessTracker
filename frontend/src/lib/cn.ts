import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge about FORGE's custom colour tokens so e.g. `text-ink-3`
// and `text-sm` aren't treated as conflicting.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ['bg', 'surface', 'raised', 'overlay', 'line', 'line-strong', 'ink', 'ink-2', 'ink-3', 'brand', 'brand-hover', 'brand-soft', 'electric', 'electric-soft', 'good', 'good-soft', 'warn', 'bad', 'bad-soft'],
    },
  },
});

/** Joins class names; later classes win over conflicting earlier ones. */
export const cn = (...parts: (string | false | null | undefined)[]) => twMerge(parts.filter(Boolean).join(' '));
