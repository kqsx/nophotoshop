/**
 * Bộ đọc file .cube (Adobe/Resolve/Photoshop/Lightroom-exported) — dùng chung cho client và API.
 * Chỉ hỗ trợ LUT 3D. Trả về lỗi tiếng Việt rõ ràng nếu file không hợp lệ.
 */
export interface CubeLut {
  title: string;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  data: Float32Array; // size³ × 3, R chạy nhanh nhất
}

export const CUBE_MAX_BYTES = 8 * 1024 * 1024;
export const CUBE_SIZES_OK = { min: 2, max: 65 };

export class CubeError extends Error {}

export function parseCube(text: string): CubeLut {
  if (typeof text !== 'string' || !text.trim()) throw new CubeError('File rỗng');
  if (text.length > CUBE_MAX_BYTES) throw new CubeError('File quá lớn (tối đa 8 MB)');
  if (/\u0000/.test(text.slice(0, 2000))) throw new CubeError('Đây không phải file văn bản .cube');
  let title = '';
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  let data: Float32Array | null = null;
  let idx = 0;
  const lines = text.split(/\r?\n/);
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln].trim();
    if (!line || line.startsWith('#')) continue;
    const c0 = line.charCodeAt(0);
    const isNum = (c0 >= 48 && c0 <= 57) || c0 === 45 || c0 === 46 || c0 === 43;
    if (!isNum) {
      const [kw, ...rest] = line.split(/\s+/);
      const key = kw.toUpperCase();
      if (key === 'TITLE') title = rest.join(' ').replace(/^"|"$/g, '').slice(0, 80);
      else if (key === 'LUT_3D_SIZE') {
        size = parseInt(rest[0], 10);
        if (!Number.isInteger(size) || size < CUBE_SIZES_OK.min || size > CUBE_SIZES_OK.max)
          throw new CubeError(`LUT_3D_SIZE không hợp lệ (${rest[0]}). Hỗ trợ 2–65, khuyên dùng 17 hoặc 33.`);
        data = new Float32Array(size * size * size * 3);
      } else if (key === 'LUT_1D_SIZE') throw new CubeError('Đây là LUT 1D. Chỉ hỗ trợ LUT 3D (LUT_3D_SIZE).');
      else if (key === 'DOMAIN_MIN' || key === 'DOMAIN_MAX') {
        const v = rest.slice(0, 3).map(Number) as [number, number, number];
        if (v.length !== 3 || v.some((x) => !Number.isFinite(x))) throw new CubeError(`Dòng ${ln + 1}: ${key} sai`);
        if (key === 'DOMAIN_MIN') domainMin = v; else domainMax = v;
      } else if (key === 'LUT_3D_INPUT_RANGE') {
        const a = Number(rest[0]), b = Number(rest[1]);
        domainMin = [a, a, a]; domainMax = [b, b, b];
      } else if (/^[A-Z_0-9]+$/.test(key)) {
        continue; // từ khóa lạ nhưng hợp lệ về cú pháp (vd. LUT_IN_VIDEO_RANGE): bỏ qua
      } else throw new CubeError(`Dòng ${ln + 1} không đọc được: “${line.slice(0, 40)}”`);
      continue;
    }
    if (!data) throw new CubeError('Thiếu LUT_3D_SIZE trước dữ liệu màu');
    const parts = line.split(/\s+/);
    if (parts.length < 3) throw new CubeError(`Dòng ${ln + 1}: cần 3 số R G B`);
    if (idx >= data.length) throw new CubeError('Số dòng dữ liệu nhiều hơn kích thước LUT');
    for (let k = 0; k < 3; k++) {
      const v = Number(parts[k]);
      if (!Number.isFinite(v) || v < -4 || v > 8) throw new CubeError(`Dòng ${ln + 1}: giá trị màu không hợp lệ`);
      data[idx++] = v;
    }
  }
  if (!data || !size) throw new CubeError('Không tìm thấy LUT_3D_SIZE — có thể không phải file .cube');
  if (idx !== data.length) throw new CubeError(`Thiếu dữ liệu: cần ${size ** 3} dòng, có ${idx / 3}`);
  for (let k = 0; k < 3; k++) if (!(domainMax[k] > domainMin[k])) throw new CubeError('DOMAIN_MIN/MAX không hợp lệ');
  return { title, size, domainMin, domainMax, data };
}

/** Lấy mẫu tam tuyến trên CPU (dùng để đổi cỡ LUT và kiểm thử). */
export function sampleCube(l: CubeLut, r: number, g: number, b: number): [number, number, number] {
  const n = l.size - 1;
  const f = (v: number, k: number) => Math.min(n, Math.max(0, ((v - l.domainMin[k]) / (l.domainMax[k] - l.domainMin[k])) * n));
  const x = f(r, 0), y = f(g, 1), z = f(b, 2);
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const x1 = Math.min(n, x0 + 1), y1 = Math.min(n, y0 + 1), z1 = Math.min(n, z0 + 1);
  const dx = x - x0, dy = y - y0, dz = z - z0;
  const s = l.size;
  const at = (xi: number, yi: number, zi: number, c: number) => l.data[((zi * s + yi) * s + xi) * 3 + c];
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const c00 = at(x0, y0, z0, c) * (1 - dx) + at(x1, y0, z0, c) * dx;
    const c10 = at(x0, y1, z0, c) * (1 - dx) + at(x1, y1, z0, c) * dx;
    const c01 = at(x0, y0, z1, c) * (1 - dx) + at(x1, y0, z1, c) * dx;
    const c11 = at(x0, y1, z1, c) * (1 - dx) + at(x1, y1, z1, c) * dx;
    out[c] = (c00 * (1 - dy) + c10 * dy) * (1 - dz) + (c01 * (1 - dy) + c11 * dy) * dz;
  }
  return out;
}

/** Đổi cỡ LUT (vd. 65³ → 33³) để nhẹ hơn. Kết quả luôn có domain 0…1. */
export function resizeCube(l: CubeLut, size: number): CubeLut {
  if (size === l.size && l.domainMin.every((v) => v === 0) && l.domainMax.every((v) => v === 1)) return l;
  const data = new Float32Array(size ** 3 * 3);
  let i = 0;
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        const toDom = (v: number, k: number) => l.domainMin[k] + (v / (size - 1)) * (l.domainMax[k] - l.domainMin[k]);
        const o = sampleCube(l, toDom(r, 0), toDom(g, 1), toDom(b, 2));
        data[i++] = o[0]; data[i++] = o[1]; data[i++] = o[2];
      }
  return { title: l.title, size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}

export function serializeCube(l: CubeLut): string {
  const lines = [`TITLE "${l.title.replace(/"/g, '')}"`, `LUT_3D_SIZE ${l.size}`];
  if (l.domainMin.some((v) => v !== 0)) lines.push(`DOMAIN_MIN ${l.domainMin.join(' ')}`);
  if (l.domainMax.some((v) => v !== 1)) lines.push(`DOMAIN_MAX ${l.domainMax.join(' ')}`);
  const d = l.data;
  const fmt = (v: number) => (Math.round(v * 10000) / 10000).toString();
  for (let i = 0; i < d.length; i += 3) lines.push(`${fmt(d[i])} ${fmt(d[i + 1])} ${fmt(d[i + 2])}`);
  return lines.join('\n') + '\n';
}

/** Làm sạch tên file → id an toàn. */
export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .replace(/\.[a-z0-9]+$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'lut'
  );
}
