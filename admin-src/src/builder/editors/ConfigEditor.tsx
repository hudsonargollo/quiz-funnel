import { useState } from 'react';
import { Mail, Send, Loader2 } from 'lucide-react';
import { useBuilderStore } from '@/store/builderStore';
import { api } from '@/lib/api';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

export default function ConfigEditor() {
  const id = useBuilderStore((s) => s.id);
  const config = useBuilderStore((s) => s.config);
  const screens = useBuilderStore((s) => s.screens);
  const updateConfig = useBuilderStore((s) => s.updateConfig);
  const updateDeliveryConfig = useBuilderStore((s) => s.updateDeliveryConfig);
  const [testState, setTestState] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle');
  const [testMsg, setTestMsg] = useState('');
  const delivery = config.delivery || {};

  async function testDelivery() {
    const email = prompt('Send a test delivery email to:');
    if (!email) return;
    setTestState('sending');
    try {
      // Persist current config first so the server sends with the latest copy.
      await api('funnels/' + id, { method: 'PATCH', body: JSON.stringify({ config: { config, screens } }) });
      await api('messaging/test', { method: 'POST', body: JSON.stringify({ funnelId: id, email }) });
      setTestState('ok');
      setTestMsg('Test email sent');
    } catch (e: any) {
      setTestState('err');
      setTestMsg(String(e.message || e));
    }
  }

  return (
    <div>
      <Label>Product name</Label>
      <Input value={config.productName || ''} onChange={(e) => updateConfig({ productName: e.target.value })} />
      <Label className="mt-3">Price</Label>
      <Input type="number" value={config.productPrice ?? ''} onChange={(e) => updateConfig({ productPrice: Number(e.target.value) })} />
      <Label className="mt-3">Currency</Label>
      <Input value={config.currency || ''} onChange={(e) => updateConfig({ currency: e.target.value })} />
      <Label className="mt-3">Checkout URL (external, e.g. Cakto — leave blank to use built-in Stripe checkout)</Label>
      <Input
        placeholder="https://pay.cakto.com.br/…"
        value={config.checkoutUrl || ''}
        onChange={(e) => updateConfig({ checkoutUrl: e.target.value })}
      />

      <Separator className="my-4" />

      <label className="flex cursor-pointer items-center gap-2.5">
        <Switch checked={!!delivery.enabled} onCheckedChange={(v) => updateDeliveryConfig({ enabled: v })} />
        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm">Email delivery</span>
      </label>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Sends the buyer an email with their deliverable link after purchase.
      </p>

      {delivery.enabled && (
        <div className="mt-3 space-y-3">
          <div>
            <Label>From name</Label>
            <Input placeholder={config.productName || 'FunnelsTone'} value={delivery.fromName || ''} onChange={(e) => updateDeliveryConfig({ fromName: e.target.value })} />
          </div>
          <div>
            <Label>Subject</Label>
            <Input placeholder="Your order is ready" value={delivery.subject || ''} onChange={(e) => updateDeliveryConfig({ subject: e.target.value })} />
          </div>
          <div>
            <Label>Intro text</Label>
            <Textarea rows={3} placeholder="A short intro before the download link…" value={delivery.intro || ''} onChange={(e) => updateDeliveryConfig({ intro: e.target.value })} />
          </div>
          <div>
            <Label>Deliverable URL</Label>
            <Input placeholder="https://…" value={delivery.deliverableUrl || config.leadMagnetUrl || ''} onChange={(e) => updateDeliveryConfig({ deliverableUrl: e.target.value })} />
          </div>
          <div>
            <Label>Button label</Label>
            <Input placeholder="Download now" value={delivery.buttonLabel || ''} onChange={(e) => updateDeliveryConfig({ buttonLabel: e.target.value })} />
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={testDelivery} disabled={testState === 'sending'}>
            {testState === 'sending' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Test delivery
          </Button>
          {testState === 'ok' && <p className="text-xs text-success" style={{ color: 'var(--success)' }}>{testMsg}</p>}
          {testState === 'err' && <p className="text-xs text-destructive">{testMsg}</p>}
        </div>
      )}
    </div>
  );
}
