import { Trash2, GripVertical } from 'lucide-react';
import { useBuilderStore, SCR_ICON, scrLabel } from '@/store/builderStore';
import { DynIcon } from '@/lib/icon';
import { SortableList } from '@/builder/dnd/SortableList';
import { cn } from '@/lib/utils';

export default function ScreenList() {
  const screens = useBuilderStore((s) => s.screens);
  const selectedIndex = useBuilderStore((s) => s.selectedIndex);
  const selectScreen = useBuilderStore((s) => s.selectScreen);
  const deleteScreen = useBuilderStore((s) => s.deleteScreen);
  const reorderScreens = useBuilderStore((s) => s.reorderScreens);

  if (!screens.length) {
    return <div className="px-2 py-6 text-center text-xs text-muted-foreground">—</div>;
  }

  return (
    <SortableList
      items={screens}
      onReorder={reorderScreens}
      className="flex flex-col gap-1"
      renderItem={(s, i, dragHandleProps) => (
        <div
          onClick={() => selectScreen(i)}
          className={cn(
            'group flex cursor-pointer items-center gap-2 rounded-md border px-2 py-2 text-sm transition-colors duration-2',
            i === selectedIndex
              ? 'border-primary/50 bg-primary/10 text-foreground'
              : 'border-transparent hover:border-border hover:bg-secondary/60 text-foreground/90'
          )}
        >
          <span
            {...dragHandleProps}
            className="cursor-grab touch-none text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
          <DynIcon name={SCR_ICON[s.type] || 'square'} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            <span className="block truncate">{scrLabel(s)}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{s.type}</span>
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteScreen(i);
            }}
            className="opacity-0 text-muted-foreground/70 hover:text-destructive group-hover:opacity-100 transition-opacity duration-2"
            title="Delete screen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    />
  );
}
