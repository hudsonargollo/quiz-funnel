import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useBuilderStore } from '@/store/builderStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function TopBar({ onGenerateCopy }: { onGenerateCopy: () => void }) {
  const navigate = useNavigate();
  const name = useBuilderStore((s) => s.name);
  const slug = useBuilderStore((s) => s.slug);
  const setName = useBuilderStore((s) => s.setName);
  const dirty = useBuilderStore((s) => s.dirty);
  const saving = useBuilderStore((s) => s.saving);
  const save = useBuilderStore((s) => s.save);

  function handleBack() {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    navigate('/');
  }

  async function handleSave() {
    try {
      await save();
      toast.success('Saved');
    } catch (e: any) {
      toast.error(String(e.message || e));
    }
  }

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3" style={{ background: 'var(--surface)' }}>
      <Button variant="ghost" size="icon" onClick={handleBack} title="Back">
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <span className="font-display text-sm font-semibold text-muted-foreground">Builder</span>
      <Input
        className="ml-1 h-8 max-w-xs"
        placeholder="Funnel name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex-1" />
      {slug && (
        <Button variant="ghost" size="sm" asChild>
          <a href={`${location.origin}/${slug}`} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </a>
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onGenerateCopy}>
        <Sparkles className="h-3.5 w-3.5" /> Generate copy (AI)
      </Button>
      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
