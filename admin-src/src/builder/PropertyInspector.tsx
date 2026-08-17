import { useBuilderStore, SCHEMA } from '@/store/builderStore';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import SchemaField from '@/builder/SchemaField';
import OptionsEditor from '@/builder/editors/OptionsEditor';
import FieldsEditor from '@/builder/editors/FieldsEditor';
import StepsEditor from '@/builder/editors/StepsEditor';
import TestimonialsEditor from '@/builder/editors/TestimonialsEditor';
import ConfigEditor from '@/builder/editors/ConfigEditor';

const SECTION_LABEL: Record<string, string> = {
  __options: 'Options',
  __fields: 'Fields',
  __steps: 'Steps',
  __testimonials: 'Testimonials',
  __config: 'Pricing & delivery',
};

export default function PropertyInspector() {
  const selectedIndex = useBuilderStore((s) => s.selectedIndex);
  const screen = useBuilderStore((s) => s.screens[s.selectedIndex]);

  if (!screen) {
    return <div className="px-3 py-8 text-center text-xs text-muted-foreground">Select a screen to edit its properties.</div>;
  }

  const schema = SCHEMA[screen.type] || [];
  const plainFields = schema.filter(([key]) => !key.startsWith('__')) as [string, string, any?][];
  const specialSections = schema.filter(([key]) => key.startsWith('__'));

  const defaultOpen = ['content', ...(specialSections[0] ? [specialSections[0][0]] : [])];

  return (
    <div className="px-1">
      <div className="mb-2 px-2 text-[11px] text-muted-foreground">
        {screen.type}
        {screen.key ? ` · ${screen.key}` : ''}
      </div>
      {/* Keyed by selected screen so Radix re-applies defaultValue per screen —
          otherwise switching screens keeps whatever sections were open on the
          previously selected (possibly differently-shaped) screen. */}
      <Accordion key={selectedIndex} type="multiple" defaultValue={defaultOpen} className="px-2">
        {plainFields.length > 0 && (
          <AccordionItem value="content">
            <AccordionTrigger>Content</AccordionTrigger>
            <AccordionContent>
              {plainFields.map(([key, label, kind]) => (
                <SchemaField key={key} fieldKey={key} label={label} kind={kind} />
              ))}
            </AccordionContent>
          </AccordionItem>
        )}
        {specialSections.map(([key]) => (
          <AccordionItem key={key} value={key}>
            <AccordionTrigger>{SECTION_LABEL[key] || key}</AccordionTrigger>
            <AccordionContent>
              {key === '__options' && <OptionsEditor />}
              {key === '__fields' && <FieldsEditor />}
              {key === '__steps' && <StepsEditor />}
              {key === '__testimonials' && <TestimonialsEditor />}
              {key === '__config' && <ConfigEditor />}
            </AccordionContent>
          </AccordionItem>
        ))}
        {plainFields.length === 0 && specialSections.length === 0 && (
          <p className="py-4 text-xs text-muted-foreground">This screen type has no configurable properties.</p>
        )}
      </Accordion>
    </div>
  );
}
