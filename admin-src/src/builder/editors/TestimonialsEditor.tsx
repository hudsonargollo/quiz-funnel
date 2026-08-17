import { X } from 'lucide-react';
import { useBuilderStore } from '@/store/builderStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function TestimonialsEditor() {
  const screen = useBuilderStore((s) => s.screens[s.selectedIndex]);
  const updateListItem = useBuilderStore((s) => s.updateListItem);
  const addListItem = useBuilderStore((s) => s.addListItem);
  const removeListItem = useBuilderStore((s) => s.removeListItem);
  if (!screen) return null;
  const testimonials: any[] = screen.testimonials || [];

  return (
    <div className="space-y-2">
      {testimonials.map((x, i) => (
        <div key={i} className="rounded-md border border-border bg-secondary/30 p-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
            <div className="flex-1" />
            <button onClick={() => removeListItem('testimonials', i)} className="text-muted-foreground/70 hover:text-destructive">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <Input placeholder="Image URL" value={x.image || ''} onChange={(e) => updateListItem('testimonials', i, { image: e.target.value })} />
          <Input className="mt-1.5" placeholder="Name" value={x.name || ''} onChange={(e) => updateListItem('testimonials', i, { name: e.target.value })} />
          <Input className="mt-1.5" placeholder="Detail (city)" value={x.detail || ''} onChange={(e) => updateListItem('testimonials', i, { detail: e.target.value })} />
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={() => addListItem('testimonials')}>
        + Add testimonial
      </Button>
    </div>
  );
}
