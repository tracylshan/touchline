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
