/**
 * Sales Pipeline endpoints (/api/pipeline/*). Mounted from handleAdmin after
 * the session resolves, same owner-only gate as the other admin routes. Kept
 * distinct from the read-only /api/crm/* analytics routes — this is the
 * human-worked overlay, not the automated funnel pipeline.
 */
import { json, err } from '../_lib/http.js';
import {
  createPipelineLead, listPipelineLeads, getPipelineLead, updatePipelineLead,
  setPipelineLeadStatus, recordPipelineSale, pipelineStats,
} from '../_lib/pipeline.js';

export async function handlePipeline(db, env, request, path, url, acc, actorEmail) {
  if (path === '/api/pipeline/leads' && request.method === 'GET') {
    const status = url.searchParams.get('status') || undefined;
    return json({ results: await listPipelineLeads(db, acc, { status }) });
  }

  if (path === '/api/pipeline/leads' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const r = await createPipelineLead(db, acc, b, actorEmail);
    return r.error ? err(r.error, r.status) : json(r, 201);
  }

  if (path === '/api/pipeline/stats' && request.method === 'GET') {
    return json(await pipelineStats(db, acc));
  }

  const statusMatch = path.match(/^\/api\/pipeline\/leads\/([^/]+)\/status$/);
  if (statusMatch && request.method === 'PATCH') {
    const b = await request.json().catch(() => ({}));
    const r = await setPipelineLeadStatus(db, env, acc, statusMatch[1], b.status, actorEmail);
    return r.error ? err(r.error, r.status) : json(r);
  }

  const salesMatch = path.match(/^\/api\/pipeline\/leads\/([^/]+)\/sales$/);
  if (salesMatch && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const r = await recordPipelineSale(db, acc, salesMatch[1], b, actorEmail);
    return r.error ? err(r.error, r.status) : json(r, 201);
  }

  const leadMatch = path.match(/^\/api\/pipeline\/leads\/([^/]+)$/);
  if (leadMatch) {
    const id = leadMatch[1];
    if (request.method === 'GET') {
      const lead = await getPipelineLead(db, acc, id);
      return lead ? json(lead) : err('Not found', 404);
    }
    if (request.method === 'PATCH') {
      const b = await request.json().catch(() => ({}));
      const r = await updatePipelineLead(db, acc, id, b, actorEmail);
      return r.error ? err(r.error, r.status) : json(r);
    }
  }

  return err('Not found', 404);
}
