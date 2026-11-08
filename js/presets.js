// Définition des réglages (schéma) et des filtres préconçus, déduits de tes retouches Prequel.

// copy:true => la valeur vient telle quelle du filtre (teintes, positions), non interpolée avec l'intensité
export const SCHEMA = [
  // Lumière
  { key: 'exposure',   group: 'light',   label: 'Exposition',            min: -1,  max: 1,   step: 0.01, def: 0 },
  { key: 'contrast',   group: 'light',   label: 'Contraste',             min: -1,  max: 1,   step: 0.01, def: 0 },
  { key: 'highlights', group: 'light',   label: 'Hautes lumières',       min: -1,  max: 1,   step: 0.01, def: 0 },
  { key: 'shadows',    group: 'light',   label: 'Ombres',                min: -1,  max: 1,   step: 0.01, def: 0 },
  { key: 'fade',       group: 'light',   label: 'Voile (noirs relevés)', min: 0,   max: 1,   step: 0.01, def: 0 },
  // Couleur
  { key: 'temp',       group: 'color',   label: 'Température',           min: -1,  max: 1,   step: 0.01, def: 0 },
  { key: 'tint',       group: 'color',   label: 'Teinte (vert ↔ magenta)', min: -1, max: 1,  step: 0.01, def: 0 },
  { key: 'sat',        group: 'color',   label: 'Saturation',            min: -1,  max: 1,   step: 0.01, def: 0 },
  { key: 'shHue',      group: 'color',   label: 'Ombres · couleur',      min: 0,   max: 360, step: 1,    def: 190, hue: true, copy: true },
  { key: 'shSat',      group: 'color',   label: 'Ombres · force',        min: 0,   max: 1,   step: 0.01, def: 0 },
  { key: 'hiHue',      group: 'color',   label: 'Lumières · couleur',    min: 0,   max: 360, step: 1,    def: 35,  hue: true, copy: true },
  { key: 'hiSat',      group: 'color',   label: 'Lumières · force',      min: 0,   max: 1,   step: 0.01, def: 0 },
  // Optique
  { key: 'bloom',      group: 'optic',   label: 'Lueur (bloom)',         min: 0,   max: 1,   step: 0.01, def: 0 },
  { key: 'bloomRadius',group: 'optic',   label: 'Rayon de la lueur',     min: 0,   max: 1,   step: 0.01, def: 0.5 },
  { key: 'halation',   group: 'optic',   label: 'Halation (halo rouge)', min: 0,   max: 1,   step: 0.01, def: 0 },
  { key: 'soft',       group: 'optic',   label: 'Flou doux',             min: 0,   max: 1,   step: 0.01, def: 0 },
  { key: 'vignette',   group: 'optic',   label: 'Vignette',              min: 0,   max: 1,   step: 0.01, def: 0 },
  { key: 'vigBlur',    group: 'optic',   label: 'Flou des bords',        min: 0,   max: 1,   step: 0.01, def: 0 },
  { key: 'aberr',      group: 'optic',   label: 'Aberration chromatique',min: 0,   max: 1,   step: 0.01, def: 0 },
  { key: 'distort',    group: 'optic',   label: 'Grand-angle (déformation)', min: -0.8, max: 0.8, step: 0.01, def: 0 },
  // Texture
  { key: 'grain',      group: 'texture', label: 'Grain',                 min: 0,   max: 1,   step: 0.01, def: 0 },
  { key: 'grainSize',  group: 'texture', label: 'Taille du grain',       min: 0.5, max: 3,   step: 0.05, def: 1,   copy: true },
  { key: 'leak',       group: 'texture', label: 'Fuite de lumière',      min: 0,   max: 1,   step: 0.01, def: 0 },
  { key: 'leakHue',    group: 'texture', label: 'Fuite · couleur',       min: 0,   max: 360, step: 1,    def: 20,  hue: true, copy: true },
  { key: 'leakPos',    group: 'texture', label: 'Fuite · position',      min: 0,   max: 1,   step: 0.01, def: 0.5, copy: true },
  // Particules
  { key: 'dust',       group: 'particles', label: 'Poussière',           min: 0,   max: 1,   step: 0.01, def: 0 },
  { key: 'hair',       group: 'particles', label: 'Poils & fibres',      min: 0,   max: 1,   step: 0.01, def: 0 },
  { key: 'scratch',    group: 'particles', label: 'Rayures',             min: 0,   max: 1,   step: 0.01, def: 0 },
  { key: 'stain',      group: 'particles', label: 'Taches d’humidité', min: 0, max: 1,   step: 0.01, def: 0 },
  { key: 'mote',       group: 'particles', label: 'Bokeh de poussière',  min: 0,   max: 1,   step: 0.01, def: 0 },
  { key: 'partSize',   group: 'particles', label: 'Taille des particules', min: 0.5, max: 2.5, step: 0.05, def: 1, copy: true },
];

export const GROUPS = [
  { id: 'filters',   label: 'Filtres' },
  { id: 'light',     label: 'Lumière' },
  { id: 'color',     label: 'Couleur' },
  { id: 'optic',     label: 'Optique' },
  { id: 'texture',   label: 'Texture' },
  { id: 'particles', label: 'Particules' },
];

// Styles de particules : un clic règle les curseurs, "Générer" change le tirage au sort.
export const PARTICLE_STYLES = [
  { id: 'none',    name: 'Aucune',            v: { dust: 0, hair: 0, scratch: 0, stain: 0, mote: 0 } },
  { id: 'fine',    name: 'Poussière fine',    v: { dust: .45, hair: .12, scratch: 0, stain: 0, mote: 0, partSize: .8 } },
  { id: 'old',     name: 'Vieux film',        v: { dust: .7, hair: .4, scratch: .35, stain: .2, mote: 0, partSize: 1 } },
  { id: 'fibres',  name: 'Poils & fibres',    v: { dust: .15, hair: .9, scratch: 0, stain: 0, mote: 0, partSize: 1 } },
  { id: 'scratch', name: 'Rayures',           v: { dust: .2, hair: .1, scratch: .85, stain: 0, mote: 0, partSize: 1 } },
  { id: 'water',   name: 'Taches d’eau', v: { dust: .25, hair: 0, scratch: 0, stain: .75, mote: 0, partSize: 1 } },
  { id: 'bokeh',   name: 'Bokeh poussière',   v: { dust: .2, hair: 0, scratch: 0, stain: 0, mote: .8, partSize: 1.2 } },
  { id: 'chaos',   name: 'Chaos',             v: { dust: .9, hair: .7, scratch: .6, stain: .5, mote: .4, partSize: 1.2 } },
];

// Teintes : teal ≈ 185, orange ≈ 28, violet ≈ 270, magenta ≈ 310, jaune ≈ 55
export const PRESETS = [
  { id: 'original', name: 'Original', params: {} },

  // Tes rendus lilas / brume / bloom (café n°1, lac, stade)
  { id: 'violet-haze', name: 'Violet Haze', params: {
    exposure: .1, contrast: -.1, highlights: -.1, shadows: .25, fade: .35,
    temp: -.1, tint: .25, sat: -.05, shHue: 265, shSat: .7, hiHue: 320, hiSat: .35,
    bloom: .7, bloomRadius: .7, halation: .2, soft: .35, vignette: .55, vigBlur: .6,
    aberr: .25, grain: .4, grainSize: 1.2, dust: .3, hair: .1, mote: .3 } },

  { id: 'foggy-lake', name: 'Foggy Lake', params: {
    exposure: .1, contrast: -.25, highlights: -.1, shadows: .4, fade: .4,
    temp: -.1, tint: .2, sat: -.2, shHue: 270, shSat: .6, hiHue: 200, hiSat: .2,
    bloom: .5, bloomRadius: .8, soft: .4, vignette: .65, vigBlur: .7,
    aberr: .2, grain: .35, dust: .2, mote: .2 } },

  // Teal & orange cinéma (canal, pavillon, temple)
  { id: 'teal-lantern', name: 'Teal Lantern', params: {
    contrast: .2, highlights: -.15, shadows: .2, fade: .12, temp: .05, sat: .2,
    shHue: 185, shSat: .65, hiHue: 30, hiSat: .5,
    bloom: .25, bloomRadius: .4, halation: .3, soft: .1, vignette: .45, vigBlur: .25,
    aberr: .2, grain: .55, grainSize: 1.3, dust: .5, hair: .3, scratch: .1 } },

  // Rues chaudes, ciel cyan, poussière (ruelle, portail, enseigne)
  { id: 'amber-dust', name: 'Amber Dust', params: {
    contrast: .1, fade: .2, temp: .35, tint: -.05, sat: .1,
    shHue: 195, shSat: .5, hiHue: 28, hiSat: .6,
    bloom: .3, halation: .5, soft: .15, vignette: .55, vigBlur: .3, aberr: .3,
    grain: .6, dust: .6, hair: .35, scratch: .15, stain: .15, leak: .25, leakHue: 20, leakPos: .95 } },

  { id: 'autumn-gold', name: 'Autumn Gold', params: {
    contrast: .25, shadows: .1, fade: .15, temp: .25, tint: .05, sat: .2,
    shHue: 185, shSat: .45, hiHue: 35, hiSat: .5,
    bloom: .3, halation: .3, soft: .1, vignette: .5, vigBlur: .3, aberr: .25,
    grain: .65, grainSize: 1.4, dust: .3, hair: .15 } },

  { id: 'jade-fresh', name: 'Jade Fresh', params: {
    exposure: .05, contrast: .1, shadows: .2, fade: .1, temp: -.15, tint: -.2, sat: .1,
    shHue: 170, shSat: .5, hiHue: 90, hiSat: .25,
    bloom: .45, bloomRadius: .5, soft: .2, vignette: .4, vigBlur: .4, aberr: .15,
    grain: .35, dust: .15, hair: .05 } },

  { id: 'metro-teal', name: 'Metro Teal', params: {
    contrast: .1, highlights: -.1, shadows: .2, fade: .2, temp: -.1, tint: -.3, sat: -.1,
    shHue: 180, shSat: .6, hiHue: 50, hiSat: .25,
    bloom: .25, soft: .1, vignette: .4, vigBlur: .3, grain: .6, dust: .6, hair: .3, scratch: .15 } },

  // Nuit & néons (Nanjing Road, tours)
  { id: 'neon-night', name: 'Neon Night', params: {
    exposure: -.1, contrast: .25, highlights: -.2, shadows: .3, fade: .1, temp: -.05, sat: .25,
    shHue: 175, shSat: .7, hiHue: 15, hiSat: .5,
    bloom: .6, bloomRadius: .5, halation: .6, vignette: .35, aberr: .35,
    grain: .7, grainSize: 1.4, dust: .7, hair: .4, scratch: .2, mote: .25 } },

  { id: 'cine-violet', name: 'Cine Violet', params: {
    exposure: -.05, contrast: .2, shadows: .2, fade: .2, tint: .3, sat: .1,
    shHue: 275, shSat: .8, hiHue: 55, hiSat: .5,
    bloom: .7, bloomRadius: .6, halation: .5, vignette: .5, vigBlur: .2, grain: .5, dust: .25, hair: .1 } },

  { id: 'amber-tower', name: 'Amber Tower', params: {
    exposure: -.1, contrast: .3, shadows: .25, fade: .1, temp: .2, sat: .1,
    shHue: 190, shSat: .8, hiHue: 30, hiSat: .6,
    bloom: .8, bloomRadius: .4, halation: .9, vignette: .3, aberr: .2,
    grain: .6, grainSize: 1.5, dust: .6, hair: .3, scratch: .2 } },

  // Ciel bleu saturé, fort rayonnement (montagne)
  { id: 'cyan-pop', name: 'Cyan Pop', params: {
    exposure: .1, contrast: .05, highlights: -.3, shadows: .3, fade: .15, temp: -.3, sat: .35,
    shHue: 195, shSat: .4, hiHue: 100, hiSat: .3,
    bloom: .6, bloomRadius: .6, soft: .45, vignette: .4, vigBlur: .4, aberr: .3,
    grain: .6, grainSize: 1.6, dust: .5, hair: .2, scratch: .2, mote: .2 } },

  // Le seul qui garde le grand-angle (tu peux le retirer avec le curseur Optique)
  { id: 'fisheye-retro', name: 'Fisheye Retro', params: {
    contrast: .15, fade: .2, temp: .15, sat: .2,
    shHue: 185, shSat: .5, hiHue: 30, hiSat: .4,
    bloom: .4, soft: .2, vignette: .6, vigBlur: .8, aberr: .4, distort: .6,
    grain: .5, dust: .3, hair: .15, leak: .2, leakHue: 15, leakPos: .1 } },

  { id: 'kodak-400', name: 'Kodak 400', params: {
    contrast: .1, fade: .2, temp: .15, sat: -.05,
    shHue: 200, shSat: .2, hiHue: 40, hiSat: .3,
    vignette: .3, grain: .5, dust: .25, hair: .1 } },
];
