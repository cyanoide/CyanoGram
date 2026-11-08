import { Renderer } from './gl.js';
import { SCHEMA, GROUPS, PRESETS, PARTICLE_STYLES } from './presets.js';
import { readExif, injectMetadata, hasGps } from './exif.js';

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const slug = s => (s || 'photo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';
const view = $('#view');
let R, T; // renderer principal + renderer de vignettes

const state = {
  presetId: 'original', intensity: 1, delta: {}, seed: Math.random() * 100,
  w: 0, h: 0, srcW: 0, srcH: 0, bypass: false, loaded: false, name: 'photo', meta: null, exportUrl: null,
};

// ---------- filtres perso (localStorage) ----------
// Double sauvegarde : stockage local + un cookie compact (1 an). Le cookie est renvoyé au serveur à chaque
// requête : on le garde donc petit (valeurs non-défaut seulement, < 3,5 Ko) ; au-delà, seul le stockage
// local et le fichier de sauvegarde font foi.
const CK = 'cg_styles', CK_MAX = 3500;
const clean = s => String(s).replace(/[|;,=]/g, ' ');
function toCookie(list){
  return list.map(p => {
    const kv = SCHEMA.filter(s => p.params[s.key] != null && Math.abs(p.params[s.key] - s.def) > 0.004)
      .map(s => `${s.key}=${+(+p.params[s.key]).toFixed(2)}`).join(',');
    return [p.id, clean(p.name), p.seed != null ? +(+p.seed).toFixed(2) : '', kv].join('|');
  }).join(';');
}
function fromCookie(str){
  return str.split(';').filter(Boolean).map(row => {
    const [id, name, seed, kv] = row.split('|');
    const params = {};
    for (const pair of (kv || '').split(',').filter(Boolean)){
      const [k, v] = pair.split('=');
      if (SCHEMA.some(s => s.key === k) && isFinite(+v)) params[k] = +v;
    }
    return { id, name, custom: true, params, seed: seed === '' ? undefined : +seed };
  }).filter(p => p.id && p.name);
}
const cookies = {
  get(){
    const m = document.cookie.split('; ').find(c => c.startsWith(CK + '='));
    try { return m ? fromCookie(decodeURIComponent(m.slice(CK.length + 1))) : []; } catch { return []; }
  },
  set(list){
    if (!list.length){ document.cookie = `${CK}=; max-age=0; path=/; SameSite=Lax`; return true; }
    const val = encodeURIComponent(toCookie(list));
    if (val.length > CK_MAX) return false;
    document.cookie = `${CK}=${val}; max-age=31536000; path=/; SameSite=Lax`;
    return true;
  },
};
const store = {
  get(){
    let ls = [];
    try { ls = JSON.parse(localStorage.getItem('cyanogram.custom') || '[]'); } catch {}
    const ck = cookies.get();
    return ls.length >= ck.length ? ls : ck;     // si le stockage local a été vidé, le cookie reprend la main
  },
  set(v){
    try { localStorage.setItem('cyanogram.custom', JSON.stringify(v)); } catch {}
    if (!cookies.set(v)) toast('Trop de styles pour le cookie : pense à « Sauvegarder mes styles » (fichier)');
  },
};
let custom = store.get();
const allPresets = () => [...PRESETS, ...custom];
const currentPreset = () => allPresets().find(p => p.id === state.presetId) || PRESETS[0];

// ---------- paramètres effectifs = base du filtre (x intensité) + ajustements manuels ----------
function baseline(){
  const p = currentPreset().params, out = {};
  for (const s of SCHEMA){
    const pv = p[s.key] ?? s.def;
    out[s.key] = s.copy ? pv : s.def + (pv - s.def) * state.intensity;
  }
  return out;
}
function params(){
  const b = baseline(), o = {};
  for (const s of SCHEMA) o[s.key] = clamp(b[s.key] + (state.delta[s.key] || 0), s.min, s.max);
  return o;
}

// ---------- rendu ----------
let queued = false;
function draw(){
  if (queued || !state.loaded) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    R.render(params(), { bypass: state.bypass, seed: state.seed });
  });
}

// ---------- chargement image (pleine résolution, dans les limites de l'appareil) ----------
const IS_APPLE = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const IS_SAFARI = IS_APPLE || /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
const MAX_PIXELS = IS_SAFARI ? 16777216 : 100000000;   // Safari limite la surface d'un canvas à 16,7 Mpx

function maxDim(){
  const gl = R.gl;
  return Math.min(R.maxTex, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0]);
}

async function loadFile(file){
  if (!file || !file.type.startsWith('image/')) return;
  state.name = file.name.replace(/\.[^.]+$/, '');
  state.meta = null;
  try {
    const buf = await file.arrayBuffer();
    state.meta = readExif(buf);
  } catch {}
  const url = URL.createObjectURL(file);
  try { await loadURL(url); }
  catch { toast('Image illisible'); }
  finally { URL.revokeObjectURL(url); }
  if (state.loaded){
    if (state.meta && hasGps(state.meta)) toast('Métadonnées détectées (localisation incluse)');
    else if (state.meta) toast('Métadonnées détectées (sans localisation)');
  }
}

async function loadURL(url){
  const img = new Image();
  img.src = url;
  await img.decode();
  const nw = img.naturalWidth, nh = img.naturalHeight;
  let s = Math.min(1, maxDim() / Math.max(nw, nh), Math.sqrt(MAX_PIXELS / (nw * nh)));
  const w = Math.max(1, Math.floor(nw * s)), h = Math.max(1, Math.floor(nh * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  R.setImage(c, w, h);

  // vignette carrée (recadrage centré)
  const t = document.createElement('canvas'); t.width = t.height = 192;
  const m = Math.min(w, h);
  t.getContext('2d').drawImage(c, (w - m) / 2, (h - m) / 2, m, m, 0, 0, 192, 192);
  T.setImage(t, 192, 192);

  state.srcW = nw; state.srcH = nh; state.w = w; state.h = h; state.loaded = true;
  if (w !== nw || h !== nh) toast(`Limite de l'appareil : export en ${w}×${h} (original ${nw}×${nh})`);
  const ps = Math.min(1, 1800 / Math.max(w, h));
  R.resize(Math.round(w * ps), Math.round(h * ps));
  $('#empty').hidden = true;
  $('#hint').hidden = false;
  $('#btnCompare').disabled = $('#btnExport').disabled = false;
  buildThumbs();
  draw();
}

function thumbFor(preset){
  const b = {};
  for (const s of SCHEMA) b[s.key] = preset.params[s.key] ?? s.def;
  T.render(b, { seed: 3 });
  return T.canvas.toDataURL('image/jpeg', 0.8);
}
function buildThumbs(){
  document.querySelectorAll('.chip').forEach(ch => {
    const p = allPresets().find(x => x.id === ch.dataset.id);
    const img = ch.querySelector('img,.ph');
    if (!p || !img) return;
    const src = thumbFor(p);
    if (img.tagName === 'IMG') img.src = src;
    else { const i = new Image(); i.src = src; i.alt = ''; img.replaceWith(i); }
  });
}

// ---------- UI ----------
const sliders = {};
function buildUI(){
  const tabs = $('#tabs'), body = $('#body');
  for (const g of GROUPS){
    const b = document.createElement('button');
    b.className = 'tab'; b.textContent = g.label; b.dataset.g = g.id;
    b.onclick = () => showTab(g.id);
    tabs.append(b);
    const pane = document.createElement('div');
    pane.className = 'pane'; pane.id = 'pane-' + g.id; pane.hidden = true;
    body.append(pane);
  }
  // --- onglet filtres
  const fp = $('#pane-filters');
  const strip = document.createElement('div'); strip.className = 'strip'; strip.id = 'strip';
  fp.append(strip);
  fp.append(makeSlider({ key: '_int', label: 'Intensité du filtre', min: 0, max: 1.5, step: 0.01, def: 1 },
    v => { state.intensity = v; syncSliders(); draw(); }, v => Math.round(v * 100) + '%'));
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = `<button class="btn small" id="btnSave">+ Nouveau style</button>
    <button class="btn small" id="btnUpdate" hidden>Mettre à jour</button>
    <button class="btn small" id="btnRename" hidden>Renommer</button>
    <button class="btn small" id="btnSend" hidden>Envoyer ce style</button>
    <button class="btn small" id="btnReset">Réinitialiser</button>`;
  fp.append(row);
  const row2 = document.createElement('div'); row2.className = 'row';
  row2.innerHTML = `<button class="btn small" id="btnExpStyles">Sauvegarder mes styles</button>
    <button class="btn small" id="btnImpStyles">Importer</button>`;
  fp.append(row2);
  renderStrip();

  // --- onglets de réglages
  for (const s of SCHEMA){
    const el = makeSlider(s, v => { state.delta[s.key] = v - baseline()[s.key]; draw(); });
    sliders[s.key] = el;
    $('#pane-' + s.group).append(el);
  }

  // --- onglet particules : styles + générateur
  const pp = $('#pane-particles');
  const pills = document.createElement('div'); pills.className = 'pills';
  for (const st of PARTICLE_STYLES){
    const b = document.createElement('button'); b.className = 'pill'; b.textContent = st.name;
    b.onclick = () => {
      const base = baseline();
      for (const [k, v] of Object.entries(st.v)) state.delta[k] = v - base[k];
      state.seed = Math.random() * 100;
      syncSliders(); draw();
    };
    pills.append(b);
  }
  pp.prepend(pills);
  const gen = document.createElement('div'); gen.className = 'row';
  gen.innerHTML = `<button class="btn primary" id="btnSeed">🎲 Générer un autre tirage</button>`;
  pp.append(gen);
  const note = document.createElement('p'); note.className = 'note';
  note.textContent = 'Chaque tirage place les poussières, fibres et rayures à des endroits différents. L’export reprend exactement celui que tu vois.';
  pp.append(note);

  $('#btnSeed').onclick = () => { state.seed = Math.random() * 100; draw(); };
  $('#btnReset').onclick = () => { state.delta = {}; state.intensity = 1; syncSliders(); draw(); };
  $('#btnSave').onclick = saveCustom;
  $('#btnUpdate').onclick = updateCustom;
  $('#btnRename').onclick = renameCustom;
  $('#btnExpStyles').onclick = () => exportStyles();
  $('#btnSend').onclick = sendStyle;
  $('#btnImpStyles').onclick = () => $('#fileStyles').click();
  showTab('filters');
  syncSliders();
}

function showTab(id){
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.g === id));
  document.querySelectorAll('.pane').forEach(p => p.hidden = p.id !== 'pane-' + id);
  $('#body').scrollTop = 0;
}

function makeSlider(s, onInput, fmt){
  const wrap = document.createElement('div'); wrap.className = 'slider';
  const id = 'sl-' + s.key;
  const f = fmt || (v => s.max - s.min > 100 ? String(Math.round(v)) : (v > 0 && s.min < 0 ? '+' : '') + (+v).toFixed(2));
  wrap.innerHTML = `<label for="${id}">${s.label}</label><output></output>
    <input id="${id}" type="range" min="${s.min}" max="${s.max}" step="${s.step}" ${s.hue ? 'class="hue"' : ''}>`;
  const inp = wrap.querySelector('input'), out = wrap.querySelector('output');
  wrap._set = v => { inp.value = v; out.textContent = f(+v); };
  inp.oninput = () => { out.textContent = f(+inp.value); onInput(+inp.value); };
  // double-tap sur le libellé = remise à zéro du réglage
  wrap.querySelector('label').ondblclick = () => {
    if (s.key === '_int'){ wrap._set(1); onInput(1); return; }
    delete state.delta[s.key]; syncSliders(); draw();
  };
  wrap._set(s.def);
  return wrap;
}

function syncSliders(){
  const p = params();
  for (const s of SCHEMA) sliders[s.key]?._set(p[s.key]);
  const il = $('#sl-_int');
  if (il){ il.value = state.intensity; il.parentElement.querySelector('output').textContent = Math.round(state.intensity * 100) + '%'; }
  const isCustom = !!currentPreset().custom;
  $('#btnUpdate').hidden = $('#btnRename').hidden = $('#btnSend').hidden = !isCustom;
}

function renderStrip(){
  const strip = $('#strip'); strip.innerHTML = '';
  for (const p of allPresets()){
    const b = document.createElement('button');
    b.className = 'chip' + (p.id === state.presetId ? ' on' : '');
    b.dataset.id = p.id;
    b.innerHTML = `<div class="ph"></div><span></span>`;
    b.querySelector('span').textContent = p.name;
    b.onclick = () => selectPreset(p.id);
    if (p.custom){
      const d = document.createElement('button'); d.className = 'del'; d.textContent = '×'; d.title = 'Supprimer';
      d.onclick = e => { e.stopPropagation(); if (confirm(`Supprimer « ${p.name} » ?`)){
        custom = custom.filter(c => c.id !== p.id); store.set(custom);
        if (state.presetId === p.id) state.presetId = 'original';
        renderStrip(); syncSliders(); draw(); } };
      b.append(d);
    }
    strip.append(b);
  }
  if (state.loaded) buildThumbs();
}

function selectPreset(id){
  state.presetId = id; state.delta = {};
  const p = currentPreset();
  if (p.seed != null) state.seed = p.seed;      // un style perso rejoue son tirage de poussières
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.id === id));
  syncSliders(); draw();
}

function snapshot(){ return { ...params() }; }

function saveCustom(){
  const name = prompt('Nom de ton style :', 'Mon style ' + (custom.length + 1));
  if (!name) return;
  const p = { id: 'c' + Date.now(), name: name.trim().slice(0, 40), custom: true, params: snapshot(), seed: state.seed };
  custom.push(p); store.set(custom);
  state.presetId = p.id; state.delta = {}; state.intensity = 1;
  renderStrip(); syncSliders(); toast('Style enregistré');
}
function updateCustom(){
  const p = custom.find(c => c.id === state.presetId);
  if (!p) return;
  p.params = snapshot(); p.seed = state.seed; store.set(custom);
  state.delta = {}; state.intensity = 1;
  renderStrip(); syncSliders(); toast(`« ${p.name} » mis à jour`);
}
function renameCustom(){
  const p = custom.find(c => c.id === state.presetId);
  if (!p) return;
  const name = prompt('Nouveau nom :', p.name);
  if (!name) return;
  p.name = name.trim().slice(0, 40); store.set(custom); renderStrip();
}

function exportStyles(list = custom, filename = 'cyanogram-styles.json'){
  if (!list.length){ toast('Aucun style perso à sauvegarder'); return; }
  const blob = new Blob([JSON.stringify({ app: 'CyanoGram', version: 1, styles: list }, null, 2)], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });
  if (matchMedia('(pointer:coarse)').matches && navigator.canShare?.({ files: [file] })){
    navigator.share({ files: [file] }).catch(() => {});
  } else download(blob, filename);
}
function sendStyle(){
  const p = custom.find(c => c.id === state.presetId);
  if (p) exportStyles([p], `cyanogram-${slug(p.name)}.json`);
}
async function importStyles(file){
  try {
    const data = JSON.parse(await file.text());
    const list = (data.styles || []).filter(s => s && s.name && s.params);
    if (!list.length) throw 0;
    for (const s of list){
      const keep = {};
      for (const sc of SCHEMA) if (typeof s.params[sc.key] === 'number') keep[sc.key] = clamp(s.params[sc.key], sc.min, sc.max);
      custom.push({ id: 'c' + Date.now() + Math.floor(Math.random() * 1000), name: String(s.name).slice(0, 40), custom: true, params: keep, seed: s.seed });
    }
    store.set(custom); renderStrip(); toast(`${list.length} style(s) importé(s)`);
  } catch { toast('Fichier de styles invalide'); }
}

function toast(msg){
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), 3200);
}
function download(blob, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}

// ---------- comparer / exporter ----------
function holdCompare(el){
  const on = e => { if (!state.loaded) return; e.preventDefault(); state.bypass = true; draw(); };
  const off = () => { if (state.bypass){ state.bypass = false; draw(); } };
  el.addEventListener('pointerdown', on);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, off));
  el.addEventListener('contextmenu', e => e.preventDefault());
}

async function exportImage(){
  if (!state.loaded) return;
  const btn = $('#btnExport'); btn.disabled = true; btn.textContent = 'Export…';
  try {
    const pw = view.width, ph = view.height;
    R.resize(state.w, state.h);                       // pleine résolution = taille de l'original
    R.render(params(), { seed: state.seed });
    const raw = await new Promise(r => view.toBlob(r, 'image/jpeg', 0.98));
    R.resize(pw, ph); draw();
    if (!raw){ toast('Export impossible (mémoire insuffisante ?)'); return; }

    let bytes = new Uint8Array(await raw.arrayBuffer());
    let metaOk = true;
    try {
      bytes = injectMetadata(bytes, state.meta, {
        width: state.w, height: state.h, preset: currentPreset().name, title: `${state.name} - CyanoGram`,
      });
    } catch (e){ console.warn('Métadonnées non écrites', e); metaOk = false; }

    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const name = `CyanoGram_${slug(state.name)}_${slug(currentPreset().name)}.jpg`;
    const info = {
      blob, name,
      text: `${state.w} × ${state.h} px · ${(blob.size / 1048576).toFixed(1)} Mo`,
      meta: !metaOk ? 'Métadonnées non écrites.'
        : hasGps(state.meta) ? 'Date, appareil et localisation conservés · tag CyanoGram ajouté.'
        : state.meta ? 'Date et appareil conservés (pas de localisation dans la photo d’origine) · tag CyanoGram ajouté.'
        : 'Pas de métadonnées dans la photo d’origine · tag CyanoGram ajouté.',
    };
    if (matchMedia('(pointer:coarse)').matches) showExportDialog(info);
    else { download(blob, name); toast(`Exporté · ${info.text}`); }
  } finally { btn.disabled = false; btn.textContent = 'Exporter'; }
}

function showExportDialog(info){
  const d = $('#exportDlg');
  $('#expInfo').textContent = info.text;
  $('#expMeta').textContent = info.meta;
  $('#expShare').onclick = async () => {
    const file = new File([info.blob], info.name, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })){
      try { await navigator.share({ files: [file] }); d.close(); } catch (e){ if (e.name !== 'AbortError') download(info.blob, info.name); }
    } else { download(info.blob, info.name); }
  };
  $('#expDl').onclick = () => download(info.blob, info.name);
  $('#expClose').onclick = () => d.close();
  d.showModal();
}

// ---------- init ----------
function init(){
  try {
    R = new Renderer(view);
    T = new Renderer(document.createElement('canvas'));
    T.resize(192, 192);
  } catch (e){
    document.body.innerHTML = '<p style="padding:24px">WebGL2 est requis (iOS 15+ / navigateur récent).</p>';
    return;
  }
  buildUI();

  const file = $('#file');
  const open = () => file.click();
  $('#btnOpen').onclick = $('#btnOpen2').onclick = open;
  file.onchange = () => { loadFile(file.files[0]); file.value = ''; };
  $('#fileStyles').onchange = e => { if (e.target.files[0]) importStyles(e.target.files[0]); e.target.value = ''; };
  $('#btnExport').onclick = exportImage;
  holdCompare($('#btnCompare')); holdCompare(view);

  const stage = $('#stage');
  ['dragenter', 'dragover'].forEach(e => stage.addEventListener(e, ev => { ev.preventDefault(); stage.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(e => stage.addEventListener(e, ev => { ev.preventDefault(); stage.classList.remove('drag'); }));
  stage.addEventListener('drop', ev => loadFile(ev.dataTransfer.files[0]));
  addEventListener('paste', ev => { const f = [...(ev.clipboardData?.files || [])][0]; if (f) loadFile(f); });

  // ?src=url : charge une image directement (pratique pour les tests)
  const src = new URLSearchParams(location.search).get('src');
  if (src) fetch(src).then(r => r.blob()).then(b => loadFile(new File([b], src.split('/').pop(), { type: b.type }))).catch(() => {});

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost'))
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
