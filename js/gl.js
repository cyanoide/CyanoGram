// Moteur de rendu WebGL2 : un seul passage, tous les effets "argentique" dans le fragment shader.

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2  uRes;
uniform float uBypass;
uniform float uSeed;
uniform float uSeedG;

uniform float uExposure, uContrast, uHighlights, uShadows, uFade;
uniform float uTemp, uTint, uSat;
uniform float uShHue, uShSat, uHiHue, uHiSat;
uniform float uBloom, uBloomRadius, uHalation, uSoft;
uniform float uVignette, uVigBlur, uAberr, uDistort;
uniform float uGrain, uGrainSize, uDust, uHair, uScratch, uStain, uMote, uPartSize;
uniform float uLeak, uLeakHue, uLeakPos;

in vec2 vUv;
out vec4 outColor;

float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1,0)), f.x),
             mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), f.x), f.y);
}
vec3 hueRGB(float h){
  h = h / 360.0;
  return clamp(abs(fract(h + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

vec3 samp(vec2 uv){ return texture(uTex, uv).rgb; }

// flou approximé via les niveaux de mipmap
vec3 blurLod(vec2 uv, float lod){
  vec2 s = vec2(exp2(lod)) / uRes;
  vec3 c = vec3(0.0);
  float w = 0.0;
  for (int i = -1; i <= 1; i++){
    for (int j = -1; j <= 1; j++){
      float k = (i == 0 && j == 0) ? 2.0 : 1.0;
      c += textureLod(uTex, uv + vec2(float(i), float(j)) * s, lod).rgb * k;
      w += k;
    }
  }
  return c / w;
}

// ---- Particules d'émulsion : tailles en "hauteur d'image" => même rendu en aperçu et à l'export ----
// Recherche sur les 9 cellules voisines pour qu'aucune particule ne soit coupée au bord d'une cellule.
// Retourne vec2(clair, sombre) = opacité des particules claires / sombres.

vec2 dustLayer(vec2 q, float cells, float density, float rmin, float rmax, float seed, float aa){
  vec2 g = q * cells; vec2 id = floor(g);
  vec2 res = vec2(0.0);
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 c = id + vec2(float(i), float(j));
      float h = hash12(c + seed);
      if (h > density) continue;
      vec2 pos = c + hash22(c * 1.31 + seed * 1.7);
      float rad = mix(rmin, rmax, pow(hash12(c * 2.1 + seed + 4.0), 3.0));
      vec2 dv = (g - pos) / cells;
      float ang = atan(dv.y, dv.x);
      float wob = 1.0 + 0.9 * (vnoise(vec2(ang * 1.6, h * 40.0)) - 0.5);   // contour irrégulier
      float d = length(dv) / wob;
      float a = 1.0 - smoothstep(rad - aa, rad + aa, d);
      a *= mix(0.35, 0.95, hash12(c + seed + 9.0));
      if (hash12(c * 3.7 + seed + 11.0) < 0.22) res.y = max(res.y, a * 0.85);
      else res.x = max(res.x, a);
    }
  }
  return res;
}

// fibres / poils : polyligne fine et cassée (pas de belles courbes lisses)
vec2 hairLayer(vec2 q, float cells, float density, float seed, float aa, float sz){
  vec2 g = q * cells; vec2 id = floor(g);
  vec2 res = vec2(0.0);
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 c = id + vec2(float(i), float(j));
      if (hash12(c + seed + 7.0) > density) continue;
      vec2 r = hash22(c * 1.9 + seed * 2.3);
      vec2 p = c + r;
      float a = r.x * 6.2831;
      float L = mix(0.12, 0.85, pow(hash12(c + seed + 21.0), 1.5));
      float curl = pow(hash12(c + seed + 33.0), 2.0) * 1.7;
      float stepL = L / 6.0;
      float dmin = 1e3, tAt = 0.0;
      for (int k = 0; k < 6; k++){
        vec2 p2 = p + vec2(cos(a), sin(a)) * stepL;
        vec2 pa = g - p, ba = p2 - p;
        float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        float dd = length(pa - ba * t);
        if (dd < dmin){ dmin = dd; tAt = (float(k) + t) / 6.0; }
        p = p2;
        a += (hash12(c + seed + float(k) * 5.3 + 50.0) - 0.5) * 2.0 * curl;
      }
      float w = ((0.00055 * sz + aa * 0.5) * cells) * (0.55 + 0.45 * sin(3.1416 * tAt));
      float al = 1.0 - smoothstep(w * 0.5, w * 1.2 + aa * cells * 0.5, dmin);
      al *= mix(0.25, 0.85, hash12(c + seed + 61.0));
      if (hash12(c + seed + 67.0) < 0.25) res.y = max(res.y, al * 0.8);
      else res.x = max(res.x, al);
    }
  }
  return res;
}

// rayures verticales fines, intermittentes, un peu ondulées
float scratchLayer(vec2 q, float density, float seed, float aa, float sz){
  float cols = 36.0;
  float cx = floor(q.x * cols);
  float res = 0.0;
  for (int i = -1; i <= 1; i++){
    float c = cx + float(i);
    if (hash12(vec2(c, seed)) > density) continue;
    float x0 = (c + hash12(vec2(c, seed + 3.0))) / cols;
    float y0 = hash12(vec2(c, seed + 5.0)) * 0.9;
    float len = mix(0.08, 0.9, pow(hash12(vec2(c, seed + 9.0)), 1.5));
    float x = x0 + (vnoise(vec2(q.y * 14.0, c)) - 0.5) * 0.004;
    float ym = smoothstep(y0, y0 + 0.03, q.y) * (1.0 - smoothstep(y0 + len - 0.05, y0 + len, q.y));
    float w = 0.0005 * sz + aa * 0.5;
    float a = (1.0 - smoothstep(w * 0.5, w + aa, abs(q.x - x))) * ym;
    a *= 0.35 + 0.65 * vnoise(vec2(q.y * 45.0, c * 3.0));
    res = max(res, a * mix(0.2, 0.6, hash12(vec2(c, seed + 13.0))));
  }
  return res;
}

// taches d'eau / d'humidité : anneaux irréguliers, discrets
float stainLayer(vec2 q, float density, float seed, float aa, float sz){
  float cells = 4.0;
  vec2 g = q * cells; vec2 id = floor(g);
  float res = 0.0;
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 c = id + vec2(float(i), float(j));
      float h = hash12(c + seed + 71.0);
      if (h > density) continue;
      vec2 pos = c + hash22(c * 1.7 + seed * 3.1);
      float rad = mix(0.05, 0.26, hash12(c + seed + 73.0)) * sz;
      vec2 dv = g - pos;
      float ang = atan(dv.y, dv.x);
      float wob = 1.0 + 0.5 * (vnoise(vec2(ang * 2.0, h * 30.0)) - 0.5);
      float d = length(dv) / wob;
      float ring = exp(-pow((d - rad) / (rad * 0.08 + aa * cells), 2.0));
      float fill = (1.0 - smoothstep(rad * 0.9, rad, d)) * 0.3;
      res = max(res, (ring * 0.8 + fill) * mix(0.4, 1.0, hash12(c + seed + 79.0)));
    }
  }
  return res;
}

// bokeh de poussière : disques flous à bord plus lumineux
float moteLayer(vec2 q, float density, float seed, float aa, float sz){
  float cells = 5.0;
  vec2 g = q * cells; vec2 id = floor(g);
  float res = 0.0;
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 c = id + vec2(float(i), float(j));
      if (hash12(c + seed + 91.0) > density) continue;
      vec2 pos = c + hash22(c * 1.3 + seed * 2.9);
      float rad = mix(0.03, 0.10, hash12(c + seed + 93.0)) * sz;
      float d = length(g - pos);
      float disc = 1.0 - smoothstep(rad * 0.8, rad, d);
      float rim = exp(-pow((d - rad * 0.9) / (rad * 0.12), 2.0));
      res = max(res, (disc * 0.55 + rim * 0.45) * mix(0.06, 0.2, hash12(c + seed + 97.0)));
    }
  }
  return res;
}

void main(){
  vec2 uv = vUv;
  float aa = fwidth(vUv.y);
  float aspect = uRes.x / uRes.y;
  vec2 p = uv - 0.5;

  // image : origine en haut
  vec2 base = vec2(uv.x, 1.0 - uv.y);
  if (uBypass > 0.5){ outColor = vec4(samp(base), 1.0); return; }

  // distorsion (grand-angle / barillet)
  float r2 = dot(p, p);
  vec2 d = 0.5 + p * (1.0 + uDistort * (r2 - 0.5));
  vec2 st = vec2(d.x, 1.0 - d.y);
  vec2 pc = d - 0.5;

  // aberration chromatique radiale
  vec2 off = vec2(pc.x, -pc.y) * uAberr * 0.025;
  vec3 col = vec3(samp(st + off).r, samp(st).g, samp(st - off).b);

  // flou des bords + flou doux global
  float edge = smoothstep(0.18, 0.62, length(pc * vec2(1.0, 1.0)) * 1.25) * uVigBlur;
  if (edge > 0.001 || uSoft > 0.001){
    vec3 b = blurLod(st, 2.0 + edge * 2.0);
    col = mix(col, b, clamp(edge * 0.9 + uSoft * 0.55, 0.0, 1.0));
  }

  // lueur (bloom) + halation rouge/orangée
  if (uBloom > 0.001 || uHalation > 0.001){
    vec3 bl = blurLod(st, 3.0 + uBloomRadius * 3.0);
    float bm = smoothstep(0.30, 0.95, luma(bl));
    vec3 add = bl * bm * uBloom * 1.6;
    col = 1.0 - (1.0 - col) * (1.0 - clamp(add, 0.0, 1.0));
    vec3 hl = blurLod(st, 4.5 + uBloomRadius * 1.5);
    float hm = smoothstep(0.45, 1.0, luma(hl));
    col += vec3(1.0, 0.38, 0.12) * hm * uHalation * 0.65;
  }

  // exposition / balance des blancs
  col *= exp2(uExposure);
  col.r *= 1.0 + uTemp * 0.25;
  col.b *= 1.0 - uTemp * 0.25;
  col.g *= 1.0 - uTint * 0.2;
  col.rb *= 1.0 + uTint * 0.1;

  // ombres / hautes lumières
  float l = luma(col);
  float shM = 1.0 - smoothstep(0.0, 0.55, l);
  float hiM = smoothstep(0.45, 1.0, l);
  col += uShadows * 0.32 * shM;
  col += uHighlights * 0.30 * hiM;

  // contraste (pivot gris moyen), saturation
  col = (col - 0.5) * (1.0 + uContrast) + 0.5;
  l = luma(col);
  col = mix(vec3(l), col, 1.0 + uSat);

  // split toning (ombres / lumières)
  vec3 shC = hueRGB(uShHue), hiC = hueRGB(uHiHue);
  l = luma(col);
  float sw = 1.0 - smoothstep(0.0, 0.65, l);
  float hw = smoothstep(0.35, 1.0, l);
  col += (shC - luma(shC)) * uShSat * sw * 0.85;
  col += (hiC - luma(hiC)) * uHiSat * hw * 0.85;

  // voile (noirs relevés, teintés par la couleur des ombres)
  col = mix(col, 0.10 + 0.10 * shC, uFade * 0.5 * (1.0 - clamp(luma(col) * 1.2, 0.0, 1.0)));
  col = col * (1.0 - uFade * 0.12) + uFade * 0.08;

  // vignette
  float v = smoothstep(0.30, 0.90, length(pc) * 1.35);
  col *= 1.0 - uVignette * v * 0.85;

  // fuite de lumière
  if (uLeak > 0.001){
    float m = pow(max(0.0, 1.0 - abs(uv.x - uLeakPos) / 0.42), 2.2);
    m *= 0.65 + 0.35 * sin(uv.y * 4.0 + uSeed * 3.0);
    vec3 lc = hueRGB(uLeakHue) * 0.95 + 0.05;
    col = 1.0 - (1.0 - col) * (1.0 - lc * m * uLeak * 0.9);
  }

  // particules (poussière, fibres, rayures, taches, bokeh)
  if (uDust + uHair + uScratch + uStain + uMote > 0.001){
    vec2 q = vec2(uv.x * aspect, uv.y);
    float sd = uSeed * 11.0, sz = uPartSize;
    vec2 dl = vec2(0.0);
    if (uDust > 0.001){
      dl = max(dl, dustLayer(q, 12.0, 0.50 * uDust, 0.0008 * sz, 0.0030 * sz, sd, aa));
      dl = max(dl, dustLayer(q, 34.0, 0.35 * uDust, 0.0004 * sz, 0.0012 * sz, sd + 3.0, aa));
    }
    if (uHair > 0.001){
      dl = max(dl, hairLayer(q, 8.0, 0.20 * uHair, sd + 5.0, aa, sz));
      dl = max(dl, hairLayer(q, 4.0, 0.09 * uHair, sd + 9.0, aa, sz));
    }
    if (uScratch > 0.001) dl.x = max(dl.x, scratchLayer(q, 0.12 * uScratch, sd + 13.0, aa, sz));
    if (uStain > 0.001){
      float st = stainLayer(q, 0.30 * uStain, sd + 17.0, aa, sz);
      col = mix(col, col * vec3(0.80, 0.76, 0.70), st * 0.7);
    }
    col = mix(col, vec3(0.97, 0.96, 0.92), dl.x);
    col = mix(col, vec3(0.04), dl.y);
    if (uMote > 0.001){
      float mo = moteLayer(q, 0.35 * uMote, sd + 19.0, aa, sz);
      col = 1.0 - (1.0 - col) * (1.0 - vec3(1.0, 0.95, 0.85) * mo);
    }
  }

  // grain (taille relative à l'image => même rendu à l'export)
  if (uGrain > 0.001){
    float px = max(uRes.x, uRes.y);
    float cell = max(1.0, uGrainSize * px / 1600.0);
    vec2 gp = uv * uRes / cell;
    vec2 id = floor(gp);
    float sd = uSeedG * 13.7;
    float mono = mix(hash12(id + sd), vnoise(gp + sd), 0.35) - 0.5;
    vec3 g = vec3(hash12(id + sd + 17.3), hash12(id + sd + 41.7), hash12(id + sd + 63.1)) - 0.5;
    vec3 gr = mix(vec3(mono), g, 0.35);
    float lm = luma(col);
    float w = 1.0 - abs(lm - 0.5) * 1.1;
    col += gr * uGrain * 0.42 * w;
  }

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const UNIFORM_KEYS = [
  'exposure','contrast','highlights','shadows','fade',
  'temp','tint','sat','shHue','shSat','hiHue','hiSat',
  'bloom','bloomRadius','halation','soft','vignette','vigBlur','aberr','distort',
  'grain','grainSize','dust','hair','scratch','stain','mote','partSize','leak','leakHue','leakPos'
];
const uName = k => 'u' + k[0].toUpperCase() + k.slice(1);

export class Renderer {
  constructor(canvas){
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false
    });
    if (!gl) throw new Error('WebGL2 indisponible');
    this.gl = gl;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const k of UNIFORM_KEYS) this.u[k] = gl.getUniformLocation(prog, uName(k));
    this.uRes = gl.getUniformLocation(prog, 'uRes');
    this.uBypass = gl.getUniformLocation(prog, 'uBypass');
    this.uSeed = gl.getUniformLocation(prog, 'uSeed');
    this.uSeedG = gl.getUniformLocation(prog, 'uSeedG');
    this.tex = gl.createTexture();
    this.imgW = 1; this.imgH = 1;
  }

  setImage(source, w, h){
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.imgW = w; this.imgH = h;
  }

  resize(w, h){
    this.canvas.width = w; this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  // vidéo : nouvelle image dans la texture existante
  updateFrame(source){
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  render(params, { bypass = false, seed = 1, seedG = seed } = {}){
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // la résolution "logique" sert aux tailles relatives (grain, flou) : celle de l'image source
    gl.uniform2f(this.uRes, this.imgW, this.imgH);
    gl.uniform1f(this.uBypass, bypass ? 1 : 0);
    gl.uniform1f(this.uSeed, seed);
    gl.uniform1f(this.uSeedG, seedG);
    for (const k of UNIFORM_KEYS) gl.uniform1f(this.u[k], params[k] ?? 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
