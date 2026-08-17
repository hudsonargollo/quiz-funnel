import { useEffect, useState } from 'react';
import { Save, Copy, Trash2, Sparkles } from 'lucide-react';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { useBuilderStore, SCR_ICON, PALETTE, scrLabel } from '@/store/builderStore';
import { DynIcon } from '@/lib/icon';

export default function CommandPalette({ onGenerateCopy }: { onGenerateCopy: () => void }) {
  const [open, setOpen] = useState(false);
  const screens = useBuilderStore((s) => s.screens);
  const addScreen = useBuilderStore((s) => s.addScreen);
  const selectScreen = useBuilderStore((s) => s.selectScreen);
  const deleteScreen = useBuilderStore((s) => s.deleteScreen);
  const selectedIndex = useBuilderStore((s) => s.selectedIndex);
  const save = useBuilderStore((s) => s.save);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function run(fn: () => void) {
    setOpen(false);
    fn();
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(() => save())}>
            <Save /> Save
          </CommandItem>
          <CommandItem onSelect={() => run(() => addScreen(screens[selectedIndex]?.type || 'single'))}>
            <Copy /> Duplicate current screen type
          </CommandItem>
          <CommandItem onSelect={() => run(() => deleteScreen(selectedIndex))}>
            <Trash2 /> Delete current screen
          </CommandItem>
          <CommandItem onSelect={() => run(onGenerateCopy)}>
            <Sparkles /> Generate copy (AI)
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Add screen">
          {PALETTE.map((type) => (
            <CommandItem key={type} onSelect={() => run(() => addScreen(type))}>
              <DynIcon name={SCR_ICON[type] || 'square'} />
              {type}
            </CommandItem>
          ))}
        </CommandGroup>
        {screens.length > 0 && (
          <CommandGroup heading="Go to screen">
            {screens.map((s, i) => (
              <CommandItem key={i} onSelect={() => run(() => selectScreen(i))}>
                <DynIcon name={SCR_ICON[s.type] || 'square'} />
                {scrLabel(s)}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
