export type Orientation = 'ngang' | 'doc' | 'vuong';

const RATIOS: [string, number][] = [
  ['16:9', 16 / 9], ['9:16', 9 / 16], ['4:3', 4 / 3], ['3:4', 3 / 4], ['4:5', 4 / 5], ['5:4', 5 / 4],
  ['1:1', 1], ['3:2', 3 / 2], ['2:3', 2 / 3], ['1.91:1', 1.91], ['21:9', 21 / 9],
];

export function orientationOf(w: number, h: number): Orientation {
  const r = w / h;
  if (r > 1.2) return 'ngang';
  if (r < 0.83) return 'doc';
  return 'vuong';
}

/** Nhãn tỷ lệ gần nhất (sai số 3%), hoặc null. */
export function ratioLabel(w: number, h: number): string | null {
  const r = w / h;
  for (const [label, v] of RATIOS) if (Math.abs(r - v) / v <= 0.03) return label;
  return null;
}

/** Gợi ý khung cắt mạng xã hội theo hướng ảnh. */
export function suggestCrops(w: number, h: number): { label: string; ratio: string; hint: string }[] {
  const o = orientationOf(w, h);
  if (o === 'doc')
    return [
      { label: 'Reels/TikTok', ratio: '9:16', hint: 'Dọc toàn màn hình' },
      { label: 'Instagram', ratio: '4:5', hint: 'Bài đăng dọc' },
      { label: 'Vuông', ratio: '1:1', hint: 'Ảnh đại diện, Instagram' },
      { label: 'Ảnh thẻ', ratio: '3:4', hint: 'CCCD, hồ sơ' },
    ];
  if (o === 'ngang')
    return [
      { label: 'YouTube', ratio: '16:9', hint: 'Ảnh bìa video' },
      { label: 'Facebook', ratio: '1.91:1', hint: 'Ảnh link, bài viết' },
      { label: 'Vuông', ratio: '1:1', hint: 'Instagram' },
      { label: 'Ảnh in', ratio: '3:2', hint: 'Khổ 10×15' },
    ];
  return [
    { label: 'Vuông', ratio: '1:1', hint: 'Instagram, Zalo' },
    { label: 'Instagram', ratio: '4:5', hint: 'Bài đăng dọc' },
    { label: 'Reels/TikTok', ratio: '9:16', hint: 'Dọc toàn màn hình' },
  ];
}

export function parseRatio(s: string): number | null {
  const m = /^([\d.]+):([\d.]+)$/.exec(s);
  return m ? Number(m[1]) / Number(m[2]) : null;
}
