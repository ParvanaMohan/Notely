#version 300 es
precision highp float;
out vec4 fragColor;

#define TWO_PI 6.28318530718
#define MAX_STOPS 8

uniform vec2  u_res;
uniform float u_time;

// Gradient field
uniform int   u_shape;
uniform float u_angle;
uniform vec2  u_center;
uniform float u_warp;
uniform float u_flow;
uniform float u_scale;
uniform int   u_octaves;
uniform float u_contrast;
uniform float u_softness;
uniform float u_aberration;
uniform float u_seed;
// Ramp
uniform int   u_stopCount;
uniform vec3  u_stopCol[MAX_STOPS];
uniform float u_stopPos[MAX_STOPS];
// Grain
uniform float u_grain;
uniform float u_grainsize;
uniform float u_grainSeed;
uniform int   u_grainBlendMode;   // -1 = additive
// Glass
uniform int   u_distortion;       // 0 none .. 4 frosted
uniform float u_distAmount;
uniform float u_distCount;
uniform float u_distShadows;
uniform float u_distHighlights;
uniform float u_distBump;
// Waves shape override + displacement
uniform int   u_waves;            // 1 = concentric rings replace shape
uniform float u_wavesFrequency;
uniform float u_wavesAmplitude;
uniform float u_wavesPhase;
uniform float u_wavesFalloff;
uniform float u_wavesDisplace;
uniform vec2  u_wavesCenter;
// Blobs
uniform int   u_blobs;
uniform int   u_blobLayout;       // 0 scatter, 1 particles
uniform float u_blobCount;
uniform float u_blobSize;
uniform float u_blobSpread;
uniform float u_blobSoftness;
uniform float u_blobMerge;
uniform float u_blobSeed;
uniform float u_blobDrift;
uniform float u_blobAmount;
uniform float u_blobDensity;
uniform int   u_blobShape;
uniform float u_blobShapeAmount;
// Post
uniform float u_pixelate;
uniform int   u_dither;
uniform int   u_ditherMode;       // 0 ordered, 1 white, 2 blue
uniform int   u_ditherMatrix;     // 2/4/8
uniform float u_ditherPattern;
uniform float u_ditherLevels;
uniform float u_ditherStrength;
uniform int   u_ditherColor;      // 1 rgb, 0 luma
// Light
uniform int   u_light;            // 0..4
uniform float u_lightAmount;
uniform float u_lightSize;
uniform vec2  u_lightCenter;
// Halftone
uniform int   u_halftone;
uniform float u_halftoneSize;
uniform int   u_halftoneStyle;
uniform int   u_halftoneStagger;
uniform float u_halftoneDotScale;
uniform int   u_halftoneColor;    // 1 source, 0 mono
uniform float u_halftoneBackground;
uniform vec3  u_halftonePaper;
uniform float u_halftoneEmboss;
// ASCII
uniform int   u_ascii;
uniform sampler2D u_asciiAtlas;
uniform float u_asciiCount;       // glyph count in atlas
uniform float u_asciiSize;
uniform float u_asciiCellRatio;
uniform int   u_asciiStyle;
uniform int   u_asciiColor;       // 1 source, 0 mono
uniform float u_asciiBackground;
uniform float u_asciiExposure;
uniform float u_asciiFill;
uniform float u_asciiDensity;
uniform float u_asciiScatter;
uniform float u_asciiOpacity;
uniform int   u_asciiBlend;       // 0 normal, 1 screen, 2 add
// Plaid
uniform int   u_plaid;
uniform float u_plaidColumnSize;
uniform float u_plaidRowSize;
uniform float u_plaidColumnStrength;
uniform float u_plaidRowStrength;
uniform float u_plaidBandWidth;
uniform float u_plaidBackground;
uniform float u_plaidAngle;
uniform int   u_plaidColorMode;   // 1 sample scene, 0 ink
uniform vec3  u_plaidInk;
uniform int   u_plaidBlendMode;
// Photo layer
uniform int   u_image;            // 1 = composite the photo
uniform sampler2D u_photo;
uniform vec2  u_imageRes;
uniform int   u_imgBlend;
uniform float u_gradientOverlay;
uniform vec2  u_imageOffset;
uniform float u_imageScale;
uniform float u_imgBrightness;
uniform float u_imgContrast;
uniform float u_imgSaturation;
uniform float u_imgExposure;
uniform int   u_imgFilter;

// ── Noise primitives (spec §2.6) ──────────────────────────────────────
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 permute(vec3 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0))
                  + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float noise(vec2 p){ return snoise(p) * 0.5 + 0.5; }
float fbm(vec2 p){
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 6; i++){
    if (i >= u_octaves) break;
    v += amp * noise(p);
    p *= 2.0; amp *= 0.5;
  }
  return v;
}

// ── Seamless-loop helpers (spec §1.4) ─────────────────────────────────
vec2  loopOffset(float amp){ return amp * vec2(sin(u_time), 1.0 - cos(u_time)); }
float loopPhaseAdd(float rate){ return u_time * max(1.0, floor(rate + 0.5)); }

float refPxScale(){ return max(min(u_res.x, u_res.y) / 1080.0, 0.05); }

// ── Blobs (spec §3) ───────────────────────────────────────────────────
float blobDistance(vec2 q, float phase){
  if (u_blobShape == 0) return length(q);
  if (u_blobShape == 1){
    float e = mix(2.0, 8.0, u_blobShapeAmount);
    return pow(pow(max(abs(q.x),1e-4), e) + pow(max(abs(q.y),1e-4), e), 1.0/e);
  }
  if (u_blobShape == 2){
    float e = mix(2.0, 0.7, u_blobShapeAmount);
    return pow(pow(max(abs(q.x),1e-4), e) + pow(max(abs(q.y),1e-4), e), 1.0/e);
  }
  float a = atan(q.y, q.x);
  float wob = sin(a*3.0 + phase) + 0.5*sin(a*5.0 - phase*1.7) + 0.3*sin(a*7.0 + phase*0.6);
  return length(q) / max(1.0 + u_blobShapeAmount * 0.22 * wob, 0.15);
}
float blobAccum(float g, inout float sum, inout float peak){
  sum += g; peak = max(peak, g); return 0.0;
}
float blobFieldScatter(vec2 p, float aspect){
  float sum = 0.0, peak = 0.0;
  for (int i = 0; i < 8; i++){
    if (float(i) >= u_blobCount) break;
    float fi = float(i);
    vec2 h = vec2(hash12(vec2(fi, u_blobSeed)), hash12(vec2(fi+37.0, u_blobSeed)));
    vec2 c = vec2(0.5*aspect, 0.5) + (h - 0.5) * u_blobSpread * vec2(aspect, 1.0);
    float ph = hash12(vec2(fi+11.0, u_blobSeed)) * TWO_PI;
    c += u_blobDrift * 0.12 * vec2(sin(u_time+ph), 1.0 - cos(u_time+ph));
    float r = max(u_blobSize * mix(0.6, 1.0, h.y), 1e-3);
    float d = blobDistance((p - c) / r, ph);
    float g = exp(-d*d * mix(6.0, 1.0, u_blobSoftness));
    sum += g; peak = max(peak, g);
  }
  return mix(peak, sum, u_blobMerge);
}
float blobFieldGrid(vec2 p, float aspect){
  float cells = mix(3.0, 40.0, u_blobDensity);
  vec2 gp = p * cells, base = floor(gp);
  float rad = max(u_blobSize * 0.5, 1e-3);
  float sum = 0.0, peak = 0.0;
  for (int oy = -1; oy <= 1; oy++){
    for (int ox = -1; ox <= 1; ox++){
      vec2 cell = base + vec2(float(ox), float(oy));
      vec2 h = vec2(hash12(cell + u_blobSeed), hash12(cell + u_blobSeed + 31.7));
      vec2 ctr = cell + 0.15 + 0.7*h;
      float ph = hash12(cell + u_blobSeed + 7.3) * TWO_PI;
      ctr += u_blobDrift * 0.3 * vec2(sin(u_time+ph), 1.0 - cos(u_time+ph));
      float r = rad * mix(0.35, 1.0, h.x);
      float d = blobDistance((gp - ctr) / max(r,1e-3), ph);
      float g = exp(-d*d * mix(6.0, 1.0, u_blobSoftness));
      sum += g; peak = max(peak, g);
    }
  }
  return mix(peak, sum, u_blobMerge);
}
float blobField(vec2 p, float aspect){
  return u_blobLayout == 1 ? blobFieldGrid(p, aspect) : blobFieldScatter(p, aspect);
}

// ── Colour ramp (spec §2.5) ───────────────────────────────────────────
vec3 sampleGradientStops(float t){
  float soften = u_softness * 0.25;
  if (u_stopCount <= 1) return u_stopCol[0];
  for (int i = 0; i < MAX_STOPS - 1; i++){
    if (i + 1 >= u_stopCount) break;
    float p0 = u_stopPos[i];
    float p1 = u_stopPos[i+1];
    if (t <= p1 || i + 2 >= u_stopCount){
      float u = clamp((t - p0) / max(p1 - p0, 1e-4), 0.0, 1.0);
      u = smoothstep(0.0 - soften, 1.0 + soften, u);
      return mix(u_stopCol[i], u_stopCol[i+1], u);
    }
  }
  return u_stopCol[u_stopCount - 1];
}

// ── Gradient field (spec §2) ──────────────────────────────────────────
vec3 fieldColorGenerate(vec2 uv){
  float aspect = u_res.x / u_res.y;
  float freqScale = mix(1.0, 0.45, u_softness);
  float effectiveContrast = mix(u_contrast, 1.0, u_softness);

  vec2 p = uv; p.x *= aspect;
  vec2 c = u_center; c.x *= aspect;

  vec2 nst = uv; nst.x *= aspect;
  nst *= u_scale; nst += u_seed;
  vec2 nstF = nst * freqScale;
  nstF += loopOffset(u_flow * 0.55);
  vec2 flowOff = loopOffset(u_flow * 0.18);

  vec2 q = vec2(fbm(nstF + loopOffset(0.1)),
                fbm(nstF + vec2(5.2,1.3) - loopOffset(0.1)));
  float fbmMean = 0.5 * (1.0 - pow(0.5, float(u_octaves)));
  vec2 warpOff = (q - fbmMean) * u_warp;

  vec2 pp = p + warpOff + flowOff;

  bool meshMode = (u_shape == 3);
  float f = 0.5;
  vec3 meshCol = vec3(0.0);

  if (u_waves == 1){
    vec2 wc = u_wavesCenter; wc.x *= aspect;
    float dist = length(pp - wc);
    float freq = mix(12.0, 88.0, u_wavesFrequency);
    float k = mix(0.0, 5.0, u_wavesFalloff);
    float phase = dist*freq/(1.0 + k*dist) + u_wavesPhase*TWO_PI + loopPhaseAdd(1.5);
    f = pow(sin(phase)*0.5 + 0.5, mix(1.0, 6.0, u_wavesAmplitude));
    meshMode = false;
  } else if (u_shape == 0){
    f = dot(pp - c, vec2(cos(u_angle), sin(u_angle))) + 0.5;
  } else if (u_shape == 1){
    f = length(pp - c) * 1.4;
  } else if (u_shape == 2){
    f = (atan(pp.y - c.y, pp.x - c.x) + 3.14159265) / TWO_PI;
  } else if (u_shape == 3){
    vec2 m = clamp(uv + warpOff*0.5 + flowOff*0.5, 0.0, 1.0);
    vec3 top = mix(u_stopCol[0], u_stopCol[min(1,u_stopCount-1)], m.x);
    vec3 bot = mix(u_stopCol[min(2,u_stopCount-1)], u_stopCol[min(3,u_stopCount-1)], m.x);
    meshCol = mix(top, bot, m.y);
    float centerMix = 1.0 - length((m - 0.5) * 2.0);
    meshCol = mix(meshCol, u_stopCol[min(4,u_stopCount-1)], smoothstep(0.0,1.0,centerMix) * 0.65);
  } else if (u_shape == 4){
    vec2 r = vec2(fbm(nstF + u_warp*q + vec2(1.7,9.2)),
                  fbm(nstF + u_warp*q + vec2(8.3,2.8)));
    f = fbm(nstF + u_warp*r);
  } else {
    vec2 c1 = vec2(u_center.x*aspect, u_center.y);
    vec2 c2 = vec2((1.0-u_center.x)*aspect, u_center.y);
    f = min(length(pp - c1), length(pp - c2)) * 1.4;
  }

  // Blobs mixed into the field (spec §2.3)
  if (u_blobs == 1 && u_blobAmount > 0.0){
    float bf = clamp(blobField(p + warpOff + flowOff, aspect), 0.0, 1.0);
    if (meshMode){ meshMode = false; f = 1.0 - bf; }
    else { f = mix(f, 1.0 - bf, u_blobAmount); }
  }

  if (meshMode) return meshCol;

  f = clamp((f - 0.5) * effectiveContrast + 0.5, 0.0, 1.0);
  return sampleGradientStops(f);
}

// ── Pixelate + waves displacement (spec §4) ───────────────────────────
vec2 applyPixelate(vec2 uv){
  if (u_pixelate < 2.0) return uv;
  float aspect = u_res.x / u_res.y;
  vec2 cells = vec2(u_pixelate * aspect, u_pixelate);
  return (floor(uv * cells) + 0.5) / cells;
}
vec2 wavesDisplaceUv(vec2 uv){
  if (u_wavesDisplace <= 0.0) return uv;
  float aspect = u_res.x / u_res.y;
  vec2 wc = u_wavesCenter;
  vec2 delta = (uv - wc) * vec2(aspect, 1.0);
  float dist = length(delta);
  float freq = mix(12.0, 88.0, u_wavesFrequency);
  float k = mix(0.0, 5.0, u_wavesFalloff);
  float phase = dist*freq/(1.0 + k*dist) + u_wavesPhase*TWO_PI + loopPhaseAdd(1.5);
  vec2 dir = dist > 1e-4 ? delta/dist : vec2(0.0, 1.0);
  vec2 offset = dir * sin(phase) * u_wavesDisplace * 0.06;
  offset.x /= aspect;
  return uv + offset;
}

// ── Glass (spec §5) ───────────────────────────────────────────────────
float flutePosition(float gx){
  float x = fract(gx);
  float edge = abs(x - 0.5) - 0.5;
  float band = smoothstep(-0.02, 0.02, edge);
  return mix(x, 1.0 - x, band);
}
float prismOffset(float gx, float fractCoord){
  float xs = flutePosition(gx);
  float distort = -pow(1.5 * xs, 3.0) + 0.5;
  float aa = 0.08;
  float fade = smoothstep(0.0, aa, fractCoord+1e-4) * smoothstep(1.0, 1.0-aa, fractCoord+1e-4);
  distort = mix(0.5, distort, fade);
  return distort * 3.0 * u_distAmount;
}
vec2 applyDistortion(vec2 uv){
  if (u_distortion == 0) return uv;
  float aspect = u_res.x / u_res.y;
  vec2 p = uv; p.x *= aspect;
  if (u_distortion == 1){                       // Fluted
    float strips = u_distCount;
    float gx = p.x * strips;
    vec2 off = vec2(prismOffset(gx, fract(gx)) / strips / aspect, 0.0);
    return uv + off;
  }
  if (u_distortion == 2){                       // Mosaic
    float cells = u_distCount;
    vec2 g = p * cells;
    vec2 off = vec2(prismOffset(g.x, fract(g.x)), prismOffset(g.y, fract(g.y))) / cells;
    off.x /= aspect;
    return uv + off;
  }
  if (u_distortion == 3){                       // Ripple
    vec2 wc = u_wavesCenter; wc.x *= aspect;
    vec2 d = p - wc; float dist = length(d);
    float freq = mix(12.0, 88.0, clamp((u_distCount-4.0)/56.0, 0.0, 1.0));
    float amp = u_distAmount * 0.034;
    vec2 dir = dist > 1e-4 ? d/dist : vec2(0.0,1.0);
    vec2 off = dir * sin(dist*freq + loopPhaseAdd(1.5)) * amp;
    off.x /= aspect;
    return uv + off;
  }
  // Frosted
  float scale = max(u_distCount, 1.0) * 0.5;
  vec2 warp = vec2(fbm(p*scale*0.1 + loopOffset(0.08)),
                   fbm(p*scale*0.1 + vec2(5.2,1.3) - loopOffset(0.08))) - 0.5;
  vec2 fine = vec2(fbm(p*scale*0.31 + vec2(1.7,9.2)),
                   fbm(p*scale*0.31 + vec2(8.3,2.8))) - 0.5;
  warp += fine * u_distBump;
  vec2 off = warp * u_distAmount * 0.14; off.x /= aspect;
  return uv + off;
}
float glassEdgeHighlight(float c){ return 1.0 - smoothstep(0.0,0.04,c)*smoothstep(1.0,0.96,c); }
vec3 applyGlassShading(vec3 col, vec2 uv){
  if (u_distortion == 0 || u_distortion == 4) return col;
  float aspect = u_res.x / u_res.y;
  vec2 p = uv; p.x *= aspect;
  float shadows = 0.0, highlights = 0.0;
  if (u_distortion == 1){
    float x = flutePosition(p.x * u_distCount);
    shadows = pow(x, 1.3) * u_distShadows * u_distShadows;
    highlights = glassEdgeHighlight(fract(p.x * u_distCount)) * u_distHighlights;
  } else if (u_distortion == 2){
    float sx = pow(flutePosition(p.x*u_distCount), 1.3);
    float sy = pow(flutePosition(p.y*u_distCount), 1.3);
    shadows = max(sx, sy) * u_distShadows * u_distShadows;
    highlights = max(glassEdgeHighlight(fract(p.x*u_distCount)),
                     glassEdgeHighlight(fract(p.y*u_distCount))) * u_distHighlights;
  } else if (u_distortion == 3){
    vec2 wc = u_wavesCenter; wc.x *= aspect;
    float dist = length(p - wc);
    float freq = mix(12.0, 88.0, clamp((u_distCount-4.0)/56.0, 0.0, 1.0));
    float wave = sin(dist*freq + loopPhaseAdd(1.5)) * 0.5 + 0.5;
    highlights = smoothstep(0.55, 1.0, wave) * u_distHighlights;
    shadows = (1.0 - wave) * 0.38 * u_distShadows;
  }
  col = mix(col, vec3(1.0), highlights);
  col *= (1.0 - shadows);
  return col;
}

// ── Blend modes (spec §9.3) ───────────────────────────────────────────
vec3 rgb2hsl(vec3 c){
  float mx = max(max(c.r,c.g),c.b), mn = min(min(c.r,c.g),c.b);
  float l = (mx+mn)*0.5, h = 0.0, s = 0.0;
  if (mx != mn){
    float d = mx - mn;
    s = l > 0.5 ? d/(2.0-mx-mn) : d/(mx+mn);
    if (mx == c.r) h = (c.g-c.b)/d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b-c.r)/d + 2.0;
    else h = (c.r-c.g)/d + 4.0;
    h /= 6.0;
  }
  return vec3(h,s,l);
}
float hue2rgb(float p, float q, float t){
  if (t < 0.0) t += 1.0; if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q-p)*6.0*t;
  if (t < 1.0/2.0) return q;
  if (t < 2.0/3.0) return p + (q-p)*(2.0/3.0-t)*6.0;
  return p;
}
vec3 hsl2rgb(vec3 hsl){
  float h=hsl.x,s=hsl.y,l=hsl.z;
  if (s == 0.0) return vec3(l);
  float q = l < 0.5 ? l*(1.0+s) : l+s-l*s;
  float p = 2.0*l-q;
  return vec3(hue2rgb(p,q,h+1.0/3.0), hue2rgb(p,q,h), hue2rgb(p,q,h-1.0/3.0));
}
vec3 blendOverlay(vec3 b, vec3 s){
  return mix(2.0*b*s, 1.0-2.0*(1.0-b)*(1.0-s), step(0.5, b));
}
vec3 blendSoftLight(vec3 b, vec3 s){
  return mix(2.0*b*s + b*b*(1.0-2.0*s),
             2.0*b*(1.0-s) + sqrt(b)*(2.0*s-1.0), step(0.5, s));
}
vec3 applyGradientBlend(vec3 base, vec3 bl, int mode){
  if (mode == 1) return base * bl;
  if (mode == 2) return 1.0 - (1.0-base)*(1.0-bl);
  if (mode == 3) return blendOverlay(base, bl);
  if (mode == 4) return blendSoftLight(base, bl);
  if (mode == 5) return blendOverlay(bl, base);
  if (mode == 6){ vec3 h = rgb2hsl(bl); vec3 bh = rgb2hsl(base); return hsl2rgb(vec3(h.x,h.y,bh.z)); }
  if (mode == 7) return abs(base - bl);
  if (mode == 8) return base + bl - 2.0*base*bl;
  return bl;
}

// ── Photo layer (spec §10) ────────────────────────────────────────────
vec3 applyImageFilter(vec3 col, int f){
  if (f == 1){ float g = dot(col, vec3(0.299,0.587,0.114)); return vec3(g); }
  if (f == 2) return clamp(mat3(0.393,0.349,0.272, 0.769,0.686,0.534, 0.189,0.168,0.131)*col, 0.0, 1.0);
  if (f == 3) return col * vec3(1.10,1.02,0.90);
  if (f == 4) return col * vec3(0.90,1.00,1.12);
  if (f == 5) return 1.0 - col;
  return col;
}
vec2 imageFrameUv(vec2 uv){ return ((uv - u_imageOffset) - 0.5) / u_imageScale + 0.5; }
vec2 imageCoverUv(vec2 uv){
  float frameAspect = u_res.x / u_res.y;
  float imgAspect = u_imageRes.x / u_imageRes.y;
  vec2 s = frameAspect > imgAspect ? vec2(1.0, imgAspect/frameAspect)
                                   : vec2(frameAspect/imgAspect, 1.0);
  return (uv - 0.5) * (vec2(frameAspect,1.0) / (s * max(frameAspect,1.0))) ;
}
vec3 compositeUpload(vec2 uv){
  vec3 grad = fieldColorGenerate(uv);
  vec2 fuv = imageFrameUv(uv);
  // object-fit: cover
  float frameAspect = u_res.x / u_res.y;
  float imgAspect = u_imageRes.x / u_imageRes.y;
  vec2 iuv = fuv;
  if (frameAspect > imgAspect) iuv.y = (fuv.y - 0.5) * (imgAspect/frameAspect) + 0.5;
  else                          iuv.x = (fuv.x - 0.5) * (frameAspect/imgAspect) + 0.5;
  bool fullCover = u_imageScale >= 1.0 && abs(u_imageOffset.x) < 1e-4 && abs(u_imageOffset.y) < 1e-4;
  vec4 tex = texture(u_photo, clamp(iuv, 0.0, 1.0));
  float inFrame = (iuv.x>=0.0 && iuv.x<=1.0 && iuv.y>=0.0 && iuv.y<=1.0) ? 1.0 : 0.0;
  float mask = (fullCover ? 1.0 : inFrame) * tex.a;
  vec3 col = tex.rgb;
  col *= exp2(u_imgExposure);
  col += u_imgBrightness;
  col = (col - 0.5) * u_imgContrast + 0.5;
  col = mix(vec3(dot(clamp(col,0.0,1.0), vec3(0.299,0.587,0.114))), col, u_imgSaturation);
  col = applyImageFilter(col, u_imgFilter);
  vec3 over = u_gradientOverlay <= 0.001 ? col
            : mix(col, applyGradientBlend(col, grad, u_imgBlend), u_gradientOverlay);
  return mix(grad, over, mask);
}

// ── Pipeline glue (spec §1.2) ─────────────────────────────────────────
vec3 fieldColorAt(vec2 uv){
  uv = applyPixelate(uv);
  uv = wavesDisplaceUv(uv);
  uv = applyDistortion(uv);
  if (u_image == 1) return compositeUpload(uv);
  return fieldColorGenerate(uv);
}
vec3 sceneWithAberration(vec2 uv){
  if (u_aberration > 0.001){
    vec2 dir = normalize(uv - 0.5 + 1e-5);
    float amt = u_aberration * 0.02;
    return vec3(fieldColorAt(uv + dir*amt).r,
                fieldColorAt(uv          ).g,
                fieldColorAt(uv - dir*amt).b);
  }
  return fieldColorAt(uv);
}
float ditherThreshold(vec2 fragCoord){
  vec2 cell = floor(fragCoord / max(u_ditherPattern, 1.0));
  if (u_ditherMode == 1){
    return fract(sin(dot(cell, vec2(12.9898,78.233)))*43758.5453) - 0.5;
  }
  if (u_ditherMode == 2){
    return fract(52.9829189 * fract(0.06711056*cell.x + 0.00583715*cell.y)) - 0.5;
  }
  float n = float(u_ditherMatrix);
  vec2 c = mod(cell, n);
  float idx = 0.0;
  // 4x4 Bayer as canonical ordered source, scaled to the chosen matrix size.
  int bx = int(mod(c.x, 4.0)); int by = int(mod(c.y, 4.0));
  int lin = by*4 + bx;
  float bayer4[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
  idx = bayer4[lin] / 16.0;
  return idx - 0.5;
}
vec3 applyDitherAt(vec3 col, vec2 fragCoord){
  float threshold = ditherThreshold(fragCoord) * u_ditherStrength;
  float levels = max(u_ditherLevels, 2.0);
  if (u_ditherColor == 1){
    return floor((col + threshold/levels) * (levels-1.0) + 0.5) / (levels-1.0);
  }
  float l = dot(col, vec3(0.2126,0.7152,0.0722));
  float lq = floor((l + threshold/levels) * (levels-1.0) + 0.5) / (levels-1.0);
  return col * (l > 0.001 ? lq/l : 1.0);
}
vec3 colorPipelineAt(vec2 uv){
  vec3 col = sceneWithAberration(uv);
  col = applyGlassShading(col, uv);
  if (u_dither == 1) col = applyDitherAt(col, uv * u_res);
  return col;
}

// ── Light (spec §7) ───────────────────────────────────────────────────
vec3 applyLight(vec2 uv, vec3 col){
  float aspect = u_res.x / u_res.y;
  vec2 d = (uv - u_lightCenter) * vec2(aspect, 1.0);
  float dist = length(d);
  if (u_light == 1){
    float glow = pow(1.0 - smoothstep(0.0, mix(0.12,0.95,u_lightSize), dist), 1.5);
    return col + col*glow*u_lightAmount*2.0 + glow*u_lightAmount*0.25;
  }
  if (u_light == 2){
    float ang = atan(d.y, d.x);
    float freq = mix(6.0, 36.0, u_lightSize);
    float rays = pow(noise(vec2(ang*freq*0.5 + 4.0, u_seed + u_time*0.1)), 2.0);
    float fall = 1.0 - smoothstep(0.0, 1.1, dist);
    return col + rays*fall*u_lightAmount;
  }
  if (u_light == 3){
    float z = mix(0.06, 0.012, u_lightSize);
    float e = 0.002;
    float nx = noise(uv + vec2(e,0.0)) - noise(uv - vec2(e,0.0));
    float ny = noise(uv + vec2(0.0,e)) - noise(uv - vec2(0.0,e));
    vec3 n = normalize(vec3(nx, ny, z));
    float fres = pow(1.0 - n.z, 2.0);
    float bands = mix(2.0, 8.0, u_lightSize);
    float phase = fres*bands + u_time*0.05;
    vec3 irid = 0.5 + 0.5*cos(TWO_PI*(phase + vec3(0.0,0.33,0.67)));
    return mix(col, col + irid, fres*u_lightAmount);
  }
  if (u_light == 4){
    float sc = mix(3.0, 11.0, u_lightSize);
    vec2 w = vec2(fbm(uv*sc + loopOffset(0.1)), fbm(uv*sc + vec2(3.1) - loopOffset(0.1)));
    float a = noise(uv*sc + w), b = noise(uv*sc + w + 0.15);
    float veins = pow(1.0 - abs(a - b), 6.0);
    return col + veins*u_lightAmount;
  }
  return col;
}

// ── ASCII (spec §8) ───────────────────────────────────────────────────
float asciiGlyph(vec2 cellUv, float sel){
  if (u_asciiStyle == 1) return step(0.5, sel);
  if (u_asciiStyle == 2) return step(length(cellUv-0.5), sel*0.48);
  if (u_asciiStyle == 3) return step(fract(cellUv.y*4.0), sel);
  if (u_asciiStyle == 4){
    float t = (1.0-sel)*0.45;
    return max(step(abs(cellUv.x-0.5), t*0.5), step(abs(cellUv.y-0.5), t*0.5));
  }
  if (u_asciiStyle == 5) return step(fract((cellUv.x+cellUv.y)*3.0), sel);
  // Characters — atlas lookup
  float idx = floor(sel * (u_asciiCount - 1.0));
  float u = (idx + cellUv.x) / u_asciiCount;
  return texture(u_asciiAtlas, vec2(u, cellUv.y)).r;
}
vec3 applyAscii(vec2 uv, vec3 baseCol){
  float cellW = max(u_asciiSize * refPxScale(), 4.0);
  float cellH = max(cellW * u_asciiCellRatio, 4.0);
  vec2 cellSize = vec2(1.0/max(floor(u_res.x/cellW),4.0), 1.0/max(floor(u_res.y/cellH),4.0));
  vec2 cellId = floor(uv/cellSize), cellUv = fract(uv/cellSize);
  vec2 jitter = (vec2(hash12(cellId+11.3), hash12(cellId+47.7)) - 0.5) * u_asciiScatter * cellSize;
  vec3 cellCol = colorPipelineAt((cellId + 0.5) * cellSize + jitter);
  float lum = clamp(dot(cellCol, vec3(0.2126,0.7152,0.0722)), 0.0, 1.0);
  float levels = max(u_asciiDensity, 2.0);
  float sel = clamp(floor(lum*levels)/(levels-1.0), 0.0, 1.0);
  float glyph = clamp(asciiGlyph(cellUv, sel) * u_asciiFill, 0.0, 1.0);
  vec3 base = u_asciiColor == 1 ? cellCol : vec3(lum);
  vec3 fg = clamp(base * u_asciiExposure, 0.0, 1.0);
  vec3 bg = mix(baseCol, vec3(0.0), u_asciiBackground);
  vec3 ink = fg * glyph;
  vec3 blended;
  if (u_asciiBlend == 1) blended = 1.0 - (1.0-baseCol)*(1.0-ink);
  else if (u_asciiBlend == 2) blended = min(baseCol + ink, 1.0);
  else blended = mix(bg, fg, glyph);
  return mix(baseCol, blended, u_asciiOpacity);
}

// ── Halftone (spec §9.1) ──────────────────────────────────────────────
vec3 applyHalftone(vec2 uv, vec3 baseCol){
  float cellPx = max(u_halftoneSize * refPxScale(), 4.0);
  vec2 cellSize = vec2(cellPx) / u_res;
  vec2 sampleUv = uv;
  if (u_halftoneStagger == 1 && mod(floor(uv.y/cellSize.y), 2.0) == 1.0)
    sampleUv.x += cellSize.x * 0.5;
  vec3 cellCol = colorPipelineAt(cellSize * (floor(sampleUv/cellSize) + 0.5));
  float lum = clamp(dot(cellCol, vec3(0.2126,0.7152,0.0722)), 0.0, 1.0);
  vec2 cellUv = fract(sampleUv/cellSize) - 0.5;
  float maxR = u_halftoneDotScale * 0.5;
  float radius = maxR * sqrt(0.08 + 0.92*lum);
  float aa = 1.0 / max(u_halftoneSize * refPxScale(), 4.0);
  float ink = 0.0;
  if (u_halftoneStyle == 1){
    float d = length(cellUv);
    ink = smoothstep(radius+aa, radius, d) * smoothstep(radius-maxR*0.22-aa, radius-maxR*0.22, d);
  } else if (u_halftoneStyle == 3){
    ink = smoothstep(maxR*0.92+aa, maxR*0.92, length(cellUv));
  } else if (u_halftoneStyle == 4){
    float d = max(abs(cellUv.x)*0.866 + cellUv.y*0.5, -cellUv.y);
    ink = smoothstep(radius+aa, radius, d);
  } else if (u_halftoneStyle == 5){
    ink = smoothstep(radius+aa, radius, abs(cellUv.x)+abs(cellUv.y));
  } else {
    ink = smoothstep(radius+aa, radius, length(cellUv));
  }
  vec3 inkCol = u_halftoneColor == 1 ? cellCol : vec3(lum);
  if (u_halftoneEmboss > 0.0 && ink > 0.001)
    inkCol *= clamp(1.0 + u_halftoneEmboss * ((-cellUv.x + cellUv.y) * 2.2) * 0.24, 0.58, 1.32);
  vec3 paper = mix(baseCol, u_halftonePaper, u_halftoneBackground);
  return mix(paper, inkCol, clamp(ink, 0.0, 1.0));
}

// ── Plaid (spec §9.2) ─────────────────────────────────────────────────
vec3 applyPlaid(vec2 uv, vec3 baseCol){
  float aspect = u_res.x / u_res.y;
  float ca = cos(u_plaidAngle), sa = sin(u_plaidAngle);
  vec2 pu = uv - 0.5; pu.x *= aspect;
  vec2 ru = vec2(pu.x*ca + pu.y*sa, -pu.x*sa + pu.y*ca);
  vec2 cellSize = vec2(max(u_plaidColumnSize*refPxScale(),4.0),
                       max(u_plaidRowSize*refPxScale(),4.0)) / u_res;
  float bw = clamp(u_plaidBandWidth, 0.02, 1.0);
  float aaX = cellSize.x * 0.5, aaY = cellSize.y * 0.5;
  float colFrac = abs(fract(ru.x/cellSize.x) - 0.5) * 2.0;
  float rowFrac = abs(fract(ru.y/cellSize.y) - 0.5) * 2.0;
  float colCoverage = 1.0 - smoothstep(bw - aaX, bw + aaX, colFrac);
  float rowCoverage = 1.0 - smoothstep(bw - aaY, bw + aaY, rowFrac);
  // band centres, rotated back to scene uv for the tint sample
  float colCenter = (floor(ru.x/cellSize.x) + 0.5) * cellSize.x;
  float rowCenter = (floor(ru.y/cellSize.y) + 0.5) * cellSize.y;
  vec2 colScene = vec2(colCenter*ca - ru.y*sa, colCenter*sa + ru.y*ca);
  vec2 rowScene = vec2(ru.x*ca - rowCenter*sa, ru.x*sa + rowCenter*ca);
  colScene.x /= aspect; rowScene.x /= aspect;
  vec3 vTint = u_plaidColorMode == 1 ? colorPipelineAt(colScene + 0.5) : u_plaidInk;
  vec3 hTint = u_plaidColorMode == 1 ? colorPipelineAt(rowScene + 0.5) : u_plaidInk;
  vec3 col = mix(baseCol, vec3(1.0), u_plaidBackground);
  col = mix(col, applyGradientBlend(col, vTint, u_plaidBlendMode), u_plaidColumnStrength * colCoverage);
  col = mix(col, applyGradientBlend(col, hTint, u_plaidBlendMode), u_plaidRowStrength * rowCoverage);
  return col;
}

// ── main (spec §1.2) ──────────────────────────────────────────────────
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 col = colorPipelineAt(uv);
  if (u_light > 0) col = applyLight(uv, col);
  if (u_plaid == 1) col = applyPlaid(uv, col);
  if (u_halftone == 1) col = applyHalftone(uv, col);
  if (u_ascii == 1) col = applyAscii(uv, col);

  float gr = hash12(floor(gl_FragCoord.xy / max(u_grainsize,0.5))
                    + u_grainSeed
                    + mod(floor(u_time*24.0), floor(TWO_PI*24.0)) * 137.0) - 0.5;
  if (u_grainBlendMode >= 0)
    col = mix(col, applyGradientBlend(col, vec3(0.5+gr), u_grainBlendMode), u_grain);
  else
    col += gr * u_grain;

  col += (hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 41.7) - 1.0) / 255.0;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
