import { BLUR, MAIN, VERT } from './shaders';
import { curveTable, isDefaultCurve, type Params } from './params';
import type { CubeLut } from './cube';

type Tex = WebGLTexture;
interface Target { tex: Tex; fbo: WebGLFramebuffer; w: number; h: number }

const SCALAR_UNIFORMS: [string, keyof Params][] = [
  ['uExposure', 'exposure'], ['uContrast', 'contrast'], ['uHighlights', 'highlights'], ['uShadows', 'shadows'],
  ['uWhites', 'whites'], ['uBlacks', 'blacks'], ['uDehaze', 'dehaze'], ['uClarity', 'clarity'],
  ['uTemp', 'temp'], ['uTint', 'tint'], ['uVibrance', 'vibrance'], ['uSaturation', 'saturation'],
  ['uSmooth', 'smooth'], ['uSkinBright', 'skinBright'], ['uSkinPink', 'skinPink'], ['uSkinEven', 'skinEven'],
  ['uAcne', 'acne'], ['uDarkCircle', 'darkCircle'], ['uSkinWarm', 'skinWarm'], ['uSky', 'sky'], ['uFoliage', 'foliage'],
  ['uSharpen', 'sharpen'], ['uDenoise', 'denoise'], ['uGrain', 'grain'], ['uVignette', 'vignette'], ['uFade', 'fade'],
];

export const MID_LONG = 1024;
export const LARGE_LONG = 256;

/**
 * Renderer WebGL2: một pipeline duy nhất dùng chung cho xem trước, thumbnail và xuất 4K theo mảnh.
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  readonly maxTex: number;
  /** Ai đang giữ texture nguồn (để thumbnail biết khi cần nạp lại). */
  owner: unknown = null;
  private main: WebGLProgram;
  private blur: WebGLProgram;
  private uMain = new Map<string, WebGLUniformLocation | null>();
  private uBlur = new Map<string, WebGLUniformLocation | null>();
  private src: Tex;
  private srcSize: [number, number] = [1, 1];
  private small: [Target, Target] | null = null;
  private mid: Tex | null = null;
  private large: Tex | null = null;
  private curve: Tex;
  private lut: Tex;
  private lutInfo: { id: string; size: number; min: number[]; max: number[] } | null = null;
  private lastCurveKey = '';

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('Trình duyệt không hỗ trợ WebGL2');
    this.gl = gl;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.main = this.program(VERT, MAIN);
    this.blur = this.program(VERT, BLUR);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    for (const p of [this.main, this.blur]) {
      const loc = gl.getAttribLocation(p, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.src = this.texture();
    this.curve = this.texture();
    this.lut = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, this.lut);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, 2, 2, 2, 0, gl.RGB, gl.FLOAT, new Float32Array(24));
    this.texParams3D();
  }

  private program(vs: string, fs: string) {
    const gl = this.gl;
    const mk = (type: number, s: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, s);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(sh));
      return sh;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(p));
    return p;
  }

  private texture(): Tex {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  private texParams3D() {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
  }

  private target(w: number, h: number): Target {
    const gl = this.gl;
    const tex = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }
  private freeTarget(t: Target) { this.gl.deleteTexture(t.tex); this.gl.deleteFramebuffer(t.fbo); }

  private u(map: Map<string, WebGLUniformLocation | null>, p: WebGLProgram, name: string) {
    if (!map.has(name)) map.set(name, this.gl.getUniformLocation(p, name));
    return map.get(name)!;
  }

  private blurPass(input: Tex, out: Target, dir: [number, number], sigma: number) {
    const gl = this.gl;
    gl.useProgram(this.blur);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.viewport(0, 0, out.w, out.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.u(this.uBlur, this.blur, 'uTex'), 0);
    gl.uniform2f(this.u(this.uBlur, this.blur, 'uDir'), dir[0], dir[1]);
    gl.uniform1f(this.u(this.uBlur, this.blur, 'uSigma'), sigma);
    gl.uniform2f(this.u(this.uBlur, this.blur, 'uSize'), out.w, out.h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Tạo texture mờ từ canvas, trả về texture kết quả (tạm thời dùng 2 FBO). */
  private blurredFrom(source: TexImageSource & { width: number; height: number }, sigma: number): Tex {
    const gl = this.gl;
    const w = source.width, h = source.height;
    const t0 = this.target(w, h);
    gl.bindTexture(gl.TEXTURE_2D, t0.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const t1 = this.target(w, h);
    this.blurPass(t0.tex, t1, [1, 0], sigma);
    this.blurPass(t1.tex, t0, [0, 1], sigma);
    gl.deleteFramebuffer(t0.fbo);
    this.freeTarget(t1);
    return t0.tex;
  }

  /** Nạp ảnh nền mờ toàn khung (không phụ thuộc độ phân giải xem trước/xuất). */
  setBlurSources(mid: HTMLCanvasElement, large: HTMLCanvasElement) {
    if (this.mid) this.gl.deleteTexture(this.mid);
    if (this.large) this.gl.deleteTexture(this.large);
    this.mid = this.blurredFrom(mid, 3.0);
    this.large = this.blurredFrom(large, 5.0);
  }

  /** Nạp mảnh nguồn (đã có viền đệm). */
  setSource(canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas as TexImageSource);
    const w = canvas.width, h = canvas.height;
    this.srcSize = [w, h];
    if (!this.small || this.small[0].w !== w || this.small[0].h !== h) {
      if (this.small) { this.freeTarget(this.small[0]); this.freeTarget(this.small[1]); }
      this.small = [this.target(w, h), this.target(w, h)];
    }
    this.blurPass(this.src, this.small[0], [1, 0], 1.4);
    this.blurPass(this.small[0].tex, this.small[1], [0, 1], 1.4);
  }

  setLut(id: string, lut: CubeLut) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_3D, this.lut);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, lut.size, lut.size, lut.size, 0, gl.RGB, gl.FLOAT, lut.data);
    this.texParams3D();
    this.lutInfo = { id, size: lut.size, min: lut.domainMin, max: lut.domainMax };
  }
  get lutId() { return this.lutInfo?.id ?? null; }

  private updateCurve(p: Params): boolean {
    const c = p.curves;
    const on = !(isDefaultCurve(c.master) && isDefaultCurve(c.r) && isDefaultCurve(c.g) && isDefaultCurve(c.b));
    if (!on) return false;
    const key = JSON.stringify(c);
    if (key !== this.lastCurveKey) {
      const m = curveTable(c.master), r = curveTable(c.r), g = curveTable(c.g), b = curveTable(c.b);
      const data = new Uint8Array(256 * 4);
      for (let i = 0; i < 256; i++) {
        data[i * 4] = Math.round(m[i] * 255);
        data[i * 4 + 1] = Math.round(r[i] * 255);
        data[i * 4 + 2] = Math.round(g[i] * 255);
        data[i * 4 + 3] = Math.round(b[i] * 255);
      }
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.curve);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      this.lastCurveKey = key;
    }
    return true;
  }

  /**
   * Vẽ một mảnh ra canvas của renderer (kích thước tileW×tileH).
   * tile: vị trí mảnh trong ảnh xuất outW×outH; pad: viền đệm của nguồn.
   */
  render(p: Params, o: { tileX: number; tileY: number; tileW: number; tileH: number; outW: number; outH: number; pad: number; split?: number }) {
    const gl = this.gl;
    if (!this.mid || !this.large || !this.small) return;
    if (this.canvas.width !== o.tileW || this.canvas.height !== o.tileH) {
      this.canvas.width = o.tileW;
      this.canvas.height = o.tileH;
    }
    const P = this.main;
    const U = (n: string) => this.u(this.uMain, P, n);
    gl.useProgram(P);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, o.tileW, o.tileH);
    const bind = (unit: number, tex: Tex, name: string, target: number = gl.TEXTURE_2D) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(target, tex);
      gl.uniform1i(U(name), unit);
    };
    bind(0, this.src, 'uSrc');
    bind(1, this.small[1].tex, 'uSmall');
    bind(2, this.mid, 'uMid');
    bind(3, this.large, 'uLarge');
    const curveOn = this.updateCurve(p);
    bind(4, this.curve, 'uCurve');
    bind(5, this.lut, 'uLut', gl.TEXTURE_3D);
    gl.uniform1f(U('uCurveOn'), curveOn ? 1 : 0);
    gl.uniform4f(U('uTile'), o.tileX, o.tileY, o.outW, o.outH);
    gl.uniform2f(U('uTileSize'), o.tileW, o.tileH);
    gl.uniform2f(U('uSrcSize'), this.srcSize[0], this.srcSize[1]);
    gl.uniform1f(U('uPad'), o.pad);
    gl.uniform1f(U('uSplit'), o.split ?? 0);
    const lutOn = p.lut && this.lutInfo && this.lutInfo.id === p.lut.id ? p.lut.amount / 100 : 0;
    gl.uniform1f(U('uLutAmt'), Math.max(0, Math.min(1, lutOn)));
    gl.uniform1f(U('uLutSize'), this.lutInfo?.size ?? 2);
    gl.uniform3fv(U('uLutMin'), this.lutInfo?.min ?? [0, 0, 0]);
    gl.uniform3fv(U('uLutMax'), this.lutInfo?.max ?? [1, 1, 1]);
    for (const [u, k] of SCALAR_UNIFORMS) gl.uniform1f(U(u), (p[k] as number) / 100);
    gl.uniform1fv(U('uHue[0]'), p.hslHue.map((v) => v / 100));
    gl.uniform1fv(U('uSat[0]'), p.hslSat.map((v) => v / 100));
    gl.uniform1fv(U('uLum[0]'), p.hslLum.map((v) => v / 100));
    const heal = new Float32Array(48);
    p.heal.slice(0, 16).forEach((h, i) => heal.set([h.x, h.y, h.r], i * 3));
    gl.uniform3fv(U('uHeal[0]'), heal);
    gl.uniform1i(U('uHealN'), Math.min(16, p.heal.length));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}
