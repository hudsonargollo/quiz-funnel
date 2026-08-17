import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Copy, Eye, EyeOff, ExternalLink, LayoutGrid, Loader2, TriangleAlert, X } from 'lucide-react';
import { getFunnel, updateFunnel, type FunnelDetail, type FunnelStatus } from '@/lib/funnels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const PLATFORM_ORIGIN = 'https://offers.clubemkt.digital';
const TABS = ['overview', 'payments', 'advanced'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { overview: 'Visão geral', payments: 'Pagamentos', advanced: 'Avançado' };

export default function FunnelDrawer({ funnelId, onClose, onChanged }: { funnelId: string; onClose: () => void; onChanged: () => void }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Tab | null>(null);
  const [f, setF] = useState<FunnelDetail | null>(null);
  const [copied, setCopied] = useState(false);
  const [revealSecret, setRevealSecret] = useState(false);

  // Local editable state, seeded from the loaded funnel.
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [postPurchaseUrl, setPostPurchaseUrl] = useState('');
  const [pubKey, setPubKey] = useState('');
  const [priceId, setPriceId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [configText, setConfigText] = useState('');
  const [configError, setConfigError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFunnel(funnelId)
      .then((d) => {
        if (cancelled) return;
        setF(d);
        setName(d.name);
        setSlug(d.slug);
        setPostPurchaseUrl(d.post_purchase_url || '');
        setPubKey(d.stripe_publishable_key || '');
        setPriceId(d.stripe_price_id || '');
        setConfigText(JSON.stringify(d.config, null, 2));
      })
      .catch((e) => toast.error(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [funnelId]);

  async function setStatus(status: FunnelStatus) {
    if (!f) return;
    setF({ ...f, status });
    try {
      await updateFunnel(funnelId, { status });
      toast.success(status === 'published' ? 'Funil publicado' : 'Funil voltou a rascunho');
      onChanged();
    } catch (e: any) {
      setF({ ...f, status: f.status });
      toast.error(String(e.message || e));
    }
  }

  async function saveOverview() {
    setSaving('overview');
    try {
      await updateFunnel(funnelId, { name, slug, post_purchase_url: postPurchaseUrl });
      toast.success('Alterações guardadas');
      onChanged();
    } catch (e: any) {
      toast.error(String(e.message || e));
    } finally {
      setSaving(null);
    }
  }

  async function savePayments() {
    setSaving('payments');
    try {
      const patch: Record<string, string> = { stripe_publishable_key: pubKey, stripe_price_id: priceId };
      if (secretKey) patch.stripe_secret_key = secretKey;
      if (webhookSecret) patch.stripe_webhook_secret = webhookSecret;
      await updateFunnel(funnelId, patch);
      setSecretKey('');
      setWebhookSecret('');
      const fresh = await getFunnel(funnelId);
      setF(fresh);
      toast.success('Definições de pagamento guardadas');
    } catch (e: any) {
      toast.error(String(e.message || e));
    } finally {
      setSaving(null);
    }
  }

  async function saveAdvanced() {
    let parsed: any;
    try {
      parsed = JSON.parse(configText);
      setConfigError('');
    } catch {
      setConfigError('JSON inválido — corrija antes de guardar.');
      return;
    }
    setSaving('advanced');
    try {
      await updateFunnel(funnelId, { config: parsed });
      toast.success('Configuração avançada guardada');
      onChanged();
    } catch (e: any) {
      toast.error(String(e.message || e));
    } finally {
      setSaving(null);
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(`${PLATFORM_ORIGIN}/${slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-[420px] max-w-[92vw] flex-col border-l border-border shadow-e4" style={{ background: 'var(--surface-3)' }}>
        <div className="flex-shrink-0 px-6 pt-6">
          <div className="mb-3.5 flex items-start justify-between">
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[color:var(--on-surface-faint)]">Inspetor de funil</p>
              <h3 className="font-display text-[22px] font-semibold capitalize">{loading ? '…' : f?.name}</h3>
            </div>
            <button onClick={onClose} className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex flex-shrink-0 gap-5 border-b border-border px-6">
          {TABS.map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className="border-b-2 py-2.5 text-[13px] font-semibold transition-colors duration-2"
              style={tab === tb ? { borderColor: 'var(--brand-500)', color: 'var(--brand-soft)' } : { borderColor: 'transparent', color: 'var(--on-surface-faint)' }}
            >
              {TAB_LABEL[tb]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading || !f ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <>
              {tab === 'overview' && (
                <div className="flex flex-col gap-4">
                  <div>
                    <Label>Nome</Label>
                    <Input className="capitalize" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div>
                    <Label>Slug</Label>
                    <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
                    <p className="mt-1.5 text-[12px] text-[color:var(--on-surface-faint)]">{PLATFORM_ORIGIN.replace('https://', '')}/{slug || '…'}</p>
                  </div>

                  <div className="rounded-md border border-border p-3.5" style={{ background: 'var(--surface)' }}>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <div className="flex rounded-full border border-border bg-secondary/60 p-0.5">
                        <button
                          onClick={() => setStatus('draft')}
                          className="rounded-full px-2.5 py-1.5 text-[13px] font-semibold transition-colors duration-2"
                          style={f.status === 'draft' ? { background: 'var(--surface)', color: 'var(--warning)', boxShadow: 'var(--e-1)' } : { color: 'var(--on-surface-muted)' }}
                        >
                          Rascunho
                        </button>
                        <button
                          onClick={() => setStatus('published')}
                          className="rounded-full px-2.5 py-1.5 text-[13px] font-semibold transition-colors duration-2"
                          style={f.status === 'published' ? { background: 'var(--surface)', color: 'var(--success)', boxShadow: 'var(--e-1)' } : { color: 'var(--on-surface-muted)' }}
                        >
                          Publicado
                        </button>
                      </div>
                      {f.status === 'draft' && (
                        <button
                          onClick={() => setStatus('published')}
                          className="flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold"
                          style={{ background: 'var(--success)', color: '#04241a' }}
                        >
                          <Check className="h-3 w-3" strokeWidth={3} /> Publicar
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-[color:var(--on-surface-faint)]">
                      {f.status === 'published'
                        ? 'Este funil está publicado e disponível na URL pública.'
                        : 'Este funil ainda não está visível ao público. Publique para ativar a URL.'}
                    </p>
                  </div>

                  <div className="relative">
                    <Label>URL pública</Label>
                    <Input readOnly value={`${PLATFORM_ORIGIN}/${slug}`} className="pr-10" />
                    <button onClick={copyUrl} className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded text-muted-foreground hover:text-foreground">
                      {copied ? <Check className="h-3.5 w-3.5" style={{ color: 'var(--success)' }} /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  <div>
                    <Label>URL pós-compra <span className="font-normal normal-case text-[color:var(--on-surface-faint)]">(opcional)</span></Label>
                    <Input placeholder="https://…" value={postPurchaseUrl} onChange={(e) => setPostPurchaseUrl(e.target.value)} />
                  </div>

                  <Button onClick={saveOverview} disabled={saving === 'overview'} className="w-full">
                    {saving === 'overview' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
                  </Button>

                  <div className="my-0.5 h-px bg-white/[.08]" />

                  <button
                    onClick={() => navigate(`/builder/${funnelId}`)}
                    className="flex w-full items-center justify-center gap-2 rounded-md py-3 text-[14px] font-semibold text-primary-foreground"
                    style={{ background: 'var(--brand-grad, linear-gradient(135deg,var(--brand-500),var(--brand-soft)))', boxShadow: 'var(--glow-brand)' }}
                  >
                    <LayoutGrid className="h-4 w-4" /> Abrir no editor visual
                  </button>
                </div>
              )}

              {tab === 'payments' && (
                <div className="flex flex-col gap-4">
                  <div
                    className="flex items-center gap-3 rounded-md border p-3.5"
                    style={
                      f.has_stripe_secret
                        ? { background: 'var(--primary-container)', borderColor: 'transparent' }
                        : { background: 'var(--warning-container, rgba(251,191,36,.10))', borderColor: 'rgba(251,191,36,.25)' }
                    }
                  >
                    <div className="grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-md bg-black/15" style={{ color: f.has_stripe_secret ? 'var(--on-primary-container)' : 'var(--warning)' }}>
                      <TriangleAlert className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <b className="block text-[13px]">{f.has_stripe_secret ? 'Stripe conectado' : 'Stripe não conectado'}</b>
                      <span className="text-[12px] text-muted-foreground">
                        {f.has_stripe_secret ? 'Este funil já pode receber pagamentos.' : 'Este funil ainda não pode receber pagamentos.'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <Label>Chave publicável</Label>
                    <Input value={pubKey} onChange={(e) => setPubKey(e.target.value)} placeholder="pk_live_…" />
                  </div>

                  <div className="relative">
                    <Label>Chave secreta {f.has_stripe_secret && <span className="font-normal normal-case text-[color:var(--on-surface-faint)]">(já configurada — deixe em branco para manter)</span>}</Label>
                    <Input
                      type={revealSecret ? 'text' : 'password'}
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      placeholder={f.has_stripe_secret ? '••••••••••••••••' : 'sk_live_…'}
                      className="pr-10"
                    />
                    <button onClick={() => setRevealSecret((v) => !v)} className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded text-muted-foreground hover:text-foreground">
                      {revealSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  <div>
                    <Label>Webhook secret {f.has_stripe_webhook && <span className="font-normal normal-case text-[color:var(--on-surface-faint)]">(já configurado)</span>}</Label>
                    <Input type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder={f.has_stripe_webhook ? '••••••••••••••••' : 'whsec_…'} />
                  </div>

                  <div>
                    <Label>Price ID</Label>
                    <Input value={priceId} onChange={(e) => setPriceId(e.target.value)} placeholder="price_…" />
                  </div>

                  <p className="text-[12px] text-[color:var(--on-surface-faint)]">
                    Precisa das suas chaves?{' '}
                    <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[color:var(--brand-soft)]">
                      Encontre-as no Stripe Dashboard <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>

                  <Button onClick={savePayments} disabled={saving === 'payments'} className="w-full">
                    {saving === 'payments' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
                  </Button>
                </div>
              )}

              {tab === 'advanced' && (
                <div className="flex flex-col gap-4">
                  <div className="flex gap-2.5 rounded-md border p-3 text-[12.5px] leading-relaxed" style={{ background: 'var(--warning-container, rgba(251,191,36,.10))', borderColor: 'rgba(251,191,36,.25)', color: '#f0d78c' }}>
                    <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0 translate-y-px" style={{ color: 'var(--warning)' }} />
                    <span>Edição direta do JSON pode quebrar este funil. Use apenas se souber o que está a fazer — as outras abas cobrem os campos mais comuns com segurança.</span>
                  </div>
                  <Textarea
                    value={configText}
                    onChange={(e) => setConfigText(e.target.value)}
                    rows={16}
                    className="font-mono text-[12px] leading-relaxed"
                  />
                  {configError && <p className="text-[12px]" style={{ color: 'var(--danger)' }}>{configError}</p>}
                  <Button onClick={saveAdvanced} disabled={saving === 'advanced'} className="w-full">
                    {saving === 'advanced' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar configuração'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
