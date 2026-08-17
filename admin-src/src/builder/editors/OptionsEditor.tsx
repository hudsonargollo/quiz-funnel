import { X, GripVertical } from 'lucide-react';
import { useBuilderStore } from '@/store/builderStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SortableList } from '@/builder/dnd/SortableList';

export default function OptionsEditor() {
  const screen = useBuilderStore((s) => s.screens[s.selectedIndex]);
  const updateListItem = useBuilderStore((s) => s.updateListItem);
  const addListItem = useBuilderStore((s) => s.addListItem);
  const removeListItem = useBuilderStore((s) => s.removeListItem);
  const reorderListItem = useBuilderStore((s) => s.reorderListItem);
  if (!screen) return null;
  const options: any[] = screen.options || [];
  const isGrid = screen.type === 'grid';

  return (
    <div className="space-y-2">
      <SortableList
        items={options}
        onReorder={(from, to) => reorderListItem('options', from, to)}
        className="flex flex-col gap-2"
        renderItem={(o, i, dragHandleProps) => (
          <div className="rounded-md border border-border bg-secondary/30 p-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span {...dragHandleProps} className="cursor-grab touch-none text-muted-foreground/60 active:cursor-grabbing">
                <GripVertical className="h-3.5 w-3.5" />
              </span>
              <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
              <div className="flex-1" />
              <button onClick={() => removeListItem('options', i)} className="text-muted-foreground/70 hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Input placeholder="Label" value={o.label || ''} onChange={(e) => updateListItem('options', i, { label: e.target.value })} />
              <Input placeholder="Value" value={o.value || ''} onChange={(e) => updateListItem('options', i, { value: e.target.value })} />
            </div>
            {isGrid ? (
              <Input className="mt-1.5" placeholder="Image URL" value={o.img || ''} onChange={(e) => updateListItem('options', i, { img: e.target.value })} />
            ) : (
              <Input className="mt-1.5" placeholder="Icon (lucide name)" value={o.icon || ''} onChange={(e) => updateListItem('options', i, { icon: e.target.value })} />
            )}
          </div>
        )}
      />
      <Button variant="outline" size="sm" className="w-full" onClick={() => addListItem('options')}>
        + Add option
      </Button>
    </div>
  );
}
