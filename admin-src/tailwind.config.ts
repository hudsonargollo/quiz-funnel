import type { Config } from 'tailwindcss';

// Theme is seeded FROM public/css/tokens.css's CSS custom properties — no new
// palette is invented here. See src/styles/globals.css for the shadcn CSS-var
// bridge that aliases --background/--primary/etc onto these same tokens.
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // NOTE: tokens.css stores raw hex/rgba (not HSL triplets), so these
        // reference CSS vars directly rather than via the usual shadcn hsl()
        // wrapper — same bridging goal, adapted to the existing token format.
        border: 'var(--outline)',
        input: 'var(--outline)',
        ring: 'var(--brand-500)',
        background: 'var(--bg)',
        foreground: 'var(--on-surface)',
        primary: { DEFAULT: 'var(--brand-500)', foreground: 'var(--on-primary)' },
        secondary: { DEFAULT: 'var(--surface-2)', foreground: 'var(--on-surface)' },
        destructive: { DEFAULT: 'var(--danger)', foreground: '#ffffff' },
        muted: { DEFAULT: 'var(--surface-2)', foreground: 'var(--on-surface-muted)' },
        accent: { DEFAULT: 'var(--accent)', foreground: '#ffffff' },
        popover: { DEFAULT: 'var(--surface)', foreground: 'var(--on-surface)' },
        card: { DEFAULT: 'var(--surface)', foreground: 'var(--on-surface)' },
        brand: {
          50: 'var(--brand-50)', 100: 'var(--brand-100)', 200: 'var(--brand-200)',
          300: 'var(--brand-300)', 400: 'var(--brand-400)', 500: 'var(--brand-500)',
          600: 'var(--brand-600)', 700: 'var(--brand-700)', 800: 'var(--brand-800)', 900: 'var(--brand-900)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'var(--r-xl)',
      },
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        e1: 'var(--e-1)', e2: 'var(--e-2)', e3: 'var(--e-3)', e4: 'var(--e-4)',
      },
      transitionDuration: {
        1: 'var(--dur-1)', 2: 'var(--dur-2)', 3: 'var(--dur-3)', 4: 'var(--dur-4)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
