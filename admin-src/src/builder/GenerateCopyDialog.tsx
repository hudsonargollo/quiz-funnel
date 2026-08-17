import { useEffect, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useBuilderStore } from '@/store/builderStore';
import { aiApi } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

// Ports bQuizCopy/bQuizCopyRun from the legacy builder: fills in-memory screen
// copy for review in the preview/property panel — it never auto-saves, the
// user still has to hit the top bar's Save (or discard by navigating away).
export default function GenerateCopyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const id = useBuilderStore((s) => s.id);
  const screens = useBuilderStore((s) => s.screens);
  const [framework, setFramework] = useState('generic');
  const [state, setState] = useState<'idle' | 'checking' | 'ready' | 'locked' | 'generating'>('idle');
  const [cost, setCost] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setState('checking');
    aiApi<{ enabled: boolean; costs: Record<string, number> }>('addon')
      .then((addon) => {
        if (!addon.enabled) {
          setState('locked');
          return;
        }
        setCost(addon.costs?.quiz_copy ?? null);
        setState('ready');
      })
      .catch((e) => {
        toast.error(String(e.message || e));
        onOpenChange(false);
      });
  }, [open]);

  async function run() {
    if (!id) return;
    setState('generating');
    try {
      const r = await aiApi<{ screens?: { id: string; fields: Record<string, any> }[] }>('funnels/' + id + '/quiz-copy', {
        method: 'POST',
        body: JSON.stringify({ framework }),
      });
      const byId = new Map(screens.map((s) => [(s as any).id ?? (s as any).key, s]));
      let applied = 0;
      (r.screens || []).forEach((g) => {
        const s = byId.get(g.id);
        if (s) {
          Object.assign(s, g.fields);
          applied++;
        }
      });
      if (applied) {
        useBuilderStore.setState({ screens: [...screens], dirty: true });
        toast.success(`Updated ${applied} screen${applied === 1 ? '' : 's'} — review, then Save.`);
      } else {
        toast.message('No matching screens to update.');
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(String(e.message || e));
    } finally {
      setState('ready');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Generate copy (AI)
          </DialogTitle>
          <DialogDescription>
            Rewrites headlines, questions and bullets across the funnel. Fills the builder in-memory only — nothing
            saves until you review and hit Save.
          </DialogDescription>
        </DialogHeader>

        {state === 'checking' && <p className="text-sm text-muted-foreground">Checking AI Ads add-on…</p>}
        {state === 'locked' && <p className="text-sm text-muted-foreground">AI copy generation isn't enabled for this account.</p>}

        {(state === 'ready' || state === 'generating') && (
          <div>
            <Label>Copy framework</Label>
            <Select value={framework} onValueChange={setFramework}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="generic">Generic</SelectItem>
                <SelectItem value="pas">PAS (Problem-Agitate-Solve)</SelectItem>
                <SelectItem value="paso">PASO</SelectItem>
                <SelectItem value="aida">AIDA</SelectItem>
              </SelectContent>
            </Select>
            <Button className="mt-4 w-full" onClick={run} disabled={state === 'generating'}>
              {state === 'generating' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate{cost != null ? ` (${cost} credits)` : ''}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
