// Touchline Tally worker for Cloudflare.
//
// 1. Calendar feed relay:  https://<your-worker>.workers.dev/?url=<feed link>
//    Fetches a calendar (.ics) feed for the app, because calendar servers such as
//    TeamSnap don't let web apps read their feeds directly. Only calendars pass through.
//
// 2. Sync storage:  https://<your-worker>.workers.dev/data
//    Keeps one shared copy of your teams so every device can sync to it.
//    Needs, in the worker's settings:
//      - a KV namespace binding named TOUCHLINE_KV
//      - a secret named SYNC_KEY: your sync passphrase (at least 12 characters)
//    Every request must send that passphrase. A snapshot of each day's data is
//    also kept for 30 days (keys "snapshot-YYYY-MM-DD"), in case you need to go back.
//
// 3. Shared team pages:  https://<your-worker>.workers.dev/t/<share id>
//    A read-only page for one team, for other parents. Only teams you share from the
//    app have a page, and it shows only results, scorers, schedule and season totals.

// Optional: put your app's address here (for example "https://yourname.github.io")
// so only your app can use this worker from a browser. Leave "*" to allow any site.
const ALLOWED_ORIGIN = "*";
const MAX_FEED_BYTES = 2_000_000;
const MAX_DATA_BYTES = 5_000_000;
const DATA_KEY = "touchline-data";
const SNAPSHOT_DAYS = 30;

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    if (path === "/data") return handleData(request, env || {}, cors);
    const share = path.match(/^\/t\/([a-z0-9]{12,40})$/);
    if (share) return handleTeamPage(share[1], env || {});
    return handleFeed(request, cors);
  },
};

/* ---------- sync storage ---------- */
async function handleData(request, env, cors) {
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
    status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  if (!env.TOUCHLINE_KV) return json({ error: "not_setup", message: "Sync storage isn't connected to this worker yet. Add a KV namespace binding named TOUCHLINE_KV." }, 501);
  if (!env.SYNC_KEY || String(env.SYNC_KEY).length < 12) return json({ error: "no_key", message: "Add a secret named SYNC_KEY (at least 12 characters) to this worker." }, 501);

  const given = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!(await sameSecret(given, String(env.SYNC_KEY)))) {
    await new Promise(r => setTimeout(r, 400)); // slow down guessing
    return json({ error: "bad_key", message: "That sync passphrase doesn't match." }, 401);
  }

  if (request.method === "GET") {
    const v = await env.TOUCHLINE_KV.get(DATA_KEY);
    if (!v) return json({ empty: true });
    return new Response(v, { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }

  if (request.method === "PUT") {
    const body = await request.text();
    if (body.length > MAX_DATA_BYTES) return json({ error: "too_large", message: "That data is too large to sync." }, 413);
    try {
      const o = JSON.parse(body);
      if (!o || typeof o !== "object" || typeof o.teams !== "object") throw new Error();
    } catch { return json({ error: "bad_data", message: "That isn't Touchline Tally data." }, 400); }
    await env.TOUCHLINE_KV.put(DATA_KEY, body);
    const snap = "snapshot-" + new Date().toISOString().slice(0, 10);
    if (!(await env.TOUCHLINE_KV.get(snap))) {
      await env.TOUCHLINE_KV.put(snap, body, { expirationTtl: SNAPSHOT_DAYS * 86400 });
    }
    return json({ ok: true, saved: Date.now() });
  }

  return json({ error: "method", message: "Use GET or PUT." }, 405);
}

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0 && a.length > 0;
}

/* ---------- calendar feed relay ---------- */
async function handleFeed(request, cors) {
  if (request.method !== "GET") return new Response("Only GET is supported.", { status: 405, headers: cors });

  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) return new Response("Add ?url=<calendar feed link> to the address.", { status: 400, headers: cors });

  let target;
  try { target = new URL(raw.trim().replace(/^webcal:\/\//i, "https://")); }
  catch { return new Response("That is not a valid link.", { status: 400, headers: cors }); }
  if (!/^https?:$/.test(target.protocol)) return new Response("Only http and https links are supported.", { status: 400, headers: cors });

  // Try the link as given; if that fails, try the other of http/https.
  const other = new URL(target); other.protocol = target.protocol === "https:" ? "http:" : "https:";
  let res = null, lastError = "";
  for (const u of [target, other]) {
    try {
      const r = await fetch(u.toString(), {
        headers: { "User-Agent": "TouchlineTally-relay/1.0", "Accept": "text/calendar, text/plain, */*" },
        cf: { cacheTtl: 300, cacheEverything: true },
        redirect: "follow",
      });
      if (r.ok) { res = r; break; }
      lastError = "The calendar server answered with error " + r.status + ".";
    } catch (e) { lastError = "Could not reach the calendar server."; }
  }
  if (!res) return new Response(lastError, { status: 502, headers: cors });

  const text = await res.text();
  if (text.length > MAX_FEED_BYTES) return new Response("That calendar is too large.", { status: 413, headers: cors });
  if (!/BEGIN:VCALENDAR/i.test(text)) return new Response("That link did not return a calendar.", { status: 422, headers: cors });

  return new Response(text, {
    headers: { ...cors, "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "max-age=300" },
  });
}

/* ---------- shared team pages ---------- */
const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "public, max-age=20",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
async function handleTeamPage(id, env) {
  const notFound = () => new Response(pageShell("Team not found", `<main class="wrap"><h1>This team page isn't available</h1><p class="muted">The link may have been turned off or replaced. Ask the parent who sent it for a new one.</p></main>`, ""), { status: 404, headers: PAGE_HEADERS });
  if (!env.TOUCHLINE_KV) return notFound();
  const raw = await env.TOUCHLINE_KV.get(DATA_KEY);
  if (!raw) return notFound();
  let data; try { data = JSON.parse(raw); } catch { return notFound(); }
  const team = Object.values(data.teams || {}).find(t => t && t.share && t.share.on && t.share.id === id);
  if (!team) return notFound();
  const { html, live } = renderTeam(team, Date.now());
  return new Response(pageShell(team.name.replace(/\s*\(example\)$/, ""), html, live ? '<meta http-equiv="refresh" content="30">' : ""), { headers: PAGE_HEADERS });
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeColor = c => /^#[0-9a-f]{6}$/i.test(c || "") ? c : "#1C6B43";
function guessFormat(name) { const m = String(name || "").match(/\bU-?(\d{1,2})\b/i); return m && +m[1] <= 8 ? { periods: 4, len: 12 } : { periods: 2, len: 25 }; }
const fmtOf = (t, g) => (g && g.format) || t.format || guessFormat(t.name);
function perLabel(f, p) { if (p > f.periods) return "OT" + (p > f.periods + 1 ? p - f.periods : ""); return f.periods === 4 ? "Q" + p : f.periods === 2 ? (p === 1 ? "1H" : "2H") : "P" + p; }
function minuteLabel(f, ps) { const m = Math.floor(ps.s / 60) + 1; return perLabel(f, ps.p) + " " + (ps.p <= f.periods && m > f.len ? `${f.len}+${m - f.len}'` : `${m}'`); }
function clockMs(c, now) { if (!c) return 0; if (c.state === "running") return Math.max(0, now - c.start - c.pausedMs); if (c.state === "paused") return Math.max(0, c.pausedAt - c.start - c.pausedMs); return 0; }
const mmss = ms => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
const isPast = (g, now) => g.final || g.start < now - 2 * 3600e3;
const theirScore = g => (g.oppGoals || 0) + (g.events || []).filter(e => e.type === "oppgoal" || e.type === "og").length;
function periodLine(t, g) {
  const f = fmtOf(t, g);
  const sc = (g.goals || []).map(x => ({ ps: x.ps, us: 1 })).concat((g.events || []).filter(e => e.type === "oppgoal" || e.type === "og").map(e => ({ ps: e.ps, us: 0 })));
  const timed = sc.filter(x => x.ps); if (!g.clock && !timed.length) return "";
  const c = g.clock || {}; const P = Math.max(c.p || 0, f.periods, ...timed.map(x => x.ps.p));
  const out = [];
  for (let p = 1; p <= P; p++) {
    const inP = timed.filter(x => x.ps.p === p); const played = p <= (c.p || 0) || inP.length;
    if (p > f.periods && !played) continue;
    out.push(`${perLabel(f, p)} ${played ? inP.filter(x => x.us).length + "–" + inP.filter(x => !x.us).length : "–"}`);
  }
  return out.join(" · ");
}

function renderTeam(t, now) {
  const tz = (t.share && t.share.tz) || "America/Los_Angeles";
  const d = (ts, o) => { try { return new Date(ts).toLocaleString("en-US", { timeZone: tz, ...o }); } catch { return new Date(ts).toUTCString(); } };
  const day = ts => d(ts, { weekday: "short", month: "short", day: "numeric" });
  const time = ts => d(ts, { hour: "numeric", minute: "2-digit" });
  const players = new Map((t.players || []).map(p => [p.id, p]));
  const pn = id => { const p = players.get(id); return p ? p.name : "Other player"; };
  const cap = g => g.captain && players.has(g.captain) ? players.get(g.captain).name : "";
  const games = Object.values(t.games || {}).filter(g => g && !g.cancelled).sort((a, b) => a.start - b.start);
  const played = games.filter(g => isPast(g, now) || (g.clock && g.clock.state !== "idle"));
  const upcoming = games.filter(g => !played.includes(g));
  const opp = g => (g.home === false ? "at " : "vs ") + esc(g.opp || "Opponent");

  let w = 0, l = 0, dr = 0, gf = 0, ga = 0;
  for (const g of played) { if (!isPast(g, now)) continue; const us = (g.goals || []).length, th = theirScore(g); gf += us; ga += th; us > th ? w++ : us < th ? l++ : dr++; }

  // season totals
  const st = new Map((t.players || []).map(p => [p.id, { p, gp: 0, g: 0, a: 0, sh: 0, sog: 0, sv: 0 }]));
  for (const g of played) {
    if (!isPast(g, now) && !(g.goals || []).length && !(g.events || []).length) continue;
    const ab = new Set(g.absent || []);
    for (const [id, r] of st) if (!ab.has(id)) r.gp++;
    for (const x of g.goals || []) { if (x.p && st.has(x.p)) { const r = st.get(x.p); r.g++; r.sh++; r.sog++; } if (x.a && st.has(x.a)) st.get(x.a).a++; }
    for (const e of g.events || []) {
      if (!e.p || !st.has(e.p)) continue; const r = st.get(e.p);
      if (e.type === "save") r.sv++;
      else if (e.type === "sot") { r.sh++; r.sog++; }
      else if (e.type === "shot" || e.type === "pkmiss") r.sh++;
    }
  }
  const rows = [...st.values()].sort((a, b) => b.g - a.g || b.a - a.a || a.p.name.localeCompare(b.p.name));

  let live = false;
  const gameCard = g => {
    const us = (g.goals || []).length, th = theirScore(g), f = fmtOf(t, g), c = g.clock;
    const isLive = c && (c.state === "running" || c.state === "paused" || c.state === "break" || c.state === "over") && !g.final;
    if (isLive) live = true;
    const res = !isLive && isPast(g, now) ? (us > th ? "W" : us < th ? "L" : "D") : null;
    const status = isLive ? (c.state === "running" ? `<span class="live">Live · ${perLabel(f, c.p)} ${mmss(clockMs(c, now))}</span>` : c.state === "paused" ? `<span class="live">Live · ${perLabel(f, c.p)} paused</span>` : `<span class="live">Live · break</span>`)
      : res ? `<span class="res res-${res}">${{ W: "Win", L: "Loss", D: "Draw" }[res]}</span>` : "";
    const goals = (g.goals || []).slice().sort((a, b) => a.t - b.t).map(x => {
      const who = x.oppOg ? "Own goal by " + esc(g.opp || "opponent") : esc(pn(x.p)) + (x.pk ? " (PK)" : "");
      return `<li><span class="who">${who}</span>${x.a ? `<span class="muted"> assist ${esc(pn(x.a))}</span>` : ""}${x.ps ? `<span class="min">${esc(minuteLabel(f, x.ps))}</span>` : ""}</li>`;
    }).join("");
    const pl = periodLine(t, g);
    return `<article class="game${isLive ? " is-live" : ""}">
      <div class="g-top"><div><div class="muted small">${esc(day(g.start))}${g.allDay ? "" : " · " + esc(time(g.start))}${g.loc ? " · " + esc(g.loc) : ""}</div><div class="g-opp">${opp(g)}</div></div>
      <div class="g-score">${us}<span class="dash">–</span>${th}</div></div>
      <div class="g-meta">${status}${pl ? `<span class="muted small">${esc(pl)}</span>` : ""}${cap(g) ? `<span class="small cap"><span class="cb">C</span> ${esc(cap(g))}</span>` : ""}</div>
      ${goals ? `<ol class="goals">${goals}</ol>` : ""}</article>`;
  };

  const results = played.slice().reverse().map(gameCard).join("");
  const sched = upcoming.map(g => `<li><span class="u-date">${esc(day(g.start))}</span><span class="u-opp">${opp(g)}</span><span class="muted small">${g.allDay ? "" : esc(time(g.start))}${g.loc ? " · " + esc(g.loc) : ""}</span>${cap(g) ? `<span class="small cap"><span class="cb">C</span> Captain: ${esc(cap(g))}</span>` : ""}</li>`).join("");
  const table = rows.length ? `<div class="tbl"><table><thead><tr><th>Player</th><th class="n">GP</th><th class="n">G</th><th class="n">A</th><th class="n">Sh</th><th class="n">SOG</th><th class="n">Saves</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.p.name)}</b>${r.p.num ? ` <span class="muted">#${esc(r.p.num)}</span>` : ""}</td><td class="n">${r.gp}</td><td class="n"><b>${r.g}</b></td><td class="n">${r.a}</td><td class="n">${r.sh}</td><td class="n">${r.sog}</td><td class="n">${r.sv}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No players listed yet.</p>`;

  const html = `<main class="wrap">
    <header class="hero" style="--team:${safeColor(t.color)}"><div class="eyebrow">Team page</div><h1>${esc(t.name.replace(/\s*\(example\)$/, ""))}</h1>
    <div class="record"><span class="big">${w}-${l}-${dr}</span><span class="muted">W-L-D · ${gf} for, ${ga} against</span></div>${/^https?:\/\/\S+$/i.test(String(t.standings || "").trim()) ? `<a class="standings" href="${esc(String(t.standings).trim())}" target="_blank" rel="noopener noreferrer">Official league standings ↗</a>` : ""}</header>
    <section><h2>Results</h2>${results || `<p class="muted">No games played yet.</p>`}</section>
    <section><h2>Upcoming</h2>${sched ? `<ul class="sched">${sched}</ul>` : `<p class="muted">No upcoming games.</p>`}</section>
    <section><h2>Season stats</h2>${table}<p class="muted small">GP games played · G goals · A assists · Sh shots · SOG shots on goal (goals count as both)</p></section>
    <footer class="muted small">Updated ${esc(day(now))}, ${esc(time(now))}${live ? " · refreshes every 30 seconds during games" : ""} · Touchline Tally</footer>
  </main>`;
  return { html, live };
}

function pageShell(title, body, extraHead) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>${extraHead}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Figtree:wght@400;500;600;700&display=swap">
<style>
:root{--bg:#F1F4EE;--surface:#FFFFFF;--ink:#14211A;--muted:#5B6A61;--line:#D9E0D6;--turf:#1C6B43;--flag:#B7860B;--loss:#B3261E;--chip:#E5EBE2;
--d:"Barlow Condensed","Arial Narrow",system-ui,sans-serif;--b:"Figtree",system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#0D1511;--surface:#151F19;--ink:#E6EEE8;--muted:#97A69C;--line:#26342C;--turf:#3FAE72;--flag:#F5C451;--loss:#F2867E;--chip:#1E2B24;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 var(--b)}
.wrap{max-width:680px;margin:0 auto;padding:16px max(16px,env(safe-area-inset-right)) 40px max(16px,env(safe-area-inset-left));display:grid;gap:22px}
h1,h2{font-family:var(--d);text-transform:uppercase;margin:0;letter-spacing:.01em}h1{font-size:40px;line-height:1}h2{font-size:22px;margin-bottom:10px}
.muted{color:var(--muted)}.small{font-size:13px}
.hero{border-left:6px solid var(--team);padding:4px 0 4px 14px;display:grid;gap:6px}
.eyebrow{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.record{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.big{font-family:var(--d);font-size:30px;font-weight:700}
.game{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px;display:grid;gap:6px;margin-bottom:10px}
.game.is-live{border-color:var(--flag)}
.g-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.g-opp{font-weight:700;font-size:17px}
.g-score{font-family:var(--d);font-size:34px;font-weight:700;line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums}.dash{opacity:.4;margin:0 4px}
.g-meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.res{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:2px 8px;border-radius:6px;background:var(--chip)}
.res-W{color:var(--turf)}.res-L{color:var(--loss)}
.live{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--flag)}
.goals{margin:2px 0 0;padding-left:20px;display:grid;gap:2px}.goals li{display:flex;gap:4px;flex-wrap:wrap}.who{font-weight:600}
.min{margin-left:auto;color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums}
.sched{list-style:none;margin:0;padding:0;background:var(--surface);border:1px solid var(--line);border-radius:14px}
.sched li{display:grid;grid-template-columns:96px 1fr;gap:2px 10px;padding:10px 14px;border-top:1px solid var(--line)}.sched li:first-child{border-top:0}
.u-date{font-weight:600;grid-row:span 3}
.standings{color:var(--turf);font-weight:700;text-decoration:none;justify-self:start}.standings:hover{text-decoration:underline}
.cap{display:inline-flex;align-items:center;gap:5px;font-weight:600}.cb{width:16px;height:16px;border-radius:50%;background:var(--flag);color:#14211A;font-size:10px;font-weight:800;display:inline-grid;place-items:center}.u-opp{font-weight:600}
.tbl{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:14px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}tr:last-child td{border-bottom:0}.n{text-align:right}
footer{text-align:center}
</style></head><body>${body}</body></html>`;
}
