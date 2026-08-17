import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Link2, Loader2, RefreshCw, Sparkles, Trash2, Unplug } from 'lucide-react';
import {
  listOffers, deleteOffer, convertOffer, hotmartStatus, hotmartConnect, hotmartDisconnect, hotmartSync, clickbankImport,
  type DiscoveredOffer,
} from '@/lib/offers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

function fmtMoney(price: number | null, currency: string | null) {
  if (price == null) return null;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'USD').toUpperCase() }).format(price);
  } catch {
    return `${price} ${currency || ''}`;
  }
}

function HotmartCard({ onSynced }: { onSynced: () => void }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [basicToken, setBasicToken] = useState('');
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | null>(null);

  const refresh = () =>
    hotmartStatus()
      .then((s) => {
        setConnected(s.connected);
        setLastSyncedAt(s.lastSyncedAt);
      })
      .catch(() => setConnected(false));

  useEffect(() => {
    refresh();
  }, []);

  async function connect() {
    if (!clientId || !clientSecret || !basicToken) {
      toast.error('Client ID, Client Secret and Basic Token are all required.');
      return;
    }
    setBusy('connect');
    try {
      await hotmartConnect({ clientId, clientSecret, basicToken });
      toast.success('Hotmart connected');
      setClientId('');
      setClientSecret('');
      setBasicToken('');
      await refresh();
    } catch (e: any) {
      toast.error(String(e.message || e));
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setBusy('sync');
    try {
      const r = await hotmartSync();
      toast.success(`Synced ${r.synced} product${r.synced === 1 ? '' : 's'} from Hotmart`);
      await refresh();
      onSynced();
    } catch (e: any) {
      toast.error(String(e.message || e));
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    try {
      await hotmartDisconnect();
      toast.success('Hotmart disconnected');
      await refresh();
    } catch (e: any) {
      toast.error(String(e.message || e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5" style={{ background: 'var(--surface)' }}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">Hotmart</h3>
        {connected != null && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={
              connected
                ? { background: 'var(--primary-container)', color: 'var(--on-primary-container)' }
                : { background: 'var(--surface-2)', color: 'var(--on-surface-muted)' }
            }
          >
            {connected ? 'Connected' : 'Not connected'}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Pulls products from your own Hotmart affiliate account (there's no public marketplace-search API — this uses
        the app credentials you generate under Hotmart &rarr; Tools &rarr; Manage Credentials).
      </p>

      {connected ? (
        <div className="mt-4 space-y-2">
          {lastSyncedAt && <p className="text-[11px] text-muted-foreground">Last synced {new Date(lastSyncedAt).toLocaleString()}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={sync} disabled={busy === 'sync'}>
              {busy === 'sync' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync products
            </Button>
            <Button size="sm" variant="ghost" onClick={disconnect} disabled={busy === 'disconnect'}>
              <Unplug className="h-3.5 w-3.5" /> Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <Label>Client ID</Label>
            <Input value={clientId} onChange={(e) => setClientId(e.target.value)} />
          </div>
          <div>
            <Label>Client Secret</Label>
            <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
          </div>
          <div>
            <Label>Basic Token</Label>
            <Input type="password" value={basicToken} onChange={(e) => setBasicToken(e.target.value)} />
          </div>
          <Button size="sm" className="w-full" onClick={connect} disabled={busy === 'connect'}>
            {busy === 'connect' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Connect Hotmart
          </Button>
        </div>
      )}
    </div>
  );
}

function ClickbankCard({ onImported }: { onImported: () => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function importUrl() {
    if (!url.trim()) {
      toast.error('Paste a sales-page URL first.');
      return;
    }
    setBusy(true);
    try {
      await clickbankImport(url.trim());
      toast.success('Imported');
      setUrl('');
      onImported();
    } catch (e: any) {
      toast.error(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5" style={{ background: 'var(--surface)' }}>
      <h3 className="font-display text-sm font-semibold">ClickBank</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        ClickBank has no public search API and its marketplace ToS treats scraping as a gray area, so this doesn't
        crawl it — paste a sales-page link you found in ClickBank's own marketplace and we'll preview it here.
      </p>
      <div className="mt-4 flex gap-2">
        <Input placeholder="https://example.hop.clickbank.net/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button size="sm" onClick={importUrl} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
          Import
        </Button>
      </div>
    </div>
  );
}

function OfferCard({ offer, onChanged }: { offer: DiscoveredOffer; onChanged: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'convert' | 'delete' | null>(null);
  const price = fmtMoney(offer.price, offer.currency);

  async function convert() {
    setBusy('convert');
    try {
      const r = await convertOffer(offer.id);
      toast.success('Funnel created');
      navigate(`/builder/${r.funnelId}`);
    } catch (e: any) {
      toast.error(String(e.message || e));
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('delete');
    try {
      await deleteOffer(offer.id);
      onChanged();
    } catch (e: any) {
      toast.error(String(e.message || e));
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface p-4" style={{ background: 'var(--surface)' }}>
      <div className="flex items-start justify-between gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
          style={{ background: 'var(--surface-2)', color: 'var(--on-surface-muted)' }}
        >
          {offer.network}
        </span>
        <button onClick={remove} disabled={busy === 'delete'} className="text-muted-foreground/60 hover:text-destructive">
          {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
      {offer.image_url && (
        <img src={offer.image_url} alt="" className="mt-3 h-28 w-full rounded-md object-cover" style={{ background: 'var(--surface-2)' }} />
      )}
      <div className="mt-3 flex-1">
        <div className="truncate text-sm font-medium">{offer.name || 'Untitled offer'}</div>
        {offer.vendor && <div className="truncate text-xs text-muted-foreground">{offer.vendor}</div>}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {price && <span>{price}</span>}
          {offer.commission_pct != null && <span>{offer.commission_pct}% commission</span>}
          {offer.gravity != null && <span>gravity {offer.gravity}</span>}
        </div>
      </div>
      {offer.funnel_id ? (
        <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate(`/builder/${offer.funnel_id}`)}>
          Open funnel
        </Button>
      ) : (
        <Button size="sm" className="mt-3" onClick={convert} disabled={busy === 'convert'}>
          {busy === 'convert' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Convert to funnel
        </Button>
      )}
    </div>
  );
}

export default function OffersPage() {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<DiscoveredOffer[] | null>(null);

  const refresh = () => listOffers().then((r) => setOffers(r.results)).catch((e) => toast.error(String(e.message || e)));

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="font-display text-xl font-semibold">Offer Finder</h1>
          <p className="text-sm text-muted-foreground">Capture offers from Hotmart and ClickBank, then spin up a funnel in one click.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <HotmartCard onSynced={refresh} />
        <ClickbankCard onImported={refresh} />
      </div>

      <Separator className="my-8" />

      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Saved offers</h2>
      {offers == null ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : offers.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No offers yet — connect Hotmart or import a ClickBank link above.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((o) => (
            <OfferCard key={o.id} offer={o} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
