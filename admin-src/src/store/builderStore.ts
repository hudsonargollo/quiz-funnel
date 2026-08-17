import { create } from 'zustand';
import { api } from '@/lib/api';

// Screen/config shapes are intentionally loose (`any`-ish) — they mirror the
// existing free-form JSON contract from public/admin/index.html's SCHEMA/newScreen,
// which the backend (src/_lib/funnels.js) stores as opaque JSON. Do not tighten
// these into strict types; the funnel `config` JSON is a shared contract with the
// legacy builder and the funnel runtime (public/js/app.js) and must round-trip
// byte-for-byte regardless of which builder last saved it.
export type Screen = Record<string, any> & { type: string };
export type FunnelConfig = Record<string, any>;

export const SCR_ICON: Record<string, string> = {
  landing: 'flag', single: 'circle-dot', multi: 'list-checks', grid: 'layout-grid',
  slider: 'sliders-horizontal', text: 'type', bridge: 'image', video: 'play',
  loading: 'loader', loading_social: 'users', profile: 'user', imc: 'activity',
  offer: 'tag', success: 'party-popper',
};

export type FieldKind = undefined | 'ta' | 'n';
export type SchemaField = [string, string, FieldKind?] | ['__options' | '__fields' | '__steps' | '__testimonials' | '__config'];
export const SCHEMA: Record<string, SchemaField[]> = {
  landing: [['headline', 'Headline'], ['headlineAccent', 'Accent'], ['sub', 'Subtitle', 'ta'], ['image', 'Image URL'], ['alertTitle', 'Alert title'], ['alertBody', 'Alert body', 'ta'], ['cta', 'Button']],
  single: [['question', 'Question'], ['sub', 'Subtitle'], ['__options']],
  multi: [['question', 'Question'], ['sub', 'Subtitle'], ['__options']],
  grid: [['question', 'Question'], ['__options']],
  slider: [['question', 'Question'], ['sub', 'Subtitle'], ['unit', 'Unit'], ['min', 'Min', 'n'], ['max', 'Max', 'n'], ['default', 'Default', 'n'], ['step', 'Step', 'n'], ['infoTitle', 'Info title'], ['infoBody', 'Info body', 'ta']],
  text: [['question', 'Question'], ['sub', 'Subtitle'], ['__fields'], ['privacyNote', 'Privacy note', 'ta'], ['cta', 'Button']],
  bridge: [['headline', 'Headline'], ['body', 'Body', 'ta'], ['bodyExtra', 'Extra body', 'ta'], ['image', 'Image URL'], ['cta', 'Button']],
  video: [['headline', 'Headline'], ['sub', 'Subtitle'], ['videoUrl', 'Video URL'], ['body', 'Body', 'ta'], ['cta', 'Button']],
  loading: [['headline', 'Headline'], ['__steps']],
  loading_social: [['headline', 'Headline'], ['body', 'Body', 'ta'], ['duration', 'Duration (ms)', 'n'], ['__testimonials']],
  profile: [['headline', 'Heading'], ['cta', 'Button']],
  imc: [['cta', 'Button']],
  offer: [['__config']],
  success: [],
};

export const PALETTE = ['single', 'multi', 'grid', 'slider', 'text', 'bridge', 'video', 'landing', 'loading', 'loading_social', 'offer', 'imc', 'profile'] as const;

function randKey() {
  return 'q' + Math.random().toString(36).slice(2, 7);
}
function opt(label: string) {
  return { value: label.toLowerCase().replace(/\s+/g, '_'), label, icon: 'circle' };
}

export function newScreen(type: string): Screen {
  const k = randKey();
  const m: Record<string, Screen> = {
    landing: { type, headline: 'Headline', headlineAccent: 'Accent', sub: 'Subtitle', cta: 'Start' },
    single: { type, key: k, question: 'Your {question}?', options: [opt('Option A'), opt('Option B')] },
    multi: { type, key: k, question: 'Pick {options}', options: [opt('Option A'), opt('Option B')] },
    grid: { type, key: k, question: 'Choose', options: [{ value: 'a', label: 'Option A', img: '' }, { value: 'b', label: 'Option B', img: '' }] },
    slider: { type, key: k, question: 'Pick a value', unit: 'kg', min: 40, max: 150, default: 70, step: 1 },
    text: { type, key: 'email', question: 'Your {email}?', fields: [{ key: 'email', label: 'Email', placeholder: 'you@email.com', type: 'email', required: true }], cta: 'Continue', isLeadCapture: true },
    bridge: { type, headline: 'Headline', body: 'Body text', cta: 'Continue' },
    video: { type, key: 'vsl', headline: 'Watch this', videoUrl: '', cta: 'Continue' },
    loading: { type, headline: 'Loading...', steps: ['Analyzing', 'Preparing'], duration: 2500 },
    loading_social: { type, headline: 'Almost ready...', body: 'We are finishing your analysis and preparing your personalized recommendation.', duration: 5000, testimonials: [{ image: '', name: 'Full Name', detail: 'City' }] },
    profile: { type, headline: 'Your profile', cta: 'Continue' },
    imc: { type, cta: 'Continue' },
    offer: { type }, success: { type },
  };
  return m[type] || { type };
}

export function scrLabel(s: Screen): string {
  return s.question || s.headline || s.cta || s.type;
}

type ListKey = 'options' | 'fields' | 'steps' | 'testimonials';

interface BuilderState {
  id: string | null;
  slug: string;
  name: string;
  screens: Screen[];
  config: FunnelConfig;
  selectedIndex: number;
  dirty: boolean;
  saving: boolean;
  loaded: boolean;
  previewReady: boolean;
  previewNonce: number;

  loadFunnel: (id: string) => Promise<void>;
  reset: () => void;
  setName: (name: string) => void;
  selectScreen: (i: number) => void;
  addScreen: (type: string) => void;
  deleteScreen: (i: number) => void;
  reorderScreens: (from: number, to: number) => void;

  updateScreenField: (key: string, value: any, num?: boolean) => void;

  updateListItem: (listKey: ListKey, i: number, patch: Record<string, any>) => void;
  addListItem: (listKey: ListKey) => void;
  removeListItem: (listKey: ListKey, i: number) => void;
  reorderListItem: (listKey: ListKey, from: number, to: number) => void;
  setStepValue: (i: number, value: string) => void;

  updateConfig: (patch: FunnelConfig) => void;
  updateDeliveryConfig: (patch: Record<string, any>) => void;

  save: () => Promise<void>;
  setPreviewReady: () => void;
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  id: null, slug: '', name: '', screens: [], config: {}, selectedIndex: 0,
  dirty: false, saving: false, loaded: false, previewReady: false, previewNonce: 0,

  async loadFunnel(id) {
    set({ loaded: false });
    const f = await api<any>('funnels/' + id);
    set({
      id, slug: f.slug, name: f.name || '',
      screens: (f.config && f.config.screens) || [],
      config: (f.config && f.config.config) || {},
      selectedIndex: 0, dirty: false, loaded: true, previewReady: false,
      previewNonce: Date.now(),
    });
  },

  reset() {
    set({ id: null, slug: '', name: '', screens: [], config: {}, selectedIndex: 0, dirty: false, loaded: false, previewReady: false });
  },

  setName(name) {
    set({ name, dirty: true });
  },

  selectScreen(i) {
    set({ selectedIndex: i });
  },

  addScreen(type) {
    const screens = get().screens.slice();
    const at = get().selectedIndex + 1;
    screens.splice(at, 0, newScreen(type));
    set({ screens, selectedIndex: Math.min(at, screens.length - 1), dirty: true });
  },

  deleteScreen(i) {
    const screens = get().screens.slice();
    if (screens.length <= 1) return;
    screens.splice(i, 1);
    const selectedIndex = Math.min(get().selectedIndex, screens.length - 1);
    set({ screens, selectedIndex, dirty: true });
  },

  reorderScreens(from, to) {
    const screens = get().screens.slice();
    const [m] = screens.splice(from, 1);
    screens.splice(to, 0, m);
    set({ screens, selectedIndex: to, dirty: true });
  },

  updateScreenField(key, value, num) {
    const screens = get().screens.slice();
    const s = { ...screens[get().selectedIndex] };
    (s as any)[key] = num ? (value === '' ? undefined : Number(value)) : value;
    screens[get().selectedIndex] = s;
    set({ screens, dirty: true });
  },

  updateListItem(listKey, i, patch) {
    const screens = get().screens.slice();
    const s = { ...screens[get().selectedIndex] };
    const list = (s[listKey] || []).slice();
    list[i] = { ...list[i], ...patch };
    (s as any)[listKey] = list;
    screens[get().selectedIndex] = s;
    set({ screens, dirty: true });
  },

  addListItem(listKey) {
    const screens = get().screens.slice();
    const s = { ...screens[get().selectedIndex] };
    const list = (s[listKey] || []).slice();
    const defaults: Record<ListKey, any> = {
      options: s.type === 'grid' ? { value: 'opt', label: 'Option', img: '' } : { value: 'opt', label: 'Option', icon: 'circle' },
      fields: { key: 'field', label: 'Field', placeholder: '', type: 'text', required: true },
      steps: 'Step',
      testimonials: { image: '', name: '', detail: '' },
    };
    list.push(defaults[listKey]);
    (s as any)[listKey] = list;
    screens[get().selectedIndex] = s;
    set({ screens, dirty: true });
  },

  removeListItem(listKey, i) {
    const screens = get().screens.slice();
    const s = { ...screens[get().selectedIndex] };
    const list = (s[listKey] || []).slice();
    list.splice(i, 1);
    (s as any)[listKey] = list;
    screens[get().selectedIndex] = s;
    set({ screens, dirty: true });
  },

  reorderListItem(listKey, from, to) {
    const screens = get().screens.slice();
    const s = { ...screens[get().selectedIndex] };
    const list = (s[listKey] || []).slice();
    const [m] = list.splice(from, 1);
    list.splice(to, 0, m);
    (s as any)[listKey] = list;
    screens[get().selectedIndex] = s;
    set({ screens, dirty: true });
  },

  setStepValue(i, value) {
    const screens = get().screens.slice();
    const s = { ...screens[get().selectedIndex] };
    const steps = (s.steps || []).slice();
    steps[i] = value;
    s.steps = steps;
    screens[get().selectedIndex] = s;
    set({ screens, dirty: true });
  },

  updateConfig(patch) {
    set({ config: { ...get().config, ...patch }, dirty: true });
  },

  updateDeliveryConfig(patch) {
    const config = { ...get().config };
    config.delivery = { ...(config.delivery || {}), ...patch };
    set({ config, dirty: true });
  },

  async save() {
    const { id, name, config, screens } = get();
    if (!id) return;
    set({ saving: true });
    try {
      await api('funnels/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), status: 'published', config: { config, screens } }),
      });
      set({ dirty: false });
    } finally {
      set({ saving: false });
    }
  },

  setPreviewReady() {
    set({ previewReady: true });
  },
}));
