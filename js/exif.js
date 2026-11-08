// Lecture / réécriture des métadonnées JPEG (EXIF, XMP, IPTC) pour l'export.
// Principe : on récupère l'EXIF de la photo d'origine (date, appareil, GPS…), on corrige ce que la
// retouche change (orientation déjà appliquée, dimensions, espace colorimétrique) et on y ajoute
// le tag CyanoGram. Tout est écrit dans le JPEG produit par le canvas (qui, lui, n'a aucune métadonnée).

const TS = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const T_EXIF = 0x8769, T_GPS = 0x8825, T_INTEROP = 0xA005;
const DROP = new Set([0x927C /* MakerNote : offsets internes non déplaçables */, 0x02BC /* XMP tiff */]);

const pad2 = n => n + (n & 1);
const utf8 = s => new TextEncoder().encode(s);
const cat = arrs => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0; for (const a of arrs){ out.set(a, o); o += a.length; }
  return out;
};

// ---------- lecture ----------
export function readExif(buf){
  const b = new Uint8Array(buf);
  if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
  let i = 2;
  while (i + 4 < b.length && b[i] === 0xFF){
    const m = b[i + 1];
    if (m === 0xDA) break;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xE1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66){
      try { return parseTiff(b.subarray(i + 10, i + 2 + len)); } catch { return null; }
    }
    i += 2 + len;
  }
  return null;
}

function parseTiff(t){
  const le = t[0] === 0x49;
  const dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le);
  if (u16(2) !== 42) throw new Error('TIFF invalide');
  const subs = {};
  const readIFD = (off, name) => {
    const n = u16(off), list = [];
    for (let k = 0; k < n; k++){
      const p = off + 2 + 12 * k;
      const tag = u16(p), type = u16(p + 2), count = u32(p + 4);
      const size = (TS[type] || 0) * count;
      if (!size) continue;
      let data;
      if (size <= 4) data = t.slice(p + 8, p + 8 + size);
      else { const o = u32(p + 8); if (o + size > t.length) continue; data = t.slice(o, o + size); }
      if (tag === T_EXIF || tag === T_GPS || tag === T_INTEROP){
        subs[tag] = u32(p + 8);
        continue;
      }
      if (DROP.has(tag)) continue;
      list.push({ tag, type, count, data });
    }
    return list;
  };
  const ifd0 = readIFD(u32(4));
  const m = { le, ifd0, exif: [], gps: [], interop: [] };
  if (subs[T_EXIF]) m.exif = readIFD(subs[T_EXIF]);
  if (subs[T_GPS]) m.gps = readIFD(subs[T_GPS]);
  if (subs[T_INTEROP]) m.interop = readIFD(subs[T_INTEROP]);
  return m;
}

// ---------- écriture ----------
const e16 = (v, le) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, le); return b; };
const e32 = (v, le) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, le); return b; };
const ascii = s => { const b = new Uint8Array(s.length + 1); for (let i = 0; i < s.length; i++){ const c = s.charCodeAt(i); b[i] = c >= 32 && c < 127 ? c : 63; } return b; };
const utf16le = s => { const b = new Uint8Array((s.length + 1) * 2); for (let i = 0; i < s.length; i++){ const c = s.charCodeAt(i); b[2 * i] = c & 255; b[2 * i + 1] = c >> 8; } return b; };

function setTag(list, tag, type, data){
  const e = { tag, type, count: data.length / TS[type], data };
  const i = list.findIndex(x => x.tag === tag);
  if (i >= 0) list[i] = e; else list.push(e);
}

function writeTiff(m){
  const le = m.le;
  const ifd0 = m.ifd0, exif = m.exif, gps = m.gps, interop = m.interop;
  const ptr = tag => ({ tag, type: 4, count: 1, data: new Uint8Array(4) });
  if (exif.length || interop.length) ifd0.push(ptr(T_EXIF));
  if (gps.length) ifd0.push(ptr(T_GPS));
  if (interop.length) exif.push(ptr(T_INTEROP));
  const sets = [{ k: 'ifd0', list: ifd0 }];
  if (exif.length) sets.push({ k: 'exif', list: exif });
  if (gps.length) sets.push({ k: 'gps', list: gps });
  if (interop.length) sets.push({ k: 'interop', list: interop });

  let off = 8;
  for (const s of sets){
    s.list.sort((a, b) => a.tag - b.tag);
    s.ifdOff = off; off += 2 + 12 * s.list.length + 4;
    s.dataOff = off;
    for (const e of s.list) if (e.data.length > 4) off += pad2(e.data.length);
  }
  const at = k => sets.find(s => s.k === k)?.ifdOff;
  for (const e of ifd0){ if (e.tag === T_EXIF) e.data = e32(at('exif'), le); if (e.tag === T_GPS) e.data = e32(at('gps'), le); }
  for (const e of exif){ if (e.tag === T_INTEROP) e.data = e32(at('interop'), le); }

  const out = new Uint8Array(off), dv = new DataView(out.buffer);
  out[0] = out[1] = le ? 0x49 : 0x4D;
  dv.setUint16(2, 42, le); dv.setUint32(4, 8, le);
  for (const s of sets){
    dv.setUint16(s.ifdOff, s.list.length, le);
    let dp = s.dataOff;
    s.list.forEach((e, i) => {
      const p = s.ifdOff + 2 + 12 * i;
      dv.setUint16(p, e.tag, le); dv.setUint16(p + 2, e.type, le); dv.setUint32(p + 4, e.count, le);
      if (e.data.length <= 4) out.set(e.data, p + 8);
      else { dv.setUint32(p + 8, dp, le); out.set(e.data, dp); dp += pad2(e.data.length); }
    });
  }
  return out;
}

const seg = (marker, payload) => {
  if (payload.length + 2 > 65535) throw new Error('segment trop gros');
  const h = new Uint8Array(4);
  h[0] = 0xFF; h[1] = marker; h[2] = (payload.length + 2) >> 8; h[3] = (payload.length + 2) & 255;
  return cat([h, payload]);
};

const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function xmpSegment(keywords, caption){
  const xml = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"><dc:subject><rdf:Bag>${keywords.map(k => `<rdf:li>${esc(k)}</rdf:li>`).join('')}</rdf:Bag></dc:subject><dc:description><rdf:Alt><rdf:li xml:lang="x-default">${esc(caption)}</rdf:li></rdf:Alt></dc:description><xmp:CreatorTool>CyanoGram</xmp:CreatorTool><photoshop:Headline>${esc(caption)}</photoshop:Headline></rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
  return seg(0xE1, cat([utf8('http://ns.adobe.com/xap/1.0/\0'), utf8(xml)]));
}

function iptcSegment(keywords, caption, title){
  const rec = (set, bytes) => cat([new Uint8Array([0x1C, 2, set, bytes.length >> 8, bytes.length & 255]), bytes]);
  const parts = [
    new Uint8Array([0x1C, 1, 0x5A, 0, 3, 0x1B, 0x25, 0x47]),   // jeu de caractères : UTF-8
    rec(0, new Uint8Array([0, 4])),
    rec(5, utf8(title)),
    ...keywords.map(k => rec(25, utf8(k))),
    rec(65, utf8('CyanoGram')),
    rec(120, utf8(caption)),
  ];
  let data = cat(parts);
  if (data.length & 1) data = cat([data, new Uint8Array([0])]);
  const head = cat([utf8('8BIM'), new Uint8Array([0x04, 0x04, 0, 0]), e32(data.length, false)]);
  return seg(0xED, cat([utf8('Photoshop 3.0\0'), head, data]));
}

// ---------- API ----------
// jpeg : Uint8Array produit par canvas.toBlob ; meta : résultat de readExif (ou null)
export function injectMetadata(jpeg, meta, { width, height, preset, title }){
  const keywords = ['CyanoGram', preset];
  const caption = `CyanoGram - ${preset}`;
  const m = meta
    ? { le: meta.le, ifd0: meta.ifd0.map(e => ({ ...e })), exif: meta.exif.map(e => ({ ...e })), gps: meta.gps.map(e => ({ ...e })), interop: meta.interop.map(e => ({ ...e })) }
    : { le: false, ifd0: [], exif: [], gps: [], interop: [] };
  const le = m.le;

  setTag(m.ifd0, 0x0112, 3, e16(1, le));                       // orientation : déjà appliquée aux pixels
  setTag(m.ifd0, 0x0131, 2, ascii('CyanoGram'));               // Software
  setTag(m.ifd0, 0x010E, 2, ascii(caption));                   // ImageDescription (légende)
  setTag(m.ifd0, 0x9C9E, 1, utf16le(keywords.join(';')));      // XPKeywords (Windows)
  for (const t of [0x0100, 0x0101]){
    const e = m.ifd0.find(x => x.tag === t);
    if (e) setTag(m.ifd0, t, 4, e32(t === 0x0100 ? width : height, le));
  }
  if (!m.ifd0.some(e => e.tag === 0x0132)){
    const d = new Date(), z = n => String(n).padStart(2, '0');
    setTag(m.ifd0, 0x0132, 2, ascii(`${d.getFullYear()}:${z(d.getMonth() + 1)}:${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`));
  }
  setTag(m.exif, 0xA001, 3, e16(1, le));                       // ColorSpace : sRGB
  setTag(m.exif, 0xA002, 4, e32(width, le));                   // PixelXDimension
  setTag(m.exif, 0xA003, 4, e32(height, le));                  // PixelYDimension

  const tiff = writeTiff(m);
  const exifSeg = seg(0xE1, cat([utf8('Exif\0\0'), tiff]));
  const extra = [exifSeg, xmpSegment(keywords, caption), iptcSegment(keywords, caption, title || caption)];

  // on retire les en-têtes d'origine (JFIF / EXIF / IPTC) puis on insère les nôtres juste après SOI
  const parts = [new Uint8Array([0xFF, 0xD8]), ...extra];
  let i = 2;
  while (i + 4 < jpeg.length && jpeg[i] === 0xFF){
    const mk = jpeg[i + 1];
    if (mk === 0xDA) break;
    const len = (jpeg[i + 2] << 8) | jpeg[i + 3];
    if (mk !== 0xE0 && mk !== 0xE1 && mk !== 0xED) parts.push(jpeg.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  parts.push(jpeg.subarray(i));
  return cat(parts);
}

export const hasGps = meta => !!(meta && meta.gps && meta.gps.some(e => e.tag === 2 || e.tag === 4));
