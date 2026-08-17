import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useBuilderStore } from '@/store/builderStore';
import BuilderShell from '@/builder/BuilderShell';

export default function BuilderPage() {
  const { id } = useParams<{ id: string }>();
  const loaded = useBuilderStore((s) => s.loaded);
  const loadFunnel = useBuilderStore((s) => s.loadFunnel);
  const reset = useBuilderStore((s) => s.reset);

  useEffect(() => {
    if (!id) return;
    loadFunnel(id).catch((e) => toast.error(String(e.message || e)));
    return () => reset();
  }, [id]);

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return <BuilderShell />;
}
