// Compte + synchronisation des styles perso via Supabase.
// La clé "anon" est publique par conception : la sécurité repose sur les règles RLS de la table `styles`
// (chaque utilisateur ne voit et ne modifie que ses propres lignes).

const SB_URL = 'https://xcrzxncgagnfrtmyoash.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhjcnp4bmNnYWduZnJ0bXlvYXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MzU4NTMsImV4cCI6MjA4NDUxMTg1M30.Q6qBp3IzNYhz2PihnhGpyqXFPXkg8GCUHA-EnBHRs8w';
const AUTH_KEY = 'cyanogram.auth';

const FR_ERRORS = [
  [/invalid login credentials/i, 'E-mail ou mot de passe incorrect.'],
  [/email not confirmed/i, 'E-mail pas encore confirmé : clique sur le lien reçu par mail.'],
  [/already registered|already been registered/i, 'Un compte existe déjà avec cet e-mail : connecte-toi.'],
  [/password should be at least|weak password/i, 'Mot de passe trop court (6 caractères minimum).'],
  [/valid email|unable to validate email/i, 'Adresse e-mail invalide.'],
  [/rate limit|too many/i, 'Trop de tentatives, réessaie dans quelques minutes.'],
  [/failed to fetch|network/i, 'Pas de connexion internet.'],
];
export const frError = e => {
  const m = (e && e.message) || String(e || '');
  return (FR_ERRORS.find(([re]) => re.test(m)) || [0, m])[1];
};

export function createCloud({ getStyles, setStyles, getDeleted, setDeleted, onStatus }){
  const lib = window.supabase;
  const client = lib ? lib.createClient(SB_URL, SB_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_KEY },
  }) : null;
  let user = null, profile = null, timer = null, busy = false, again = false;
  const USERNAME_RE = /^[a-z0-9_.-]{3,24}$/;

  const stored = () => { try { const s = JSON.parse(localStorage.getItem(AUTH_KEY)); return s && s.user ? s : null; } catch { return null; } };

  async function sync(){
    if (!client || !user || !navigator.onLine) return;
    if (busy){ again = true; return; }
    busy = true; onStatus('syncing');
    try {
      // 1) suppressions en attente
      const del = getDeleted();
      for (const id of [...del]){
        const { error } = await client.from('styles').delete().eq('id', id);
        if (error) throw error;
        del.splice(del.indexOf(id), 1); setDeleted(del);
      }
      // 2) état distant
      const { data, error } = await client.from('styles').select('id,name,params,seed,updated_at');
      if (error) throw error;
      const local = getStyles();
      const byId = new Map(local.map(p => [p.id, p]));
      const remoteIds = new Set(), toPush = [];
      let changed = false;
      for (const r of data){
        remoteIds.add(r.id);
        const t = Date.parse(r.updated_at), l = byId.get(r.id);
        if (!l){ local.push({ id: r.id, name: r.name, custom: true, params: r.params, seed: r.seed ?? undefined, updated: t }); changed = true; }
        else if (t > (l.updated || 0) + 1000){ Object.assign(l, { name: r.name, params: r.params, seed: r.seed ?? undefined, updated: t }); changed = true; }
        else if ((l.updated || 0) > t + 1000) toPush.push(l);
      }
      for (const l of local) if (!remoteIds.has(l.id)) toPush.push(l);
      // 3) envoi des styles locaux plus récents ou absents
      if (toPush.length){
        for (const p of toPush) if (!p.updated){ p.updated = Date.now(); changed = true; }
        const rows = toPush.map(p => ({
          user_id: user.id, id: p.id, name: p.name, params: p.params, seed: p.seed ?? null,
          updated_at: new Date(p.updated).toISOString(),
        }));
        const { error: e2 } = await client.from('styles').upsert(rows, { onConflict: 'user_id,id' });
        if (e2) throw e2;
      }
      if (changed) setStyles(local);
      onStatus('ok', Date.now());
    } catch (e){
      onStatus('error', frError(e));
    } finally {
      busy = false;
      if (again){ again = false; schedule(); }
    }
  }
  function schedule(){ clearTimeout(timer); timer = setTimeout(sync, 800); }

  return {
    available: !!client,
    get user(){ return user; },
    hasStoredSession: () => !!stored(),
    async init(){
      const s = stored();
      if (s) user = s.user;                        // déjà connecté : pas de nouvel écran de login
      if (!client) return user;
      try {
        const { data } = await client.auth.getSession();
        if (data.session) user = data.session.user;
      } catch {}
      client.auth.onAuthStateChange((ev, session) => {
        if (ev === 'SIGNED_OUT'){ user = null; onStatus('auth'); }
        else if (session){ user = session.user; }
      });
      addEventListener('online', schedule);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
      return user;
    },
    // identifiant = e-mail OU nom d'utilisateur (ce dernier passe par la fonction serveur `login`)
    async signIn(identifier, password){
      if (identifier.includes('@')){
        const { data, error } = await client.auth.signInWithPassword({ email: identifier, password });
        if (error) throw error;
        user = data.user; return { signedIn: true };
      }
      const r = await fetch(`${SB_URL}/functions/v1/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        body: JSON.stringify({ identifier, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Connexion impossible');
      const { data, error } = await client.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token });
      if (error) throw error;
      user = data.user; return { signedIn: true };
    },
    async signUp(email, password, username){
      const meta = username ? { display_name: username, username } : undefined;
      const { data, error } = await client.auth.signUp({ email, password, options: meta ? { data: meta } : undefined });
      if (error) throw error;
      if (data.session){
        user = data.user;
        if (username) { try { await this.saveProfile(username); } catch {} }
        return { signedIn: true };
      }
      return { signedIn: false };                  // confirmation par e-mail requise
    },
    get displayName(){ return profile?.display_name || user?.user_metadata?.display_name || null; },
    async loadProfile(){
      if (!client || !user) return null;
      const { data, error } = await client.from('user_profiles').select('username,display_name').maybeSingle();
      if (error) throw error;
      profile = data || null; return profile;
    },
    async saveProfile(raw){
      const username = String(raw || '').trim().toLowerCase();
      if (!USERNAME_RE.test(username)) throw new Error('Nom d\u2019utilisateur : 3 à 24 caractères (lettres, chiffres, . _ -).');
      const { error } = await client.from('user_profiles').upsert({ user_id: user.id, username, display_name: username });
      if (error){ throw new Error(error.code === '23505' ? 'Ce nom d\u2019utilisateur est déjà pris.' : error.message); }
      await client.auth.updateUser({ data: { display_name: username, username } }).catch(() => {});
      profile = { username, display_name: username };
    },
    async signOut(){
      await sync();                                // on pousse tout avant de partir
      await client.auth.signOut();
      user = null; profile = null;
    },
    schedule, sync,
  };
}
