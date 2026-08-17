import { api } from '@/lib/api';

export type FunnelStatus = 'draft' | 'published';

export type FunnelSummary = {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: FunnelStatus;
  created_at: string;
  updated_at: string;
  has_stripe: 0 | 1;
  lead_count: number;
  purchase_count: number;
};

export type FunnelDetail = {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: FunnelStatus;
  config: any;
  post_purchase_url: string | null;
  stripe_price_id: string | null;
  stripe_publishable_key: string | null;
  has_stripe_secret: boolean;
  has_stripe_webhook: boolean;
  fb_pixel_id: string | null;
  has_fb_token: boolean;
  created_at: string;
  updated_at: string;
};

export type FunnelPatch = Partial<{
  name: string;
  status: FunnelStatus;
  slug: string;
  post_purchase_url: string;
  config: any;
  stripe_price_id: string;
  stripe_publishable_key: string;
  stripe_secret_key: string;
  stripe_webhook_secret: string;
  fb_pixel_id: string;
  fb_access_token: string;
}>;

export const listFunnels = () => api<{ results: FunnelSummary[] }>('funnels');

export const createFunnel = (b: { name?: string; type?: string; slug: string }) =>
  api<{ id: string; slug: string; type: string }>('funnels', { method: 'POST', body: JSON.stringify(b) });

export const getFunnel = (id: string) => api<FunnelDetail>(`funnels/${id}`);

export const updateFunnel = (id: string, patch: FunnelPatch) =>
  api<{ ok: true }>(`funnels/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteFunnel = (id: string) => api<{ ok: true }>(`funnels/${id}`, { method: 'DELETE' });

export type FunnelStats = {
  total: number;
  byState: Record<string, number>;
  funnel: Array<{ key: 'started' | 'lead' | 'offer' | 'checkout' | 'purchased'; count: number; pct: number }>;
  conversion: { lead_rate: number; offer_rate: number; checkout_rate: number; purchase_rate: number };
  questions: Array<{ key: string; users: number }>;
  utm: Array<{ source: string; leads: number; purchases: number }>;
  daily: Array<{ day: string; n: number; purchases: number; revenue: number }>;
  revenue: Array<{ currency: string; total: number; n: number }>;
  byFunnel: Array<{ funnel_id: string; name: string; leads: number; purchases: number; revenue: number; currency: string; cvr: number }>;
  scopedToFunnel: boolean;
};

export const getStats = (params: { funnelId?: string; days?: number } = {}) => {
  const qs = new URLSearchParams();
  if (params.funnelId) qs.set('funnelId', params.funnelId);
  if (params.days) qs.set('days', String(params.days));
  const q = qs.toString();
  return api<FunnelStats>(`crm/stats${q ? '?' + q : ''}`);
};
