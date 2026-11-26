import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api, daysAgo, downloadText, today } from './api';
import { toast } from '../../ui/toast';
import { PRESETS } from '../../presets/presets';

type Range = 'day' | 'week' | 'month' | 'year';
type Row = { bucket: string; visit: number; image: number; export: number; preset: number; lut: number; share: number; install: number; error: number };
interface Resp { series: Row[]; totals: Record<string, number>; top: Record<'presets' | 'luts' | 'devices' | 'sources' | 'formats', [string, number][]>; from: string; to: string }

const METRICS: { k: keyof Row; label: string; color: string }[] = [
  { k: 'visit', label: 'Lượt truy cập', color: '#0a84ff' },
  { k: 'image', label: 'Ảnh mở', color: '#bf5af2' },
  { k: 'export', label: 'Ảnh xuất', color: '#30d158' },
  { k: 'preset', label: 'Lượt dùng preset', color: '#ff375f' },
  { k: 'lut', label: 'Lượt dùng LUT', color: '#ff9f0a' },
];
const DEF: Record<Range, number> = { day: 30, week: 112, month: 365, year: 365 * 5 };
const presetName = (id: string) => PRESETS.find((p) => p.id === id)?.name ?? id;
const DEV: Record<string, string> = { mobile: 'Điện thoại', desktop: 'Máy tính', tablet: 'Máy tính bảng' };

export function StatsTab() {
  const [range, setRange] = useState<Range>('day');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [metric, setMetric] = useState<keyof Row>('visit');
  const [data, setData] = useState<Resp | null>(null);
  const load = () => api<Resp>(`/api/stats?range=${range}&from=${from}&to=${to}`).then(setData).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, [range, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = METRICS.find((x) => x.k === metric)!;
  const series = data?.series ?? [];
  const max = Math.max(1, ...series.map((r) => r[metric] as number));
  const csv = () => {
    const head = ['ky', ...METRICS.map((x) => x.k), 'share', 'install', 'error'];
    const lines = series.map((r) => [r.bucket, ...METRICS.map((x) => r[x.k]), r.share, r.install, r.error].join(','));
    downloadText([head.join(','), ...lines].join('\n'), `thong-ke-${range}-${from}-${to}.csv`, 'text/csv');
  };
  return (
    <div className="stack">
      <div className="row wrap">
        <div className="seg">
          {(['day', 'week', 'month', 'year'] as Range[]).map((r) => (
            <button key={r} className={range === r ? 'on' : ''} onClick={() => { setRange(r); setFrom(daysAgo(DEF[r])); setTo(today()); }}>
              {r === 'day' ? 'Ngày' : r === 'week' ? 'Tuần' : r === 'month' ? 'Tháng' : 'Năm'}
            </button>
          ))}
        </div>
        <label className="row small">Từ <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={{ width: 170 }} /></label>
        <label className="row small">đến <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} style={{ width: 170 }} /></label>
        <button className="btn sm" onClick={csv} disabled={!series.length}><Download size={18} /> CSV</button>
      </div>
      <div className="kpis">
        {METRICS.map((x) => (
          <button key={x.k} className={'kpi glass' + (metric === x.k ? ' on' : '')} onClick={() => setMetric(x.k)} style={{ ['--c' as string]: x.color }}>
            <span className="muted small">{x.label}</span>
            <b>{(data?.totals[x.k] ?? 0).toLocaleString('vi-VN')}</b>
          </button>
        ))}
      </div>
      <div className="glass card">
        <h3 style={{ marginBottom: 10 }}>{m.label} theo {range === 'day' ? 'ngày' : range === 'week' ? 'tuần' : range === 'month' ? 'tháng' : 'năm'}</h3>
        {series.length === 0 ? <p className="muted">Chưa có dữ liệu trong khoảng này.</p> : (
          <div className="chart" role="img" aria-label={`Biểu đồ ${m.label}`}>
            {series.map((r) => (
              <div key={r.bucket} className="bar-col" title={`${r.bucket}: ${r[metric]}`}>
                <span className="bar-v">{(r[metric] as number) || ''}</span>
                <div className="bar" style={{ height: `${((r[metric] as number) / max) * 100}%`, background: m.color }} />
                <span className="bar-l">{range === 'day' ? r.bucket.slice(5) : r.bucket}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {data && (
        <div className="tops">
          <Top title="Preset dùng nhiều" rows={data.top.presets.map(([k, v]) => [presetName(k), v])} />
          <Top title="LUT dùng nhiều" rows={data.top.luts} />
          <Top title="Thiết bị" rows={data.top.devices.map(([k, v]) => [DEV[k] ?? k, v])} />
          <Top title="Nguồn truy cập (utm_source)" rows={data.top.sources} />
          <Top title="Định dạng · cỡ xuất" rows={data.top.formats} />
        </div>
      )}
    </div>
  );
}

function Top({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="glass card">
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      {!rows.length && <p className="muted small">Chưa có</p>}
      {rows.map(([k, v]) => (
        <div key={k} className="top-row">
          <span className="ellipsis">{k}</span>
          <div className="top-bar"><div style={{ width: `${(v / max) * 100}%` }} /></div>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}
