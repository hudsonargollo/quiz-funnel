/**
 * Internal project-management module: milestones/tasks for the Tektone Funnels
 * product roadmap itself. hudson@tektone.com.br (role 'owner') can tick tasks;
 * everyone else on the account (role 'viewer') can only read + comment.
 */
import { json, err } from '../_lib/http.js';
import { randomId } from '../_lib/crypto.js';

async function currentUser(db, userId) {
  return db.prepare('SELECT id, email, role FROM users WHERE id = ?').bind(userId).first();
}

export async function handleMilestones(db, env, request, path, url, acc, userId) {
  const me = await currentUser(db, userId);
  if (!me) return err('Unauthorized', 401);
  const isAdmin = me.role === 'owner';

  // GET /api/milestones — overview list with progress
  if (path === '/api/milestones' && request.method === 'GET') {
    const rows = await db.prepare(
      'SELECT id, slug, order_index, title, timeline, objective, deliverable, icon FROM milestones WHERE account_id = ? ORDER BY order_index ASC'
    ).bind(acc).all();
    const milestones = rows.results || [];
    const taskRows = await db.prepare(
      'SELECT milestone_id, done, COUNT(*) AS n FROM milestone_tasks WHERE account_id = ? GROUP BY milestone_id, done'
    ).bind(acc).all();
    const counts = {};
    for (const r of taskRows.results || []) {
      counts[r.milestone_id] = counts[r.milestone_id] || { total: 0, done: 0 };
      counts[r.milestone_id].total += r.n;
      if (r.done) counts[r.milestone_id].done += r.n;
    }
    const out = milestones.map(m => {
      const c = counts[m.id] || { total: 0, done: 0 };
      return { ...m, totalTasks: c.total, doneTasks: c.done, progress: c.total ? Math.round((c.done / c.total) * 100) : 0 };
    });
    return json({ results: out, isAdmin, me: { email: me.email, role: me.role } });
  }

  // GET /api/milestones/:slug — detail (tasks grouped by category + comments)
  const dm = path.match(/^\/api\/milestones\/([^/]+)$/);
  if (dm && request.method === 'GET') {
    const slug = dm[1];
    const m = await db.prepare('SELECT * FROM milestones WHERE account_id = ? AND slug = ?').bind(acc, slug).first();
    if (!m) return err('Not found', 404);
    const tasks = await db.prepare(
      'SELECT id, category, title, order_index, done, done_at FROM milestone_tasks WHERE milestone_id = ? ORDER BY order_index ASC'
    ).bind(m.id).all();
    const comments = await db.prepare(
      'SELECT id, user_email, body, created_at FROM milestone_comments WHERE milestone_id = ? ORDER BY created_at ASC'
    ).bind(m.id).all();
    const list = tasks.results || [];
    const total = list.length;
    const done = list.filter(t => t.done).length;
    const categories = [];
    for (const t of list) {
      let cat = categories.find(c => c.name === t.category);
      if (!cat) { cat = { name: t.category, tasks: [] }; categories.push(cat); }
      cat.tasks.push({ id: t.id, title: t.title, done: !!t.done, done_at: t.done_at });
    }
    return json({
      milestone: { id: m.id, slug: m.slug, order_index: m.order_index, title: m.title, timeline: m.timeline, objective: m.objective, deliverable: m.deliverable, icon: m.icon },
      categories, progress: total ? Math.round((done / total) * 100) : 0, totalTasks: total, doneTasks: done,
      comments: comments.results || [],
      isAdmin, me: { email: me.email, role: me.role },
    });
  }

  // PATCH /api/milestones/tasks/:taskId — toggle done (admin only)
  const tm = path.match(/^\/api\/milestones\/tasks\/([^/]+)$/);
  if (tm && request.method === 'PATCH') {
    if (!isAdmin) return err('Only the project admin can update tasks', 403);
    const taskId = tm[1];
    const task = await db.prepare('SELECT id FROM milestone_tasks WHERE account_id = ? AND id = ?').bind(acc, taskId).first();
    if (!task) return err('Not found', 404);
    const b = await request.json().catch(() => ({}));
    const done = !!b.done;
    const ts = new Date().toISOString();
    await db.prepare('UPDATE milestone_tasks SET done = ?, done_at = ?, updated_at = ? WHERE account_id = ? AND id = ?')
      .bind(done ? 1 : 0, done ? ts : null, ts, acc, taskId).run();
    return json({ ok: true, done });
  }

  // POST /api/milestones/:slug/comments — any authenticated account member
  const cm = path.match(/^\/api\/milestones\/([^/]+)\/comments$/);
  if (cm && request.method === 'POST') {
    const slug = cm[1];
    const m = await db.prepare('SELECT id FROM milestones WHERE account_id = ? AND slug = ?').bind(acc, slug).first();
    if (!m) return err('Not found', 404);
    const b = await request.json().catch(() => ({}));
    const body = String(b.body || '').trim();
    if (!body) return err('Comment cannot be empty', 400);
    if (body.length > 4000) return err('Comment is too long', 400);
    const id = randomId('cmt');
    const ts = new Date().toISOString();
    await db.prepare(
      'INSERT INTO milestone_comments (id, milestone_id, account_id, user_id, user_email, body, created_at) VALUES (?,?,?,?,?,?,?)'
    ).bind(id, m.id, acc, me.id, me.email, body, ts).run();
    return json({ id, user_email: me.email, body, created_at: ts }, 201);
  }

  // DELETE /api/milestones/comments/:commentId — admin or the comment's own author
  const dcm = path.match(/^\/api\/milestones\/comments\/([^/]+)$/);
  if (dcm && request.method === 'DELETE') {
    const commentId = dcm[1];
    const c = await db.prepare('SELECT id, user_id FROM milestone_comments WHERE account_id = ? AND id = ?').bind(acc, commentId).first();
    if (!c) return err('Not found', 404);
    if (!isAdmin && c.user_id !== me.id) return err('Forbidden', 403);
    await db.prepare('DELETE FROM milestone_comments WHERE account_id = ? AND id = ?').bind(acc, commentId).run();
    return json({ ok: true });
  }

  return err('Not found', 404);
}
