import { useState } from 'react';
import { api } from '@/lib/api';

// Funis / Anúncios IA / Mineração haven't been ported off the legacy admin
// yet (see admin-src/src/App.tsx's migration comment) — the legacy app has
// no hash routing, so these link to plain /admin/ rather than promising a
// deep link the target page can't honor. Milestones is its own standalone page.
const LEGACY_TABS = [
  { label: 'Funis', href: '/admin/' },
  { label: 'Anúncios IA', href: '/admin/' },
  { label: 'Mineração', href: '/admin/' },
  { label: 'Milestones', href: '/milestones' },
];

export default function ConsoleNav() {
  const [lang, setLang] = useState<'en' | 'pt'>('pt');

  return (
    <nav className="sticky top-0 z-40 flex items-center gap-5 border-b border-white/[.08] bg-[color:var(--surface-glass)] px-7 py-3.5 backdrop-blur-md">
      <div className="mr-2 flex flex-shrink-0 items-center gap-2.5">
        <div
          className="grid h-[30px] w-[30px] place-items-center rounded-[10px] font-display text-[15px] font-bold text-primary-foreground"
          style={{ background: 'var(--brand-grad, linear-gradient(135deg,var(--brand-500),var(--brand-soft)))', boxShadow: 'var(--glow-brand)' }}
        >
          F
        </div>
        <div className="font-display text-[15px] font-semibold">FunnelsTone</div>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        <button
          className="whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-medium"
          style={{ background: 'var(--primary-container)', color: 'var(--on-primary-container)' }}
        >
          Painel
        </button>
        {LEGACY_TABS.map((tItem) => (
          <a
            key={tItem.label}
            href={tItem.href}
            className="whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors duration-2 hover:bg-white/[.04] hover:text-foreground"
          >
            {tItem.label}
          </a>
        ))}
      </div>

      <div className="flex flex-shrink-0 items-center gap-3.5">
        <div className="hidden items-center gap-1.5 text-[11px] text-[color:var(--on-surface-faint)] sm:flex">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--success)', boxShadow: '0 0 0 3px rgba(34,197,94,.18)' }} />
          Sincronizado
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex rounded-full border border-border bg-secondary/60 p-0.5">
          {(['EN', 'PT'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l.toLowerCase() as 'en' | 'pt')}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-2 ${
                lang === l.toLowerCase() ? 'bg-card text-foreground shadow-e1' : 'text-[color:var(--on-surface-faint)]'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          onClick={() => api('auth/logout', { method: 'POST' }).catch(() => {}).finally(() => { window.location.href = '/admin/'; })}
          className="rounded-full border border-border px-3.5 py-[7px] text-[13px] font-medium text-muted-foreground transition-colors duration-2 hover:border-[color:var(--outline-strong)] hover:text-foreground"
        >
          Sair
        </button>
      </div>
    </nav>
  );
}
