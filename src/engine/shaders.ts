export const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

/** Làm mờ Gauss tách 2 chiều. Tọa độ FBO: hàng 0 = mép trên ảnh. */
export const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDir;
uniform float uSigma;
uniform vec2 uSize;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uSize;
  vec2 px = uDir / uSize;
  float s2 = 2.0 * uSigma * uSigma;
  int R = int(min(ceil(uSigma * 3.0), 40.0));
  vec4 acc = texture(uTex, uv);
  float wsum = 1.0;
  for (int i = 1; i <= 40; i++) {
    if (i > R) break;
    float w = exp(-float(i * i) / s2);
    acc += (texture(uTex, uv + px * float(i)) + texture(uTex, uv - px * float(i))) * w;
    wsum += 2.0 * w;
  }
  o = acc / wsum;
}`;

export const MAIN = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler2D uSrc;
uniform sampler2D uSmall;
uniform sampler2D uMid;
uniform sampler2D uLarge;
uniform sampler2D uCurve;
uniform sampler3D uLut;
uniform vec4 uTile;      // offsetX, offsetY, outW, outH (px)
uniform vec2 uTileSize;  // w, h của mảnh
uniform vec2 uSrcSize;   // kích thước texture nguồn (kể cả viền đệm)
uniform float uPad;
uniform float uSplit;    // 0 = không so sánh; x < split → ảnh gốc
uniform float uLutAmt;
uniform float uLutSize;
uniform vec3 uLutMin;
uniform vec3 uLutMax;
uniform float uCurveOn;
// thông số (đã chia 100)
uniform float uExposure, uContrast, uHighlights, uShadows, uWhites, uBlacks, uDehaze, uClarity;
uniform float uTemp, uTint, uVibrance, uSaturation;
uniform float uSmooth, uSkinBright, uSkinPink, uSkinEven, uAcne, uDarkCircle, uSkinWarm;
uniform float uSky, uFoliage, uSharpen, uDenoise, uGrain, uVignette, uFade;
uniform float uHue[8];
uniform float uSat[8];
uniform float uLum[8];
uniform vec3 uHeal[16];
uniform int uHealN;
out vec4 outColor;

const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
float luma(vec3 c){ return dot(c, LW); }
vec3 toLin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }

vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c){
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

float skinMask(vec3 c){
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  float cb = 0.5 - 0.168736*c.r - 0.331264*c.g + 0.5*c.b;
  float cr = 0.5 + 0.5*c.r - 0.418688*c.g - 0.081312*c.b;
  float m = smoothstep(0.26, 0.31, cb) * (1.0 - smoothstep(0.48, 0.52, cb))
          * smoothstep(0.515, 0.545, cr) * (1.0 - smoothstep(0.655, 0.70, cr));
  return m * smoothstep(0.10, 0.22, y) * (1.0 - smoothstep(0.96, 1.0, y));
}

// trọng số 8 dải màu theo hue (tâm: 0,30,60,120,180,225,270,315 độ)
void bandWeights(float h, out float w[8]){
  float c[9] = float[9](0.0, 30.0, 60.0, 120.0, 180.0, 225.0, 270.0, 315.0, 360.0);
  float hd = h * 360.0;
  for (int i = 0; i < 8; i++) w[i] = 0.0;
  for (int i = 0; i < 8; i++) {
    if (hd >= c[i] && hd < c[i+1]) {
      float t = (hd - c[i]) / (c[i+1] - c[i]);
      t = t * t * (3.0 - 2.0 * t);
      w[i] += 1.0 - t;
      int j = i + 1; if (j == 8) j = 0;
      w[j] += t;
    }
  }
}

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1,0)), c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main(){
  vec2 px = vec2(gl_FragCoord.x, uTileSize.y - gl_FragCoord.y);
  vec2 suv = (px + uPad) / uSrcSize;
  vec2 ou = (uTile.xy + px) / uTile.zw;
  float aspect = uTile.z / uTile.w;
  vec3 orig = texture(uSrc, suv).rgb;
  if (ou.x < uSplit) { outColor = vec4(orig, 1.0); return; }
  vec3 c = orig;
  vec3 sm = texture(uSmall, suv).rgb;
  vec3 mid = texture(uMid, ou).rgb;
  vec3 lg = texture(uLarge, ou).rgb;
  vec3 detail = orig - sm;

  // 1. Chấm xóa (healing): thay bằng trung bình vòng xung quanh
  for (int i = 0; i < 16; i++) {
    if (i >= uHealN) break;
    vec3 h = uHeal[i];
    vec2 d = (ou - h.xy) * vec2(aspect, 1.0);
    float dist = length(d);
    if (dist < h.z) {
      vec3 ring = vec3(0.0);
      for (int k = 0; k < 8; k++) {
        float a = float(k) * 0.785398;
        vec2 o = vec2(cos(a) / aspect, sin(a)) * h.z * 1.35;
        ring += texture(uMid, h.xy + o).rgb;
      }
      ring /= 8.0;
      float f = 1.0 - smoothstep(h.z * 0.55, h.z, dist);
      c = mix(c, ring + detail * 0.35, f);
      mid = mix(mid, ring, f);
    }
  }

  // 2. Khử nhiễu (giữ cạnh)
  float edge = length(detail);
  c = mix(c, sm, uDenoise * 0.9 * (1.0 - smoothstep(0.035, 0.14, edge)));

  // 3. Da: mịn, xóa mụn, đều màu, quầng thâm
  float sk = skinMask(mid) * mix(1.0, skinMask(c), 0.5);
  if (sk > 0.001) {
    float edgeMid = smoothstep(0.07, 0.2, length(c - mid));
    vec3 pores = c - sm;
    vec3 smoothC = mid + pores * 0.5;
    c = mix(c, smoothC, clamp(uSmooth * 1.1, 0.0, 1.0) * sk * (1.0 - edgeMid));
    float lm = luma(mid);
    float spot = smoothstep(0.02, 0.07, lm - luma(c)) * (1.0 - edgeMid * 0.5);
    float red = smoothstep(0.03, 0.09, (c.r - c.g) - (mid.r - mid.g));
    c = mix(c, mid + pores * 0.35, clamp(uAcne * max(spot, red * 0.7) * sk * 1.4, 0.0, 1.0));
    // đều màu: kéo sắc độ về trung bình vùng
    float yc = luma(c);
    vec3 chroma = c - yc;
    vec3 chromaMid = mid - lm;
    c = yc + mix(chroma, chromaMid, uSkinEven * sk);
    c += max(0.0, luma(lg) - lm) * uDarkCircle * sk * 0.9;
  }

  // 4. Cân bằng trắng + phơi sáng (tuyến tính)
  vec3 lin = toLin(c);
  vec3 wb = vec3(1.0 + 0.16 * uTemp, 1.0 - 0.10 * uTint, 1.0 - 0.16 * uTemp);
  wb /= luma(wb);
  float ev = exp2(uExposure * 2.5);
  lin *= wb * ev;
  c = toSrgb(lin);
  vec3 lgE = toSrgb(toLin(lg) * wb * ev);

  // 5. Vùng tối/sáng/trắng/đen (giữ màu theo tỷ lệ độ sáng)
  float y = luma(c);
  float yl = mix(y, luma(lgE), 0.65);
  float shM = 1.0 - smoothstep(0.0, 0.55, yl);
  float hiM = smoothstep(0.5, 1.0, yl); hiM *= hiM;
  float yn = y;
  yn += uShadows * (uShadows > 0.0 ? 0.42 : 0.3) * shM * (uShadows > 0.0 ? (1.0 - y) : y);
  yn += uHighlights * 0.5 * hiM * (uHighlights < 0.0 ? y : (1.0 - y) + 0.2);
  yn += uWhites * 0.18 * smoothstep(0.55, 1.0, y);
  yn += uBlacks * 0.14 * (1.0 - smoothstep(0.0, 0.4, y));
  float ratio = clamp(yn / max(y, 0.004), 0.0, 4.0);
  c = c * mix(ratio, 1.0, 0.25) + (yn - y) * 0.25;

  // 6. Dehaze (kênh tối của vùng lớn)
  if (uDehaze > 0.0) {
    float dc = min(min(lgE.r, lgE.g), lgE.b);
    float k = uDehaze * 0.75 * dc;
    c = (c - k) / max(1.0 - k, 0.25);
  } else if (uDehaze < 0.0) {
    c = mix(c, vec3(0.78), -uDehaze * 0.28);
  }

  // 7. Tương phản quanh 0.5 + độ rõ (local contrast)
  c = 0.5 + (c - 0.5) * (1.0 + uContrast * 0.55);
  y = luma(c);
  float yLoc = luma(lgE);
  float midtone = clamp(4.0 * y * (1.0 - y), 0.0, 1.0);
  c += (y - yLoc) * uClarity * 0.75 * midtone;

  // 8. Trời và cây
  vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
  if (uSky > 0.0) {
    float top = 1.0 - smoothstep(0.35, 0.85, ou.y);
    float blue = smoothstep(0.52, 0.56, hsv.x) * (1.0 - smoothstep(0.68, 0.74, hsv.x)) * smoothstep(0.08, 0.2, hsv.y) * smoothstep(0.3, 0.5, hsv.z);
    float cloud = smoothstep(0.62, 0.85, hsv.z) * (1.0 - smoothstep(0.12, 0.25, hsv.y)) * top;
    float m = blue * mix(0.6, 1.0, top) * uSky;
    hsv.y = clamp(hsv.y * (1.0 + 0.6 * m), 0.0, 1.0);
    hsv.z *= 1.0 - 0.16 * m;
    hsv.x = mix(hsv.x, 0.6, 0.25 * m);
    hsv.z = mix(hsv.z, clamp(0.5 + (hsv.z - 0.5) * 1.35, 0.0, 1.0), cloud * uSky * 0.7);
  }
  if (uFoliage > 0.0) {
    float g = smoothstep(0.12, 0.17, hsv.x) * (1.0 - smoothstep(0.42, 0.48, hsv.x)) * smoothstep(0.1, 0.25, hsv.y);
    float m = g * uFoliage;
    hsv.x = mix(hsv.x, 0.30, 0.35 * m);
    hsv.y = clamp(hsv.y * (1.0 + 0.45 * m), 0.0, 1.0);
    hsv.z = clamp(hsv.z * (1.0 + 0.08 * m), 0.0, 1.0);
  }
  // 9. HSL 8 dải
  float w[8];
  bandWeights(hsv.x, w);
  float dh = 0.0, ds = 0.0, dl = 0.0;
  for (int i = 0; i < 8; i++) { dh += w[i] * uHue[i]; ds += w[i] * uSat[i]; dl += w[i] * uLum[i]; }
  float satW = smoothstep(0.02, 0.15, hsv.y);
  hsv.x = fract(hsv.x + dh * 30.0 / 360.0 * satW);
  hsv.y = clamp(hsv.y * (1.0 + ds), 0.0, 1.0);
  hsv.z = clamp(hsv.z * (1.0 + dl * 0.45 * satW), 0.0, 1.5);
  c = hsv2rgb(hsv);

  // 10. Vibrance / bão hòa (bảo vệ da)
  y = luma(c);
  float sat = hsv.y;
  float vib = uVibrance * (1.0 - sat) * (1.0 - 0.6 * sk);
  c = mix(vec3(y), c, 1.0 + vib * 1.2);
  c = mix(vec3(y), c, 1.0 + uSaturation);

  // 11. Tông da: sáng da, hồng da, ấm/lạnh
  if (sk > 0.001) {
    float sk2 = sk * smoothstep(0.0, 0.08, sat + 0.04);
    c += uSkinBright * 0.16 * sk2 * (1.0 - luma(c));
    c += vec3(0.045, -0.02, 0.012) * uSkinPink * sk2;
    c += vec3(0.03, 0.008, -0.03) * uSkinWarm * sk2;
  }

  // 12. Đường cong
  if (uCurveOn > 0.5) {
    vec3 cc = clamp(c, 0.0, 1.0);
    cc = vec3(texture(uCurve, vec2(cc.r, 0.5)).r, texture(uCurve, vec2(cc.g, 0.5)).r, texture(uCurve, vec2(cc.b, 0.5)).r);
    cc = vec3(texture(uCurve, vec2(cc.r, 0.5)).g, texture(uCurve, vec2(cc.g, 0.5)).b, texture(uCurve, vec2(cc.b, 0.5)).a);
    c = cc;
  }

  // 13. LUT 3D
  if (uLutAmt > 0.0) {
    vec3 lc = clamp((clamp(c, 0.0, 1.0) - uLutMin) / (uLutMax - uLutMin), 0.0, 1.0);
    vec3 l = texture(uLut, lc * (uLutSize - 1.0) / uLutSize + 0.5 / uLutSize).rgb;
    c = mix(c, l, uLutAmt);
  }

  // 14. Độ nét (unsharp mask theo độ sáng), làm phai, vignette, hạt phim
  c += vec3(luma(detail)) * uSharpen * 1.6 * (1.0 - uDenoise * 0.6);
  c = mix(c, c * 0.88 + 0.1, uFade);
  vec2 vd = (ou - 0.5) * vec2(max(aspect, 1.0), max(1.0 / aspect, 1.0));
  float vr = length(vd) / length(vec2(max(aspect, 1.0), max(1.0 / aspect, 1.0)) * 0.5);
  float vm = smoothstep(0.35, 1.05, vr);
  c *= 1.0 + uVignette * vm * (uVignette < 0.0 ? 0.75 : 0.45);
  if (uGrain > 0.0) {
    vec2 gp = ou * vec2(1400.0 * aspect, 1400.0);
    float n = vnoise(gp) + vnoise(gp * 2.1 + 7.3) * 0.5 - 0.75;
    float yy = luma(c);
    c += n * uGrain * 0.11 * (1.0 - abs(yy - 0.5) * 1.2);
  }

  // 15. Chống cháy sáng mềm khi đã tăng sáng
  float roll = clamp(max(uExposure, 0.0) * 2.0 + max(uShadows, 0.0) * 0.5 + max(uWhites, 0.0), 0.0, 1.0);
  vec3 k = vec3(0.9);
  vec3 sh = mix(c, k + (1.0 - k) * (1.0 - exp(-(c - k) / (1.0 - k))), step(k, c));
  c = mix(c, sh, roll);

  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
