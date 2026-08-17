import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Sparkles, Loader2, Check, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [justSaved, setJustSaved] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  function handleBack() {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    navigate('/');
  }

  async function handleSave() {
    try {
      await save();
      toast.success('Saved');
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1600);
    } catch (e: any) {
      toast.error(String(e.message || e));
    }
  }

  const openUrl = slug ? `${location.origin}/${slug}` : null;

  return (
    <div
      className="relative z-30 flex h-12 shrink-0 items-center gap-1.5 border-b border-border bg-surface px-2 lg:h-14 lg:gap-2 lg:px-3"
      style={{ background: 'var(--surface-glass, var(--surface))', backdropFilter: 'blur(10px)' }}
    >
      <Button variant="ghost" size="icon" onClick={handleBack} title="Back" className="h-8 w-8 lg:h-9 lg:w-9">
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <span className="hidden font-display text-sm font-semibold text-muted-foreground lg:inline">Builder</span>
      <div className="relative flex-1 lg:ml-1 lg:max-w-xs lg:flex-none">
        <Input
          className="h-8 w-full lg:h-8"
          placeholder="Funnel name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <AnimatePresence>
          {dirty && !saving && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute -right-1 -top-1 h-2 w-2 rounded-full"
              style={{ background: 'var(--warning, #fbbf24)', boxShadow: '0 0 0 2px var(--surface)' }}
              title="Unsaved changes"
            />
          )}
        </AnimatePresence>
      </div>
      <div className="flex-1 lg:block" />

      {/* Desktop: full actions visible */}
      <div className="hidden items-center gap-1 lg:flex">
        {openUrl && (
          <Button variant="ghost" size="sm" asChild>
            <a href={openUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onGenerateCopy}>
          <Sparkles className="h-3.5 w-3.5" /> Generate copy (AI)
        </Button>
      </div>

      <SaveButton saving={saving} justSaved={justSaved} onClick={handleSave} />

      {/* Mobile: secondary actions collapse behind a hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 lg:hidden"
        onClick={() => setMenuOpen((v) => !v)}
        title="More"
      >
        {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </Button>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
            className="absolute right-2 top-[calc(100%+6px)] z-40 flex w-52 flex-col gap-0.5 rounded-lg border border-border p-1.5 shadow-e3 lg:hidden"
            style={{ background: 'var(--popover, var(--surface))' }}
          >
            {openUrl && (
              <a
                href={openUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground/90 hover:bg-secondary"
                onClick={() => setMenuOpen(false)}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open funnel
              </a>
            )}
            <button
              className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground/90 hover:bg-secondary"
              onClick={() => {
                setMenuOpen(false);
                onGenerateCopy();
              }}
            >
              <Sparkles className="h-3.5 w-3.5" /> Generate copy (AI)
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SaveButton({ saving, justSaved, onClick }: { saving: boolean; justSaved: boolean; onClick: () => void }) {
  return (
    <Button size="sm" onClick={onClick} disabled={saving} className="h-8 min-w-[64px] lg:h-9 lg:min-w-[76px]">
      <AnimatePresence mode="wait" initial={false}>
        {saving ? (
          <motion.span key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="hidden lg:inline">Saving…</span>
          </motion.span>
        ) : justSaved ? (
          <motion.span
            key="saved"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5"
            style={{ color: 'var(--success, #22c55e)' }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            <span className="hidden lg:inline">Saved</span>
          </motion.span>
        ) : (
          <motion.span key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            Save
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}
