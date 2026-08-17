import { useBuilderStore } from '@/store/builderStore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { FieldKind } from '@/store/builderStore';

export default function SchemaField({ fieldKey, label, kind }: { fieldKey: string; label: string; kind: FieldKind }) {
  const value = useBuilderStore((s) => s.screens[s.selectedIndex]?.[fieldKey] ?? '');
  const updateScreenField = useBuilderStore((s) => s.updateScreenField);

  if (kind === 'ta') {
    return (
      <div className="mb-3">
        <Label>{label}</Label>
        <Textarea rows={2} value={value} onChange={(e) => updateScreenField(fieldKey, e.target.value)} />
      </div>
    );
  }
  return (
    <div className="mb-3">
      <Label>{label}</Label>
      <Input
        type={kind === 'n' ? 'number' : 'text'}
        value={value}
        onChange={(e) => updateScreenField(fieldKey, e.target.value, kind === 'n')}
      />
    </div>
  );
}
