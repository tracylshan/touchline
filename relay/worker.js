// Touchline Tally feed relay — a Cloudflare Worker.
// Fetches a calendar (.ics) feed for the app, because calendar servers such as
// TeamSnap don't let web apps read their feeds directly.
// Use it as:  https://<your-worker>.workers.dev/?url=<feed link>
// It only passes calendars through: any other kind of response is refused.

// Optional: put your app's address here (for example "https://yourname.github.io")
// so only your app can use the relay. Leave "*" to allow any site.
const ALLOWED_ORIGIN = "*";
const MAX_BYTES = 2_000_000;

export default {
  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") return new Response("Only GET is supported.", { status: 405, headers: cors });

    const raw = new URL(request.url).searchParams.get("url");
    if (!raw) return new Response("Add ?url=<calendar feed link> to the address.", { status: 400, headers: cors });

    let target;
    try { target = new URL(raw.trim().replace(/^webcal:\/\//i, "https://")); }
    catch { return new Response("That is not a valid link.", { status: 400, headers: cors }); }
    if (!/^https?:$/.test(target.protocol)) return new Response("Only http and https links are supported.", { status: 400, headers: cors });

    // Try the link as given; if the https version fails, try plain http (and the other way round).
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
    if (text.length > MAX_BYTES) return new Response("That calendar is too large.", { status: 413, headers: cors });
    if (!/BEGIN:VCALENDAR/i.test(text)) return new Response("That link did not return a calendar.", { status: 422, headers: cors });

    return new Response(text, {
      headers: { ...cors, "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "max-age=300" },
    });
  },
};
