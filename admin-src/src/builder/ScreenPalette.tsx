import { useBuilderStore, SCR_ICON, PALETTE } from '@/store/builderStore';
import { DynIcon } from '@/lib/icon';

export default function ScreenPalette() {
  const addScreen = useBuilderStore((s) => s.addScreen);
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {PALETTE.map((type) => (
        <button
          key={type}
          onClick={() => addScreen(type)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-xs text-foreground/90 transition-colors duration-2 hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"
        >
          <DynIcon name={SCR_ICON[type] || 'square'} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{type}</span>
        </button>
      ))}
    </div>
  );
}
