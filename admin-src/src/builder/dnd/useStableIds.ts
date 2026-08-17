// dnd-kit needs a stable string id per item across renders. Screens/options/
// fields/steps/testimonials are plain JSON (the funnel `config` contract) and
// must NOT gain a synthetic "id" field that would leak into the saved payload,
// so ids are derived positionally rather than stored on the data.
//
// A WeakMap-by-object-identity approach was tried first, but every field edit
// in this app replaces the edited item with a new object (immutable update),
// which would mint a NEW id on every keystroke — remounting the SortableRow
// (and the <input> inside it) mid-edit and dropping keystrokes/focus. Reorders
// only ever happen as a single discrete drag-end (not incrementally mid-drag),
// so positional ids stay perfectly stable for dnd-kit's purposes while being
// immune to that bug.
export function useStableIds<T>(items: T[]): string[] {
  return items.map((_, i) => 'idx-' + i);
}
