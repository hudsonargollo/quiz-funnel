import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layers, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useBuilderStore } from '@/store/builderStore';
import ScreenList from '@/builder/ScreenList';
import ScreenPalette from '@/builder/ScreenPalette';
import PropertyInspector from '@/builder/PropertyInspector';

type Sheet = 'screens' | 'edit' | null;

// Mobile-only: the desktop's 3-pane layout doesn't fit a phone screen, so the
// device preview stays full-screen underneath and the screen list / property
// inspector become on-demand bottom sheets, switched via this tab bar.
export default function MobileNav() {
  const [sheet, setSheet] = useState<Sheet>(null);
  const screenCount = useBuilderStore((s) => s.screens.length);
  const selectedIndex = useBuilderStore((s) => s.selectedIndex);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch gap-1 border-t border-border px-3 pb-[env(safe-area-inset-bottom)] pt-1.5 lg:hidden"
        style={{ background: 'var(--surface-glass, var(--surface))', backdropFilter: 'blur(10px)' }}
      >
        <TabButton active={sheet === 'screens'} icon={<Layers className="h-4 w-4" />} label={`Screens · ${screenCount}`} onClick={() => setSheet('screens')} />
        <TabButton active={sheet === 'edit'} icon={<SlidersHorizontal className="h-4 w-4" />} label="Edit" onClick={() => setSheet('edit')} />
      </nav>

      <Drawer open={sheet === 'screens'} onOpenChange={(o) => setSheet(o ? 'screens' : null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Screens</DrawerTitle>
          </DrawerHeader>
          <ScrollArea className="min-h-0 flex-1 px-3 pb-6">
            <ScreenList onSelect={() => setSheet(null)} />
            <div className="mb-1.5 mt-4 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Add screen</div>
            <ScreenPalette />
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      <Drawer open={sheet === 'edit'} onOpenChange={(o) => setSheet(o ? 'edit' : null)}>
        <DrawerContent key={selectedIndex}>
          <DrawerHeader>
            <DrawerTitle>Edit screen</DrawerTitle>
          </DrawerHeader>
          <ScrollArea className="min-h-0 flex-1 pb-6">
            <PropertyInspector />
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-2 text-[11px] font-medium">
      {active && (
        <motion.div
          layoutId="mobile-nav-active"
          className="absolute inset-x-2 inset-y-0.5 rounded-lg bg-primary/10"
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        />
      )}
      <span className={cn('relative', active ? 'text-primary' : 'text-muted-foreground')}>{icon}</span>
      <span className={cn('relative', active ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
    </button>
  );
}
