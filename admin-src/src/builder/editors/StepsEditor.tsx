import { X } from 'lucide-react';
import { useBuilderStore } from '@/store/builderStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function StepsEditor() {
  const screen = useBuilderStore((s) => s.screens[s.selectedIndex]);
  const setStepValue = useBuilderStore((s) => s.setStepValue);
  const addListItem = useBuilderStore((s) => s.addListItem);
  const removeListItem = useBuilderStore((s) => s.removeListItem);
  if (!screen) return null;
  const steps: string[] = screen.steps || [];

  return (
    <div className="space-y-1.5">
      {steps.map((x, i) => (
        <div key={i} className="flex gap-1.5">
          <Input value={x} onChange={(e) => setStepValue(i, e.target.value)} />
          <Button variant="ghost" size="icon" onClick={() => removeListItem('steps', i)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={() => addListItem('steps')}>
        + Add step
      </Button>
    </div>
  );
}
