import { api } from '@/lib/api';

export type PipelineStatus = 'new' | 'contacted' | 'qualified' | 'won' | 'lost';
export type PipelineSource = 'manual' | 'promoted' | 'video_ad_creator';

export type PipelineLead = {
  id: string;
  lead_user_id: string | null;
  funnel_id: string | null;
  status: PipelineStatus;
  source: PipelineSource;
  name: string | null;
  email: string | null;
  phone: string | null;
  qualification: Record<string, unknown> | null;
  assigned_email: string | null;
  created_at: string;
  updated_at: string;
};

export type PipelineLeadEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  actor_email: string | null;
  created_at: string;
};

export type PipelineSale = {
  id: string;
  pipeline_lead_id: string;
  closer_email: string | null;
  amount: number | null;
  currency: string;
  status: string | null;
  payment_ref: string | null;
  created_at: string;
};

export type PipelineLeadDetail = PipelineLead & { events: PipelineLeadEvent[]; sales: PipelineSale[] };

export type PipelineStats = { total: number; byStatus: Record<PipelineStatus, number> };

export const listPipelineLeads = (status?: PipelineStatus) =>
  api<{ results: PipelineLead[] }>(`pipeline/leads${status ? `?status=${status}` : ''}`);

export const getPipelineLead = (id: string) => api<PipelineLeadDetail>(`pipeline/leads/${id}`);

export const createPipelineLead = (input: {
  leadUserId?: string;
  funnelId?: string;
  name?: string;
  email?: string;
  phone?: string;
  source?: PipelineSource;
}) => api<PipelineLead>('pipeline/leads', { method: 'POST', body: JSON.stringify(input) });

export const updatePipelineLead = (id: string, patch: Partial<Pick<PipelineLead, 'name' | 'email' | 'phone' | 'assigned_email'>> & { qualification?: Record<string, unknown> }) =>
  api<PipelineLeadDetail>(`pipeline/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const setPipelineLeadStatus = (id: string, status: PipelineStatus) =>
  api<PipelineLeadDetail>(`pipeline/leads/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });

export const recordPipelineSale = (id: string, input: { amount?: number; currency?: string; status?: string; paymentRef?: string; closerEmail?: string }) =>
  api<{ id: string }>(`pipeline/leads/${id}/sales`, { method: 'POST', body: JSON.stringify(input) });

export const pipelineStats = () => api<PipelineStats>('pipeline/stats');
