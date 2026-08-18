import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react';
import {
  listPipelineLeads, createPipelineLead, getPipelineLead, updatePipelineLead, setPipelineLeadStatus, recordPipelineSale,
  type PipelineLead, type PipelineLeadDetail, type PipelineStatus,
} from '@/lib/pipeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const COLUMNS: { key: PipelineStatus; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

const SOURCE_LABEL: Record<string, string> = { manual: 'Manual', promoted: 'Promoted', video_ad_creator: 'Video Ad Creator' };

function fmtDate(s: string) {
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
}

function LeadCard({ lead, onOpen, onStatusChange }: { lead: PipelineLead; onOpen: () => void; onStatusChange: (s: PipelineStatus) => void }) {
  return (
    <div
      onClick={onOpen}
      className="cursor-pointer rounded-lg border border-border p-3 transition-colors duration-2 hover:border-[color:var(--outline-strong)]"
      style={{ background: 'var(--surface)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{lead.name || lead.email || 'Untitled lead'}</div>
          {lead.email && lead.name && <div className="truncate text-[11.5px] text-muted-foreground">{lead.email}</div>}
        </div>
        <span
          className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide"
          style={{ background: 'var(--surface-2)', color: 'var(--on-surface-muted)' }}
        >
          {SOURCE_LABEL[lead.source] || lead.source}
        </span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[10.5px] text-[color:var(--on-surface-faint)]">{fmtDate(lead.updated_at)}</span>
        <Select value={lead.status} onValueChange={(v) => onStatusChange(v as PipelineStatus)}>
          <SelectTrigger className="h-6 w-auto gap-1 border-none bg-transparent px-1.5 py-0 text-[11px] shadow-none" onClick={(e) => e.stopPropagation()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent onClick={(e) => e.stopPropagation()}>
            {COLUMNS.map((c) => (
              <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function NewLeadDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() && !email.trim()) {
      toast.error('Enter at least a name or email.');
      return;
    }
    setBusy(true);
    try {
      await createPipelineLead({ name: name.trim() || undefined, email: email.trim() || undefined, phone: phone.trim() || undefined });
      toast.success('Lead added to the pipeline');
      setName(''); setEmail(''); setPhone('');
      onOpenChange(false);
      onCreated();
    } catch (e: any) {
      toast.error(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New pipeline lead</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <Button onClick={submit} disabled={busy} className="mt-1 w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add lead'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeadDetail({ leadId, onClose, onChanged }: { leadId: string; onClose: () => void; onChanged: () => void }) {
  const [loading, setLoading] = useState(true);
  const [l, setL] = useState<PipelineLeadDetail | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [assignedEmail, setAssignedEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saleAmount, setSaleAmount] = useState('');
  const [savingSale, setSavingSale] = useState(false);

  function load() {
    setLoading(true);
    getPipelineLead(leadId)
      .then((d) => {
        setL(d);
        setName(d.name || '');
        setEmail(d.email || '');
        setPhone(d.phone || '');
        setAssignedEmail(d.assigned_email || '');
        setNotes(d.qualification ? JSON.stringify(d.qualification, null, 2) : '');
      })
      .catch((e) => toast.error(String(e.message || e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [leadId]);

  async function save() {
    setSaving(true);
    try {
      let qualification: Record<string, unknown> | undefined;
      if (notes.trim()) {
        try { qualification = JSON.parse(notes); } catch { qualification = { notes }; }
      }
      await updatePipelineLead(leadId, { name, email, phone, assigned_email: assignedEmail, qualification });
      toast.success('Saved');
      load();
      onChanged();
    } catch (e: any) {
      toast.error(String(e.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function recordSale() {
    const amount = parseFloat(saleAmount);
    if (!amount) { toast.error('Enter a sale amount.'); return; }
    setSavingSale(true);
    try {
      await recordPipelineSale(leadId, { amount, currency: 'USD' });
      toast.success('Sale recorded');
      setSaleAmount('');
      load();
    } catch (e: any) {
      toast.error(String(e.message || e));
    } finally {
      setSavingSale(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-[420px] max-w-[92vw] flex-col border-l border-border shadow-e4" style={{ background: 'var(--surface-3)' }}>
        <div className="flex-shrink-0 px-6 pt-6">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[color:var(--on-surface-faint)]">Pipeline lead</p>
              <h3 className="font-display text-[19px] font-semibold">{loading ? '…' : (l?.name || l?.email || 'Untitled lead')}</h3>
            </div>
            <button onClick={onClose} className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading || !l ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <Label>Assigned to</Label>
                <Input placeholder="teammate@…" value={assignedEmail} onChange={(e) => setAssignedEmail(e.target.value)} />
              </div>
              <div>
                <Label>Qualification notes</Label>
                <Textarea rows={5} placeholder="Free-form notes, budget, timeline…" value={notes} onChange={(e) => setNotes(e.target.value)} className="font-mono text-[12px]" />
              </div>
              <Button onClick={save} disabled={saving} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>

              <div className="my-0.5 h-px bg-white/[.08]" />

              <div className="rounded-md border border-border p-3.5" style={{ background: 'var(--surface)' }}>
                <p className="mb-2 text-[12px] font-semibold">Record a sale</p>
                <div className="flex gap-2">
                  <Input placeholder="Amount (USD)" type="number" value={saleAmount} onChange={(e) => setSaleAmount(e.target.value)} />
                  <Button size="sm" onClick={recordSale} disabled={savingSale}>
                    {savingSale ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Record'}
                  </Button>
                </div>
                {l.sales.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {l.sales.map((s) => (
                      <div key={s.id} className="flex justify-between text-[12px] text-muted-foreground">
                        <span>{s.amount != null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: s.currency }).format(s.amount) : '—'}</span>
                        <span>{fmtDate(s.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[color:var(--on-surface-faint)]">Timeline</p>
                <div className="space-y-2">
                  {l.events.length === 0 && <p className="text-[12px] text-muted-foreground">No events yet.</p>}
                  {l.events.map((e) => (
                    <div key={e.id} className="flex items-start justify-between gap-2 text-[12px]">
                      <span>{e.type.replace(/_/g, ' ')}</span>
                      <span className="flex-shrink-0 text-[color:var(--on-surface-faint)]">{fmtDate(e.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export default function PipelinePage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<PipelineLead[] | null>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const refresh = () => listPipelineLeads().then((r) => setLeads(r.results)).catch((e) => toast.error(String(e.message || e)));

  useEffect(() => { refresh(); }, []);

  async function changeStatus(id: string, status: PipelineStatus) {
    setLeads((prev) => prev && prev.map((l) => (l.id === id ? { ...l, status } : l)));
    try {
      await setPipelineLeadStatus(id, status);
    } catch (e: any) {
      toast.error(String(e.message || e));
      refresh();
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="font-display text-xl font-semibold">Sales Pipeline</h1>
          <p className="text-sm text-muted-foreground">Work leads by hand from first contact to close.</p>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New lead
        </Button>
      </div>

      {leads == null ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {COLUMNS.map((col) => {
            const colLeads = leads.filter((l) => l.status === col.key);
            return (
              <div key={col.key} className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{col.label}</span>
                  <span className="text-[11px] text-[color:var(--on-surface-faint)]">{colLeads.length}</span>
                </div>
                <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-2" style={{ minHeight: 80 }}>
                  {colLeads.length === 0 && <p className="py-3 text-center text-[11.5px] text-[color:var(--on-surface-faint)]">Empty</p>}
                  {colLeads.map((l) => (
                    <LeadCard key={l.id} lead={l} onOpen={() => setOpenLeadId(l.id)} onStatusChange={(s) => changeStatus(l.id, s)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openLeadId && <LeadDetail leadId={openLeadId} onClose={() => setOpenLeadId(null)} onChanged={refresh} />}
      <NewLeadDialog open={newOpen} onOpenChange={setNewOpen} onCreated={refresh} />
    </div>
  );
}
