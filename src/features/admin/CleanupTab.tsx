import { useEffect, useState } from 'react';
import { Eye, Download, Trash2, RotateCcw, Play } from 'lucide-react';
import { api, daysAgo, downloadText, fmtBytes, today } from './api';
import { toast } from '../../ui/toast';
import { Modal, Switch } from '../../ui/Modal';

type Mode = 'day' | 'range' | 'month' | 'year' | 'older';
const TYPES = [
  { k: 'stats', label: 'Thống kê' },
  { k: 'logs', label: 'Nhật ký lỗi' },
  { k: 'feedback', label: 'Phản hồi' },
  { k: 'audit', label: 'Nhật ký admin' },
];
interface Preview { records: number; bytes: number; keys: number; by: Record<string, { keys: number; records: number; bytes: number }> }
interface TrashRow { id: string; at: string; types: string[]; from: string; to: string; records: number; bytes: number }
interface Retention { enabled: boolean; logsDays: number; statsMonths: number; auditMonths: number; feedbackDays: number }

function lastDay(y: number, m: number) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

export function CleanupTab() {
  const [mode, setMode] = useState<Mode>('older');
  const [day, setDay] = useState(daysAgo(1));
  const [from, setFrom] = useState(daysAgo(60));
  const [to, setTo] = useState(daysAgo(30));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [olderN, setOlderN] = useState(90);
  const [olderU, setOlderU] = useState<'d' | 'm'>('d');
  const [types, setTypes] = useState<string[]>(['stats', 'logs']);
  const [withLuts, setWithLuts] = useState(false);
  const [prev, setPrev] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [trash, setTrash] = useState<TrashRow[]>([]);
  const [ret, setRet] = useState<Retention | null>(null);

  const range = (): [string, string] => {
    if (mode === 'day') return [day, day];
    if (mode === 'range') return [from, to];
    if (mode === 'month') { const [y, m] = month.split('-').map(Number); return [`${month}-01`, `${month}-${String(lastDay(y, m)).padStart(2, '0')}`]; }
    if (mode === 'year') return [`${year}-01-01`, `${year}-12-31`];
    return ['2000-01-01', daysAgo(olderU === 'd' ? olderN : Math.round(olderN * 30.44))];
  };
  const allTypes = [...types, ...(withLuts ? ['luts'] : [])];
  const loadTrash = () => api<{ trash: TrashRow[] }>('/api/admin/cleanup?trash=1').then((j) => setTrash(j.trash)).catch(() => {});
  useEffect(() => { loadTrash(); api<{ retention: Retention }>('/api/admin/cleanup?retention=1').then((j) => setRet(j.retention)).catch(() => {}); }, []);
  useEffect(() => setPrev(null), [mode, day, from, to, month, year, olderN, olderU, types, withLuts]);

  const preview = async () => {
    const [f, t] = range();
    try { setPrev(await api<Preview>('/api/admin/cleanup', { method: 'POST', body: { action: 'preview', from: f, to: t, types: allTypes } })); }
    catch (e) { toast((e as Error).message, 'err'); }
  };
  const backup = async (fmt: 'json' | 'csv') => {
    const [f, t] = range();
    try {
      const j = await api<{ data: Record<string, unknown> }>('/api/admin/cleanup', { method: 'POST', body: { action: 'backup', from: f, to: t, types: allTypes } });
      if (fmt === 'json') downloadText(JSON.stringify(j, null, 1), `sao-luu-${f}-${t}.json`);
      else {
        const lines = ['key,field,value'];
        for (const [k, v] of Object.entries(j.data)) {
          if (v && typeof v === 'object') for (const [fk, fv] of Object.entries(v as Record<string, unknown>)) lines.push([k, fk, JSON.stringify(String(fv))].join(','));
          else lines.push([k, '', JSON.stringify(String(v))].join(','));
        }
        downloadText(lines.join('\n'), `sao-luu-${f}-${t}.csv`, 'text/csv');
      }
    } catch (e) { toast((e as Error).message, 'err'); }
  };
  const [f, t] = range();
  return (
    <div className="stack">
      <div className="glass card stack">
        <h3>1. Chọn khoảng thời gian</h3>
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          {([['older', 'Cũ hơn N'], ['day', 'Một ngày'], ['range', 'Khoảng ngày'], ['month', 'Theo tháng'], ['year', 'Theo năm']] as [Mode, string][]).map(([k, l]) => (
            <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>
        <div className="row wrap">
          {mode === 'day' && <input className="input" type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} style={{ width: 190 }} />}
          {mode === 'range' && <>
            <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={{ width: 190 }} /> →
            <input className="input" type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} style={{ width: 190 }} />
          </>}
          {mode === 'month' && <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 190 }} />}
          {mode === 'year' && <input className="input" type="number" min={2020} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 120 }} />}
          {mode === 'older' && <>
            Cũ hơn <input className="input" type="number" min={1} max={3650} value={olderN} onChange={(e) => setOlderN(Number(e.target.value))} style={{ width: 100 }} />
            <div className="seg"><button className={olderU === 'd' ? 'on' : ''} onClick={() => setOlderU('d')}>ngày</button><button className={olderU === 'm' ? 'on' : ''} onClick={() => setOlderU('m')}>tháng</button></div>
          </>}
        </div>
        <p className="muted small">Khoảng áp dụng: <b>{mode === 'older' ? `trước ${t}` : `${f} → ${t}`}</b></p>
        <h3>2. Chọn loại dữ liệu</h3>
        <div className="row wrap">
          {TYPES.map((x) => (
            <label key={x.k} className="chip" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={types.includes(x.k)} onChange={(e) => setTypes(e.target.checked ? [...types, x.k] : types.filter((y) => y !== x.k))} /> {x.label}
            </label>
          ))}
        </div>
        <label className="row small warn"><input type="checkbox" checked={withLuts} onChange={(e) => setWithLuts(e.target.checked)} /> Gồm cả LUT/preset được tải lên trong khoảng này (chỉ chọn khi thật sự muốn)</label>
        <h3>3. Xem trước rồi xóa</h3>
        <div className="row wrap">
          <button className="btn" onClick={preview} disabled={!allTypes.length}><Eye size={20} /> Xem trước</button>
          <button className="btn" onClick={() => backup('json')} disabled={!allTypes.length}><Download size={20} /> Sao lưu JSON</button>
          <button className="btn" onClick={() => backup('csv')} disabled={!allTypes.length}><Download size={20} /> CSV</button>
          <button className="btn danger" disabled={!prev || !prev.keys} onClick={() => setConfirm(true)}><Trash2 size={20} /> Xóa…</button>
        </div>
        {prev && (
          <div className="preview-box">
            <b>{prev.records.toLocaleString('vi-VN')} bản ghi</b> trong {prev.keys} nhóm · giải phóng khoảng <b>{fmtBytes(prev.bytes)}</b>
            <div className="muted small">{Object.entries(prev.by).map(([k, v]) => `${TYPES.find((x) => x.k === k)?.label ?? 'LUT'}: ${v.records} (${fmtBytes(v.bytes)})`).join(' · ') || 'Không có dữ liệu khớp'}</div>
          </div>
        )}
      </div>

      <div className="glass card stack">
        <div className="row between"><h3>Thùng rác (giữ 7 ngày)</h3>
          {trash.length > 0 && <button className="btn sm danger" onClick={() => setConfirm(true)}>Xóa vĩnh viễn tất cả…</button>}
        </div>
        {!trash.length && <p className="muted small">Thùng rác trống.</p>}
        <div className="list">
          {trash.map((r) => (
            <div key={r.id} className="list-item">
              <div className="grow"><b>{r.types.join(', ')}</b> · {r.from === '2000-01-01' ? `trước ${r.to}` : `${r.from} → ${r.to}`}<div className="muted small">Xóa lúc {new Date(r.at).toLocaleString('vi-VN')} · {r.records} bản ghi · {fmtBytes(r.bytes)} · còn {Math.max(0, 7 - Math.floor((Date.now() - Date.parse(r.at)) / 86400000))} ngày</div></div>
              <button className="btn sm" onClick={async () => { try { await api('/api/admin/cleanup', { method: 'POST', body: { action: 'restore', id: r.id } }); toast('Đã khôi phục'); loadTrash(); } catch (e) { toast((e as Error).message, 'err'); } }}><RotateCcw size={18} /> Khôi phục</button>
            </div>
          ))}
        </div>
      </div>

      {ret && (
        <div className="glass card stack">
          <div className="row between"><h3>Tự động dọn (Vercel Cron hằng ngày)</h3><Switch label="Bật tự động dọn" checked={ret.enabled} onChange={(v) => setRet({ ...ret, enabled: v })} /></div>
          <div className="ret-grid">
            <label className="field"><span>Nhật ký lỗi giữ (ngày)</span><input className="input" type="number" value={ret.logsDays} onChange={(e) => setRet({ ...ret, logsDays: Number(e.target.value) })} /></label>
            <label className="field"><span>Thống kê giữ (tháng)</span><input className="input" type="number" value={ret.statsMonths} onChange={(e) => setRet({ ...ret, statsMonths: Number(e.target.value) })} /></label>
            <label className="field"><span>Phản hồi giữ (ngày)</span><input className="input" type="number" value={ret.feedbackDays} onChange={(e) => setRet({ ...ret, feedbackDays: Number(e.target.value) })} /></label>
            <label className="field"><span>Nhật ký admin giữ (tháng)</span><input className="input" type="number" value={ret.auditMonths} onChange={(e) => setRet({ ...ret, auditMonths: Number(e.target.value) })} /></label>
          </div>
          <div className="row wrap">
            <button className="btn primary" onClick={async () => { try { await api('/api/admin/cleanup', { method: 'POST', body: { action: 'retention', retention: ret } }); toast('Đã lưu chính sách'); } catch (e) { toast((e as Error).message, 'err'); } }}>Lưu chính sách</button>
            <button className="btn" onClick={async () => { try { await api('/api/admin/cleanup', { method: 'POST', body: { action: 'run-auto' } }); toast('Đã chạy dọn tự động'); loadTrash(); } catch (e) { toast((e as Error).message, 'err'); } }}><Play size={18} /> Chạy ngay</button>
          </div>
        </div>
      )}

      {confirm && <ConfirmDelete
        purgeAll={!prev}
        onClose={() => setConfirm(false)}
        onDone={() => { setConfirm(false); setPrev(null); loadTrash(); }}
        body={{ from: f, to: t, types: allTypes }}
        summary={prev ? `${prev.records} bản ghi (${fmtBytes(prev.bytes)})` : `${trash.length} mục trong thùng rác`}
      />}
    </div>
  );
}

function ConfirmDelete({ body, summary, purgeAll, onClose, onDone }: { body: Record<string, unknown>; summary: string; purgeAll: boolean; onClose: () => void; onDone: () => void }) {
  const [word, setWord] = useState('');
  const [pw, setPw] = useState('');
  const [perm, setPerm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Xác nhận xóa" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          if (purgeAll) {
            const r = await api<{ purged: number }>('/api/admin/cleanup', { method: 'POST', body: { action: 'purge', all: true, confirm: word, password: pw } });
            toast(`Đã xóa vĩnh viễn ${r.purged} mục`);
          } else {
            const r = await api<{ deleted: number; trash: boolean }>('/api/admin/cleanup', { method: 'POST', body: { action: 'delete', ...body, confirm: word, password: pw, permanent: perm } });
            toast(`Đã xóa ${r.deleted} bản ghi${r.trash ? ' (khôi phục được trong 7 ngày)' : ''}`);
          }
          onDone();
        } catch (er) { toast((er as Error).message, 'err'); }
        finally { setBusy(false); }
      }}>
        <div className="warn">Sẽ xóa <b>{summary}</b>.</div>
        <label className="field"><span>Bước 1: gõ chữ <b>XOA</b></span><input className="input" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" /></label>
        <label className="field"><span>Bước 2: nhập lại mật khẩu admin</span><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></label>
        {!purgeAll && <label className="row small"><input type="checkbox" checked={perm} onChange={(e) => setPerm(e.target.checked)} /> Xóa vĩnh viễn ngay (không vào thùng rác)</label>}
        <button className="btn danger lg block" disabled={busy || word !== 'XOA' || !pw}>{busy ? 'Đang xóa…' : 'Xóa'}</button>
      </form>
    </Modal>
  );
}
