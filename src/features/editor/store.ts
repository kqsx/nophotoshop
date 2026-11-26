import { useSyncExternalStore } from 'react';
import { combine, defaultGeometry, defaultParams, type Geometry, type Params, type PresetDelta } from '../../engine/params';
import { analyzeCanvas, type Analysis } from '../../analysis/analyze';
import { PRESETS, presetDelta, type Preset } from '../../presets/presets';
import { renderGeometryCanvas } from '../../engine/geometry';
import { catalogNow } from '../../engine/lutStore';
import { track } from '../../lib/stats';

export interface PresetLayer { id: string; strength: number }
export interface EditState { manual: Params; presets: PresetLayer[]; geometry: Geometry }
export interface HistoryEntry { s: EditState; label: string }

export interface Doc {
  id: string;
  name: string;
  file: Blob;
  bitmap: ImageBitmap;
  w: number;
  h: number;
  analysis: Analysis | null;
  exifDate: string | null;
  cur: EditState;
  committed: EditState;
  past: HistoryEntry[];
  future: HistoryEntry[];
  thumb: string;
  rev: number;
}

export type Tab = 'quick' | 'lut' | 'advanced' | 'crop' | 'watermark';

interface State {
  docs: Doc[];
  activeId: string | null;
  tab: Tab;
  customPresets: Preset[];
  loading: number;
  /** Chỉnh đồng loạt: mọi thay đổi áp cho tất cả ảnh đã tải */
  syncAll: boolean;
}

let state: State = { docs: [], activeId: null, tab: 'quick', customPresets: [], loading: 0, syncAll: true };
const subs = new Set<() => void>();
function emit() { for (const s of subs) s(); }
function set(patch: Partial<State>) { state = { ...state, ...patch }; emit(); }
export const getState = () => state;
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => sel(state));
}

export const blankEdit = (): EditState => ({ manual: defaultParams(), presets: [], geometry: defaultGeometry() });

export function activeDoc(s: State = state): Doc | null {
  return s.docs.find((d) => d.id === s.activeId) ?? null;
}

function updateDoc(id: string, fn: (d: Doc) => Doc) {
  set({ docs: state.docs.map((d) => (d.id === id ? fn(d) : d)) });
}

export function allPresets(): Preset[] {
  const lib: Preset[] = catalogNow()
    .filter((l) => l.kind === 'xmp' && l.delta)
    .map((l) => ({ id: 'xmp:' + l.id, name: l.name, group: l.group, icon: 'palette', color: 'purple', strength: 100, when: [], desc: 'Preset Lightroom', delta: l.delta }));
  return [...PRESETS, ...state.customPresets, ...lib];
}
export function findPreset(id: string) { return allPresets().find((p) => p.id === id); }

export function effectiveParams(d: Doc, edit: EditState = d.cur): Params {
  const layers = edit.presets
    .map((l) => {
      const p = findPreset(l.id);
      if (!p) return null;
      return { delta: presetDelta(p, d.analysis) as PresetDelta, strength: l.strength, lut: p.lut, lutAmount: 100 };
    })
    .filter(Boolean) as { delta: PresetDelta; strength: number; lut?: string; lutAmount?: number }[];
  return combine(edit.manual, layers);
}

// ---------- Nạp ảnh ----------
const ACCEPT = /^image\/(jpeg|png|webp|gif|bmp|avif|heic|heif)$/i;
export const isHeic = (f: File) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

async function decode(file: File): Promise<{ blob: Blob; bitmap: ImageBitmap }> {
  let blob: Blob = file;
  if (isHeic(file)) {
    // Safari tự đọc được HEIC; trình duyệt khác mới cần thư viện (nạp khi cần)
    try { return { blob, bitmap: await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions) }; } catch { /* dùng heic2any */ }
    const heic2any = (await import('heic2any')).default;
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
    blob = Array.isArray(out) ? out[0] : out;
  }
  // createImageBitmap tự xoay theo EXIF Orientation
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  return { blob, bitmap };
}

async function exifDate(blob: Blob): Promise<string | null> {
  try {
    const exifr = (await import('exifr')).default;
    const e = (await exifr.parse(blob, ['DateTimeOriginal', 'CreateDate'])) as { DateTimeOriginal?: Date; CreateDate?: Date } | undefined;
    const d = e?.DateTimeOriginal || e?.CreateDate;
    return d instanceof Date && !isNaN(+d) ? d.toLocaleDateString('vi-VN') : null;
  } catch { return null; }
}

export async function addFiles(files: File[] | FileList, onError?: (m: string) => void) {
  const list = [...files].filter((f) => ACCEPT.test(f.type) || isHeic(f));
  if (!list.length) { onError?.('Không có ảnh hợp lệ (JPG, PNG, WebP, HEIC)'); return; }
  set({ loading: state.loading + list.length });
  for (const f of list) {
    try {
      const { blob, bitmap } = await decode(f);
      const g = defaultGeometry();
      const prev = renderGeometryCanvas(bitmap, g, 512);
      const analysis = analyzeCanvas(prev, bitmap.width, bitmap.height);
      const thumbC = renderGeometryCanvas(bitmap, g, 160);
      const edit = blankEdit();
      const doc: Doc = {
        id: Math.random().toString(36).slice(2, 10),
        name: f.name || 'anh.jpg',
        file: blob, bitmap, w: bitmap.width, h: bitmap.height,
        analysis, exifDate: null,
        cur: edit, committed: edit, past: [], future: [],
        thumb: thumbC.toDataURL('image/jpeg', 0.7), rev: 0,
      };
      set({ docs: [...state.docs, doc], activeId: state.activeId ?? doc.id });
      track('image');
      exifDate(blob).then((dt) => dt && updateDoc(doc.id, (d) => ({ ...d, exifDate: dt })));
    } catch (e) {
      console.error(e);
      onError?.(`Không mở được “${f.name}”`);
      track('error', 'decode');
    } finally {
      set({ loading: Math.max(0, state.loading - 1) });
    }
  }
}

export function setActive(id: string) { set({ activeId: id }); }
export function setTab(tab: Tab) { set({ tab }); }
export function removeDoc(id: string) {
  const docs = state.docs.filter((d) => d.id !== id);
  const d = state.docs.find((x) => x.id === id);
  d?.bitmap.close();
  set({ docs, activeId: state.activeId === id ? docs[0]?.id ?? null : state.activeId });
}
export function closeAll() {
  for (const d of state.docs) d.bitmap.close();
  set({ docs: [], activeId: null, tab: 'quick' });
}

// ---------- Chỉnh sửa + lịch sử ----------
/** Cập nhật tức thời (khi đang kéo) — chưa ghi lịch sử. */
export function live(fn: (e: EditState) => EditState) {
  const d = activeDoc();
  if (!d) return;
  const next = fn(d.cur);
  if (!state.syncAll || state.docs.length < 2) { updateDoc(d.id, (x) => ({ ...x, cur: next, rev: x.rev + 1 })); return; }
  set({ docs: state.docs.map((x) => (x.id === d.id ? { ...x, cur: next, rev: x.rev + 1 } : { ...x, cur: mirror(next, x), rev: x.rev + 1 })) });
}
/** Công thức của ảnh đang chọn, giữ khung cắt + điểm xóa riêng của ảnh x. */
function mirror(src: EditState, x: Doc): EditState {
  return { manual: { ...structuredClone(src.manual), heal: x.cur.manual.heal }, presets: structuredClone(src.presets), geometry: x.cur.geometry };
}
export function setSyncAll(on: boolean) {
  set({ syncAll: on });
  if (on) { live((e) => e); commit('Áp cho tất cả ảnh'); }
}
/** Ghi một bước lịch sử. */
export function commit(label: string) {
  const d = activeDoc();
  if (!d) return;
  const push = (x: Doc): Doc =>
    JSON.stringify(x.cur) === JSON.stringify(x.committed) ? x : { ...x, past: [...x.past, { s: x.committed, label }].slice(-200), future: [], committed: x.cur };
  if (state.syncAll && state.docs.length > 1) set({ docs: state.docs.map(push) });
  else updateDoc(d.id, push);
}
export function edit(label: string, fn: (e: EditState) => EditState) { live(fn); commit(label); }

export function undo() {
  undoOne();
  if (state.syncAll && state.docs.length > 1) { live((e) => e); syncCommitOthers('Hoàn tác'); }
}
function undoOne() {
  const d = activeDoc();
  if (!d || !d.past.length) return;
  const prev = d.past[d.past.length - 1];
  updateDoc(d.id, (x) => ({ ...x, past: x.past.slice(0, -1), future: [{ s: x.committed, label: prev.label }, ...x.future], cur: prev.s, committed: prev.s, rev: x.rev + 1 }));
}
export function redo() {
  redoOne();
  if (state.syncAll && state.docs.length > 1) { live((e) => e); syncCommitOthers('Làm lại'); }
}
function redoOne() {
  const d = activeDoc();
  if (!d || !d.future.length) return;
  const nx = d.future[0];
  updateDoc(d.id, (x) => ({ ...x, future: x.future.slice(1), past: [...x.past, { s: x.committed, label: nx.label }], cur: nx.s, committed: nx.s, rev: x.rev + 1 }));
}
/** Quay về bước i trong lịch sử (0 = ảnh gốc). */
export function jumpTo(i: number) {
  const d = activeDoc();
  if (!d) return;
  const timeline = [...d.past.map((p) => p.s), d.committed, ...d.future.map((f) => f.s)];
  const labels = ['Ảnh gốc', ...d.past.map((p) => p.label), ...d.future.map((f) => f.label)];
  // labels[k] mô tả bước dẫn tới timeline[k]
  const target = timeline[i];
  if (!target) return;
  const past: HistoryEntry[] = [];
  for (let k = 0; k < i; k++) past.push({ s: timeline[k], label: labels[k + 1] });
  const future: HistoryEntry[] = [];
  for (let k = i + 1; k < timeline.length; k++) future.push({ s: timeline[k], label: labels[k] });
  updateDoc(d.id, (x) => ({ ...x, past, future, cur: target, committed: target, rev: x.rev + 1 }));
}
export function resetAll() { edit('Đặt lại tất cả', () => blankEdit()); }

// ---------- Preset ----------
export function togglePreset(id: string, strength?: number) {
  const p = findPreset(id);
  if (!p) return;
  const d = activeDoc();
  if (!d) return;
  const on = d.cur.presets.some((l) => l.id === id);
  edit(on ? `Bỏ ${p.name}` : p.name, (e) => ({
    ...e,
    presets: on ? e.presets.filter((l) => l.id !== id) : [...e.presets, { id, strength: strength ?? p.strength }],
  }));
  if (!on) track('preset', id);
}
export function setPresets(layers: PresetLayer[], label: string) { edit(label, (e) => ({ ...e, presets: layers })); }
export function setPresetStrength(id: string, strength: number) {
  live((e) => ({ ...e, presets: e.presets.map((l) => (l.id === id ? { ...l, strength } : l)) }));
}
export function setLut(id: string | null, amount = 100) {
  edit(id ? 'Áp LUT' : 'Bỏ LUT', (e) => ({ ...e, manual: { ...e.manual, lut: id ? { id, amount } : null } }));
  if (id) track('lut', id);
}

/** Áp «công thức» của ảnh hiện tại cho tất cả ảnh (giữ cắt riêng của từng ảnh). */
export function applyRecipeToAll() {
  const d = activeDoc();
  if (!d) return;
  const recipe = d.cur;
  set({
    docs: state.docs.map((x) => {
      if (x.id === d.id) return x;
      const next: EditState = { ...structuredClone(recipe), geometry: x.cur.geometry };
      next.manual.heal = [];
      return { ...x, past: [...x.past, { s: x.committed, label: 'Áp công thức' }], future: [], cur: next, committed: next, rev: x.rev + 1 };
    }),
  });
}

export function setCustomPresets(p: Preset[]) { set({ customPresets: p }); }

/** Công thức: xuất cấu hình chỉnh thành file nhỏ (không chứa ảnh). */
export function recipeOf(d: Doc) {
  const { heal: _heal, ...manual } = d.cur.manual;
  void _heal;
  return { app: 'NoPhotoShop', v: 1, manual, presets: d.cur.presets };
}
export function applyRecipe(r: unknown) {
  const x = r as { app?: string; manual?: Partial<Params>; presets?: PresetLayer[] };
  if (x?.app !== 'NoPhotoShop' || !x.manual) throw new Error('File công thức không hợp lệ');
  edit('Áp công thức', (e) => ({ ...e, manual: { ...defaultParams(), ...x.manual, heal: [] }, presets: Array.isArray(x.presets) ? x.presets.slice(0, 10) : [] }));
}

/** Ghi lịch sử cho các ảnh khác sau khi đồng bộ (không đụng lịch sử ảnh đang chọn). */
function syncCommitOthers(label: string) {
  const id = state.activeId;
  set({ docs: state.docs.map((x) => (x.id === id || JSON.stringify(x.cur) === JSON.stringify(x.committed) ? x : { ...x, past: [...x.past, { s: x.committed, label }], future: [], committed: x.cur })) });
}
