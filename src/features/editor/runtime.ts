import { useEffect, useState } from 'react';
import { blurSources, ThumbMaker } from '../../engine/pipeline';
import type { Doc } from './store';
import type { Params } from '../../engine/params';

type Blur = { mid: HTMLCanvasElement; large: HTMLCanvasElement };
const blurCache = new Map<string, Blur>();

export const geomKey = (d: Doc) => d.id + JSON.stringify(d.cur.geometry);

export function getBlur(d: Doc): Blur {
  const k = geomKey(d);
  let b = blurCache.get(k);
  if (!b) {
    b = blurSources(d.bitmap, d.cur.geometry);
    blurCache.set(k, b);
    if (blurCache.size > 8) blurCache.delete(blurCache.keys().next().value!);
  }
  return b;
}

// Hàng đợi thumbnail: vẽ lần lượt bằng chính ảnh của người dùng.
const maker = new ThumbMaker();
const thumbCache = new Map<string, string>();
let chain: Promise<unknown> = Promise.resolve();

export function thumbFor(d: Doc, key: string, params: Params): Promise<string> {
  const k = geomKey(d) + '|' + key;
  const hit = thumbCache.get(k);
  if (hit) return Promise.resolve(hit);
  const job = chain.then(async () => {
    const again = thumbCache.get(k);
    if (again) return again;
    const url = await maker.make(d.bitmap, d.cur.geometry, getBlur(d), params);
    thumbCache.set(k, url);
    if (thumbCache.size > 300) thumbCache.delete(thumbCache.keys().next().value!);
    return url;
  });
  chain = job.catch(() => null);
  return job;
}

export function useThumb(d: Doc | null, key: string, params: () => Params): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const k = d ? geomKey(d) + '|' + key : '';
  useEffect(() => {
    if (!d) return;
    let off = false;
    setUrl(thumbCache.get(k) ?? null);
    const t = setTimeout(() => thumbFor(d, key, params()).then((u) => !off && setUrl(u)).catch(() => {}), 30);
    return () => { off = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return url;
}
