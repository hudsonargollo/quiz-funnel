import { useState } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import TopBar from '@/builder/TopBar';
import ScreenList from '@/builder/ScreenList';
import ScreenPalette from '@/builder/ScreenPalette';
import DevicePreview from '@/builder/DevicePreview';
import PropertyInspector from '@/builder/PropertyInspector';
import CommandPalette from '@/builder/CommandPalette';
import GenerateCopyDialog from '@/builder/GenerateCopyDialog';
import MobileNav from '@/builder/MobileNav';

export default function BuilderShell() {
  const [copyOpen, setCopyOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar onGenerateCopy={() => setCopyOpen(true)} />

      {/* Desktop (lg+): the original 3-pane resizable layout, edge-to-edge. */}
      <div className="hidden min-h-0 flex-1 lg:block">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={20} minSize={14} maxSize={32}>
            <ScrollArea className="h-full">
              <div className="p-3">
                <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Screens
                </div>
                <ScreenList />
                <div className="mb-1.5 mt-4 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Add screen
                </div>
                <ScreenPalette />
              </div>
            </ScrollArea>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={30}>
            <DevicePreview />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={30} minSize={20} maxSize={42}>
            <ScrollArea className="h-full">
              <div className="py-3">
                <PropertyInspector />
              </div>
            </ScrollArea>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile (< lg): preview fills the screen; screens/properties live in
          bottom sheets reached via the bottom tab bar (MobileNav). */}
      <div className="min-h-0 flex-1 pb-14 lg:hidden">
        <DevicePreview />
      </div>
      <MobileNav />

      <CommandPalette onGenerateCopy={() => setCopyOpen(true)} />
      <GenerateCopyDialog open={copyOpen} onOpenChange={setCopyOpen} />
    </div>
  );
}
