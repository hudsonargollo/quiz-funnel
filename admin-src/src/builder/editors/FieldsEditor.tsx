import { X } from 'lucide-react';
import { useBuilderStore } from '@/store/builderStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function FieldsEditor() {
  const screen = useBuilderStore((s) => s.screens[s.selectedIndex]);
  const updateListItem = useBuilderStore((s) => s.updateListItem);
  const addListItem = useBuilderStore((s) => s.addListItem);
  const removeListItem = useBuilderStore((s) => s.removeListItem);
  if (!screen) return null;
  const fields: any[] = screen.fields || [];

  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={i} className="rounded-md border border-border bg-secondary/30 p-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
            <div className="flex-1" />
            <button onClick={() => removeListItem('fields', i)} className="text-muted-foreground/70 hover:text-destructive">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Input placeholder="Label" value={f.label || ''} onChange={(e) => updateListItem('fields', i, { label: e.target.value })} />
            <Input placeholder="Key" value={f.key || ''} onChange={(e) => updateListItem('fields', i, { key: e.target.value })} />
          </div>
          <Input className="mt-1.5" placeholder="Placeholder" value={f.placeholder || ''} onChange={(e) => updateListItem('fields', i, { placeholder: e.target.value })} />
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={() => addListItem('fields')}>
        + Add field
      </Button>
    </div>
  );
}
