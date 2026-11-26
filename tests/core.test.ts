import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCube, resizeCube, sampleCube, serializeCube, CubeError } from '../src/engine/cube';
import { parseXmp } from '../src/engine/xmp';
import { orientationOf, ratioLabel, suggestCrops } from '../src/analysis/aspect';
import { aggregate, bucketOf, isoWeek } from '../api/_lib/agg';
import { combine, curveTable, defaultParams } from '../src/engine/params';

describe('.cube', () => {
  it('đọc LUT mặc định 17³', () => {
    const l = parseCube(readFileSync('public/luts/phim-am.cube', 'utf8'));
    expect(l.size).toBe(17);
    expect(l.data.length).toBe(17 ** 3 * 3);
  });
  it('từ chối file sai', () => {
    expect(() => parseCube('hello')).toThrow(CubeError);
    expect(() => parseCube('LUT_1D_SIZE 4\n0 0 0')).toThrow(/1D/);
    expect(() => parseCube('LUT_3D_SIZE 2\n0 0 0\n')).toThrow(/Thiếu/);
    expect(() => parseCube('LUT_3D_SIZE 99\n')).toThrow(/2–65/);
  });
  it('LUT đồng nhất giữ nguyên màu, đổi cỡ được', () => {
    const lines = ['TITLE "id"', 'LUT_3D_SIZE 5'];
    for (let b = 0; b < 5; b++) for (let g = 0; g < 5; g++) for (let r = 0; r < 5; r++) lines.push(`${r / 4} ${g / 4} ${b / 4}`);
    const l = parseCube(lines.join('\n'));
    const s = sampleCube(l, 0.3, 0.6, 0.9);
    expect(s[0]).toBeCloseTo(0.3); expect(s[2]).toBeCloseTo(0.9);
    const r = resizeCube(l, 3);
    expect(r.size).toBe(3);
    expect(parseCube(serializeCube(r)).size).toBe(3);
  });
});

describe('Lightroom .xmp', () => {
  it('quy đổi thông số', () => {
    const x = parseXmp('<x:xmpmeta><rdf:Description crs:Exposure2012="+0.50" crs:Contrast2012="+20" crs:Vibrance="15" crs:SaturationAdjustmentBlue="-30" crs:IncrementalTemperature="10"/></x:xmpmeta>');
    expect(x.delta.exposure).toBe(20);
    expect(x.delta.vibrance).toBe(15);
    expect(x.delta.hslSat?.[5]).toBe(-30);
    expect(() => parseXmp('<html/>')).toThrow();
  });
});

describe('hướng & tỷ lệ ảnh', () => {
  it('nhận đúng', () => {
    expect(orientationOf(1920, 1080)).toBe('ngang');
    expect(orientationOf(1080, 1920)).toBe('doc');
    expect(orientationOf(1000, 1000)).toBe('vuong');
    expect(ratioLabel(1920, 1080)).toBe('16:9');
    expect(ratioLabel(1080, 1920)).toBe('9:16');
    expect(ratioLabel(1080, 1350)).toBe('4:5');
    expect(suggestCrops(1080, 1920)[0].ratio).toBe('9:16');
    expect(suggestCrops(1920, 1080)[0].ratio).toBe('16:9');
  });
});

describe('thống kê', () => {
  it('gộp theo tuần/tháng/năm', () => {
    expect(isoWeek(new Date('2026-01-01T00:00:00Z'))).toBe('2026-T01');
    expect(bucketOf('2026-03-15', 'month')).toBe('2026-03');
    const a = aggregate([
      { day: '2026-03-01', data: { visit: '2', 'preset:beauty': '3', 'dev:mobile': '2' } },
      { day: '2026-03-20', data: { visit: '5', export: '1' } },
    ], 'month');
    expect(a.series).toHaveLength(1);
    expect(a.series[0].visit).toBe(7);
    expect(a.top.presets[0]).toEqual(['beauty', 3]);
  });
});

describe('thông số', () => {
  it('cộng preset theo cường độ', () => {
    const p = combine(defaultParams(), [{ delta: { exposure: 20, hslSat: [10, 0, 0, 0, 0, 0, 0, 0] }, strength: 50 }]);
    expect(p.exposure).toBe(10);
    expect(p.hslSat[0]).toBe(5);
  });
  it('đường cong đồng nhất', () => {
    const t = curveTable([[0, 0], [1, 1]]);
    expect(t[128]).toBeCloseTo(128 / 255);
  });
});
