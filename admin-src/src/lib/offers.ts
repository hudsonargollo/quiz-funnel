import { api } from '@/lib/api';

export type DiscoveredOffer = {
  id: string;
  network: 'hotmart' | 'clickbank';
  name: string | null;
  vendor: string | null;
  commission_pct: number | null;
  price: number | null;
  currency: string | null;
  gravity: number | null;
  sales_page_url: string | null;
  image_url: string | null;
  funnel_id: string | null;
  created_at: string;
};

export const listOffers = () => api<{ results: DiscoveredOffer[] }>('offers');
export const deleteOffer = (id: string) => api(`offers/${id}`, { method: 'DELETE' });
export const convertOffer = (id: string) => api<{ funnelId: string; slug: string }>(`offers/${id}/convert`, { method: 'POST', body: JSON.stringify({}) });

export const hotmartStatus = () => api<{ connected: boolean; lastSyncedAt: string | null }>('offers/hotmart/status');
export const hotmartConnect = (creds: { clientId: string; clientSecret: string; basicToken: string }) =>
  api('offers/hotmart/connect', { method: 'POST', body: JSON.stringify(creds) });
export const hotmartDisconnect = () => api('offers/hotmart/disconnect', { method: 'POST' });
export const hotmartSync = () => api<{ synced: number }>('offers/hotmart/sync', { method: 'POST' });

export const clickbankImport = (url: string) => api<{ id: string }>('offers/clickbank/import', { method: 'POST', body: JSON.stringify({ url }) });
