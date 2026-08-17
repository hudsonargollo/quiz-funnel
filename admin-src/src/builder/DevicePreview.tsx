import { useEffect, useRef } from 'react';
import { useBuilderStore } from '@/store/builderStore';

// Owns the live-preview iframe and the exact same postMessage contract the
// legacy builder uses (public/js/app.js:~1166-1207) — untouched on the funnel
// runtime side, so this must keep sending/receiving the same message shapes.
//
// A single iframe instance — only its *container* styling is responsive
// (full-bleed on mobile, phone-frame mockup on desktop). Two separate iframe
// elements would double-load the funnel runtime on every resize; one element
// reflowed by CSS costs nothing extra.
export default function DevicePreview() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const slug = useBuilderStore((s) => s.slug);
  const loaded = useBuilderStore((s) => s.loaded);
  const previewNonce = useBuilderStore((s) => s.previewNonce);
  const previewReady = useBuilderStore((s) => s.previewReady);
  const setPreviewReady = useBuilderStore((s) => s.setPreviewReady);
  const screens = useBuilderStore((s) => s.screens);
  const config = useBuilderStore((s) => s.config);
  const selectedIndex = useBuilderStore((s) => s.selectedIndex);

  useEffect(() => {
    if (!loaded || !slug || !iframeRef.current) return;
    iframeRef.current.src = `${location.origin}/${slug}?preview=1&t=${previewNonce}`;
  }, [loaded, slug, previewNonce]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if ((e.data || {}).type === 'qf-preview-ready') setPreviewReady();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [setPreviewReady]);

  useEffect(() => {
    if (!previewReady) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'qf-preview', screens, config, index: selectedIndex }, '*');
  }, [previewReady, screens, config, selectedIndex]);

  return (
    <div className="flex h-full items-center justify-center bg-surface-3 lg:p-6" style={{ background: 'var(--surface-3)' }}>
      <div
        className="relative h-full w-full overflow-hidden lg:h-[780px] lg:w-[390px] lg:rounded-[36px] lg:border-[6px] lg:shadow-e4"
        style={{ borderColor: 'var(--outline-strong)', background: 'var(--bg)' }}
      >
        <iframe ref={iframeRef} title="preview" className="h-full w-full border-0" />
      </div>
    </div>
  );
}
