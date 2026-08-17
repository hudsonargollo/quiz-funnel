import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCheck, CreditCard, ExternalLink, LayoutGrid, Loader2, Mail, Plus, RefreshCw, Settings, ShoppingCart, Users, X } from 'lucide-react';
import { createFunnel, getStats, listFunnels, type FunnelStats, type FunnelSummary } from '@/lib/funnels';
import ConsoleNav from '@/components/ConsoleNav';
import StatusPill from '@/components/StatusPill';
import FunnelDrawer from '@/components/FunnelDrawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const PERIODS = [
  { label: 'Todo o período', days: 0 },
  { label: 'Últimos 7 dias', days: 7 },
  { label: 'Últimos 30 dias', days: 30 },
  { label: 'Últimos 90 dias', days: 90 },
];

const FUNNEL_STEP_LABEL: Record<string, string> = {
  started: 'Iniciou', lead: 'Lead', offer: 'Viu oferta', checkout: 'Checkout', purchased: 'Comprou',
};

function fmtN(n: number) {
  return new Intl.NumberFormat('pt-BR').format(n || 0);
}

export default function DashboardPage() {
  const [funnels, setFunnels] = useState<FunnelSummary[]>([]);
  const [loadingFunnels, setLoadingFunnels] = useState(true);
  const [filterFunnelId, setFilterFunnelId] = useState('');
  const [days, setDays] = useState(0);
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [creating, setCreating] = useState(false);

  function refreshFunnels() {
    setLoadingFunnels(true);
    return listFunnels()
      .then((d) => setFunnels(d.results))
      .catch((e) => toast.error(String(e.message || e)))
      .finally(() => setLoadingFunnels(false));
  }

  function refreshStats() {
    setLoadingStats(true);
    return getStats({ funnelId: filterFunnelId || undefined, days: days || undefined })
      .then(setStats)
      .catch((e) => toast.error(String(e.message || e)))
      .finally(() => setLoadingStats(false));
  }

  useEffect(() => { refreshFunnels(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refreshStats(); }, [filterFunnelId, days]);

  const totals = useMemo(() => {
    const leads = funnels.reduce((a, f) => a + (f.lead_count || 0), 0);
    const sales = funnels.reduce((a, f) => a + (f.purchase_count || 0), 0);
    return { leads, sales, conv: leads ? Math.round((sales / leads) * 1000) / 10 : 0 };
  }, [funnels]);

  async function submitNewFunnel() {
    if (!newSlug.trim()) { toast.error('O slug é obrigatório'); return; }
    setCreating(true);
    try {
      const r = await createFunnel({ name: newName.trim() || newSlug.trim(), slug: newSlug.trim(), type: 'quiz' });
      toast.success('Funil criado');
      setCreatingNew(false);
      setNewName('');
      setNewSlug('');
      await refreshFunnels();
      setDrawerId(r.id);
    } catch (e: any) {
      toast.error(String(e.message || e));
    } finally {
      setCreating(false);
    }
  }

  const captured = stats?.funnel.find((s) => s.key === 'lead')?.count || 0;
  const purchased = stats?.byState['purchase_completed'] || 0;
  const checkouts = (stats?.byState['checkout_initiated'] || 0) + (stats?.byState['checkout_abandoned'] || 0);
  const maxDaily = Math.max(1, ...(stats?.daily || []).map((d) => d.n));
  const maxFunnel = Math.max(1, stats?.funnel[0]?.count || 1);

  return (
    <div className="min-h-screen">
      <ConsoleNav />

      <div className="mx-auto max-w-[1180px] px-7 pb-20 pt-9">
        <div className="mb-5 flex items-end justify-between gap-5">
          <div>
            <h1 className="font-display text-[26px] font-semibold">
              Os seus <span style={{ color: 'var(--brand-soft)' }}>funis</span>
            </h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">Toque num funil para filtrar o painel</p>
          </div>
          <Button onClick={() => setCreatingNew(true)}><Plus className="h-3.5 w-3.5" /> Novo funil</Button>
        </div>

        <div className="mb-7 flex gap-3 overflow-x-auto pb-1.5">
          <button
            onClick={() => setFilterFunnelId('')}
            className="flex-shrink-0 rounded-xl border p-4 text-left transition-transform duration-2"
            style={{ width: 220, background: 'var(--surface)', borderColor: filterFunnelId === '' ? 'var(--brand-500)' : 'var(--outline)', boxShadow: filterFunnelId === '' ? 'var(--glow-brand)' : undefined }}
          >
            <div className="mb-3.5 grid h-8 w-8 place-items-center rounded-md" style={{ background: 'var(--surface-2)', color: 'var(--brand-soft)' }}>
              <LayoutGrid className="h-4 w-4" />
            </div>
            <p className="mb-1 font-display text-[16px] font-semibold">Todos os funis</p>
            <p className="text-[11px] uppercase tracking-wide text-[color:var(--on-surface-faint)]">{funnels.length} {funnels.length === 1 ? 'funil' : 'funis'}</p>
          </button>

          {loadingFunnels ? (
            <div className="flex flex-shrink-0 items-center px-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : (
            funnels.map((f) => (
              <div
                key={f.id}
                className="flex-shrink-0 cursor-pointer rounded-xl border p-4 transition-transform duration-2 hover:-translate-y-0.5"
                style={{ width: 220, background: 'var(--surface)', borderColor: filterFunnelId === f.id ? 'var(--brand-500)' : 'var(--outline)', boxShadow: filterFunnelId === f.id ? 'var(--glow-brand)' : undefined }}
                onClick={() => setFilterFunnelId(f.id)}
              >
                <div className="mb-3.5 flex items-start justify-between">
                  <div className="grid h-8 w-8 place-items-center rounded-md" style={{ background: 'var(--surface-2)', color: 'var(--brand-soft)' }}>
                    <LayoutGrid className="h-4 w-4" />
                  </div>
                  <div className="flex gap-1">
                    {f.status === 'published' && (
                      <button
                        title="Abrir funil público"
                        onClick={(e) => { e.stopPropagation(); window.open(`https://offers.clubemkt.digital/${f.slug}`, '_blank'); }}
                        className="grid h-[26px] w-[26px] place-items-center rounded text-[color:var(--on-surface-faint)] hover:bg-secondary hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      title="Definições do funil"
                      onClick={(e) => { e.stopPropagation(); setDrawerId(f.id); }}
                      className="grid h-[26px] w-[26px] place-items-center rounded text-[color:var(--on-surface-faint)] hover:bg-secondary hover:text-foreground"
                    >
                      <Settings className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <p className={`mb-1.5 truncate font-display text-[16px] font-semibold ${f.name ? 'capitalize' : ''}`}>{f.name || f.slug}</p>
                <StatusPill status={f.status} />
                <div className="mt-3 flex gap-4 border-t border-white/[.08] pt-3">
                  <div><b className="block font-display text-[15px] tabular-nums">{fmtN(f.lead_count)}</b><span className="text-[10px] uppercase tracking-wide text-[color:var(--on-surface-faint)]">Leads</span></div>
                  <div><b className="block font-display text-[15px] tabular-nums">{fmtN(f.purchase_count)}</b><span className="text-[10px] uppercase tracking-wide text-[color:var(--on-surface-faint)]">Vendas</span></div>
                </div>
              </div>
            ))
          )}

          {creatingNew ? (
            <div className="flex-shrink-0 rounded-xl border p-4" style={{ width: 240, background: 'var(--surface)', borderColor: 'var(--brand-500)' }}>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-muted-foreground">Novo funil</span>
                <button onClick={() => setCreatingNew(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
              </div>
              <Input className="mb-2 h-8 text-[12.5px] capitalize" placeholder="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              <Input className="mb-2.5 h-8 text-[12.5px]" placeholder="slug" value={newSlug} onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
              <Button size="sm" className="w-full" onClick={submitNewFunnel} disabled={creating}>
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Criar'}
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setCreatingNew(true)}
              className="flex flex-shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-[color:var(--on-surface-faint)] transition-colors duration-2 hover:text-[color:var(--brand-soft)]"
              style={{ width: 220, borderColor: 'var(--outline)' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--brand-500)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--outline)')}
            >
              <Plus className="h-5 w-5" />
              <span className="text-[13px] font-medium">Novo funil</span>
            </button>
          )}
        </div>

        <div className="mb-5 flex items-center gap-2.5">
          <select
            value={filterFunnelId}
            onChange={(e) => setFilterFunnelId(e.target.value)}
            className="h-9 rounded-md border border-border bg-secondary/50 px-3 text-[13px] shadow-inner focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Todos os funis</option>
            {funnels.map((f) => <option key={f.id} value={f.id}>{f.name || f.slug}</option>)}
          </select>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 rounded-md border border-border bg-secondary/50 px-3 text-[13px] shadow-inner focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {PERIODS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
          </select>
          <button onClick={refreshStats} className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground">
            <RefreshCw className={`h-3.5 w-3.5 ${loadingStats ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { icon: Users, v: stats?.total || 0, l: 'Leads totais', hint: !stats?.total ? 'Partilhe o link público para começar a captar leads.' : undefined },
            { icon: Mail, v: captured, l: 'Capturados', hint: `${stats?.conversion.lead_rate ?? 0}% do total` },
            { icon: CreditCard, v: purchased, l: 'Compras', hint: `${stats?.conversion.purchase_rate ?? 0}% do total` },
            { icon: ShoppingCart, v: checkouts, l: 'Checkouts', hint: !checkouts ? 'Publique o funil para começar a receber tráfego.' : undefined },
          ].map((k) => (
            <div key={k.l} className="rounded-xl border border-border p-4.5" style={{ background: 'var(--surface)' }}>
              <div className="mb-3.5 grid h-[34px] w-[34px] place-items-center rounded-md" style={{ background: 'var(--surface-2)', color: 'var(--brand-soft)' }}>
                <k.icon className="h-4 w-4" />
              </div>
              <b className="block font-display text-[28px] font-semibold tabular-nums">{loadingStats ? '—' : fmtN(k.v)}</b>
              <div className="mt-0.5 text-[13px] text-muted-foreground">{k.l}</div>
              {k.hint && <div className="mt-2 border-t border-white/[.08] pt-2 text-[11.5px] text-[color:var(--on-surface-faint)]">{k.hint}</div>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-xl border border-border p-5" style={{ background: 'var(--surface)' }}>
            <h2 className="mb-3.5 font-display text-[17px] font-semibold">Funil de conversão</h2>
            {(stats?.funnel || []).map((s) => (
              <div key={s.key} className="flex items-center gap-3 py-2">
                <span className="w-[92px] flex-shrink-0 text-[13px] text-muted-foreground">{FUNNEL_STEP_LABEL[s.key] || s.key}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-3"
                    style={{ width: `${Math.max(2, (s.count / maxFunnel) * 100)}%`, background: 'var(--brand-grad, var(--brand-500))' }}
                  />
                </div>
                <span className="w-[64px] flex-shrink-0 text-right text-[13px] tabular-nums text-[color:var(--on-surface-faint)]">{fmtN(s.count)} · {s.pct}%</span>
              </div>
            ))}
            {!stats?.funnel.length && !loadingStats && <p className="text-[13px] text-[color:var(--on-surface-faint)]">Sem dados ainda.</p>}
          </div>

          <div className="rounded-xl border border-border p-5" style={{ background: 'var(--surface)' }}>
            <h2 className="mb-3.5 font-display text-[17px] font-semibold">Novos leads · 14 dias</h2>
            {stats?.daily.length ? (
              <div className="flex h-[110px] items-end gap-1.5">
                {stats.daily.map((d) => (
                  <div key={d.day} className="group relative flex-1 rounded-t" style={{ background: 'var(--surface-2)', height: '100%' }} title={`${d.day}: ${fmtN(d.n)} leads`}>
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t transition-[height] duration-3"
                      style={{ height: `${Math.max(4, (d.n / maxDaily) * 100)}%`, background: 'var(--brand-grad, var(--brand-500))' }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[color:var(--on-surface-faint)]">Sem dados.</p>
            )}
          </div>
        </div>
      </div>

      {drawerId && (
        <FunnelDrawer
          funnelId={drawerId}
          onClose={() => setDrawerId(null)}
          onChanged={() => { refreshFunnels(); refreshStats(); }}
        />
      )}
    </div>
  );
}
