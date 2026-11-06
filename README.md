# Touchline Tally

The touchline is the sideline of a soccer field, where parents and coaches stand to watch the game. Touchline Tally is a scorebook for that spot. Tap a player's name when they score, add who assisted, and keep a running tally for every team you follow.

## Features

- **Multiple teams.** Each team has its own roster, color and schedule. You can import a roster from a CSV file.
- **Calendar feeds.** Connect each team's calendar feed from TeamSnap, SportsEngine, Google Calendar and others. Games update every time you open the app, and practices are filtered out.
- **Game day.** Tap a player for a goal, then pick the assist. The ••• button logs shots, shots on goal, saves, penalties scored or missed, own goals, and yellow and red cards. Mark who missed the game, keep the opponent's score, and remove mistakes from the time-stamped game log.
- **Share results.** After a game, tap **Share result** for an image with the date, score, every goal with its scorer and assist, and saves, ready to text or post. There's also a plain-text version for group chats.
- **Season stats.** Win-loss-draw records, and per player: games played, goals, assists, shots, shots on goal, penalties, saves, cards and own goals. Export everything as CSV.
- **Seasons and career stats.** Start a new season from a team's page to carry the roster forward and archive the old season. The Career view adds up each player's stats across every season, and you can export it as CSV.
- **Private.** Everything stays on your phone. No account, no ads, no sign-up.

## Install on your phone

1. Open the app's GitHub Pages address in Safari (iPhone) or Chrome (Android).
2. iPhone: tap **Share → Add to Home Screen**. Android: tap the menu, then **Add to Home screen** or **Install app**.
3. Open it from the home screen icon. After the first visit it also opens with weak or no signal.

## Getting started

1. **Teams tab:** add a team, then open it.
2. **Players:** add players one by one, or use **Import roster CSV** or **Paste roster**. Tap **Edit** next to a player to change their name or number; past games and stats update to match. The file needs a `Name` column (or `First` and `Last`) and, if you like, a `Number` or `Jersey` column.
3. **Game calendars:** add the team's calendar link (`webcal://`, `http://` or `https://` links ending in `.ics`). The app loads it right away and again every time it opens. Use **Skip events containing** to filter out practices and other non-game events.
4. **Games tab:** open a game and tap a player each time they score. Tap a second name to record the assist, or tap **No assist**. Tap **•••** on a player for other events. Use **+ Opp. own goal** when the other team scores on themselves, and **Who's playing** to untick absent players.
5. **Share:** in a game, tap **Share result**, then **Share image** to send it or save it to Photos, or **Copy as text**.
6. **Stats tab:** see records and player totals, and export CSV files.

### When a new season starts

Open the team on the Teams tab and tap **Start new season**. Check the new name, untick players who left, add the new calendar link, and keep **Archive** ticked. The old team moves to **Archived teams** with all its games and stats. In Stats, **By team** has a **Show archived** toggle, and **Career** combines each player's seasons. Tap a player there to see each season.

You can also import a downloaded `.ics` file or paste calendar text by hand, or add games one at a time.

## Your data

Everything is stored in your browser on this device. Nothing is sent anywhere except the requests that load your calendar feeds.

- Data in the home-screen app is separate from data in a browser tab. Clearing your browser's website data deletes it.
- Use **Stats → Download backup** now and then. On a new phone or browser, tap **Restore from a backup** on the welcome screen (or **Stats → Restore backup**). The backup includes your feed relay address.

## If a calendar won't update

If a team's page says the browser could not read the feed, the calendar server doesn't allow web apps to load it directly. Two options:

- Download the `.ics` file and use **Import .ics file**, or use **Paste calendar text**.
- Set up the included relay, a free Cloudflare Worker that fetches feeds for the app. TeamSnap feeds need this.

### Setting up the feed relay

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Go to **Workers & Pages → Create → Create Worker**, name it `touchline-relay`, and click **Deploy**.
3. Click **Edit code**, replace everything with the contents of [`relay/worker.js`](relay/worker.js), and click **Deploy**.
4. Copy the worker's address (like `https://touchline-relay.yourname.workers.dev`).
5. The app uses `https://touchline-relay.tracylshan.workers.dev/?url=` by default. If you set up your own relay, open **Teams → Calendar updates → Feed relay** and enter that address followed by `/?url=`, for example `https://touchline-relay.yourname.workers.dev/?url=`.

The relay only passes calendars through and refuses anything else. To let only your app use it, set `ALLOWED_ORIGIN` at the top of `worker.js` to your app's address (for example `https://yourname.github.io`). The free plan allows 100,000 requests a day, far more than this needs.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app: layout, styles and code in one file |
| `manifest.webmanifest` | App name and icons for the home screen |
| `sw.js` | Caches the app so it opens with weak signal |
| `icon-*.png` | Home screen and browser icons |
| `relay/worker.js` | Optional calendar feed relay for Cloudflare Workers |

No build step and no dependencies. Fonts load from Google Fonts. To host it, put these files in a GitHub repository and turn on GitHub Pages (**Settings → Pages → Branch: main, / (root)**).

## License

MIT. See [LICENSE](LICENSE).
