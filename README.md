# Touchline Tally

The touchline is the sideline of a soccer field, where parents and coaches stand to watch the game. Touchline Tally is a scorebook for that spot. Tap a player's name when they score, add who assisted, and keep a running tally for every team you follow.

## Features

- **Multiple teams.** Each team has its own roster, color and schedule. You can import a roster from a CSV file.
- **Calendar feeds.** Connect each team's calendar feed from TeamSnap, SportsEngine, Google Calendar and others. Games update every time you open the app, and practices are filtered out.
- **Game day.** Tap a player for a goal, then pick the assist. The ••• button logs shots, shots on goal, saves, penalties scored or missed, own goals, and yellow and red cards. Mark who missed the game, keep the opponent's score, and remove mistakes from the time-stamped game log.
- **Game timer.** Quarters or halves per team (for example 4 × 12 or 2 × 25 minutes). Start, pause and end each period, fix the clock by a minute, and add extra time. Every goal and event is stamped like "Q2 7'", and you get the score by period.
- **Captain rotation.** One captain per game, with the app suggesting whose turn is next so every kid gets a chance. Plan the rest of the season in one tap. Captains show on the parents' page.
- **Share results.** After a game, tap **Share result** for an image with the date, score, every goal with its scorer and assist, and saves, ready to text or post. There's also a plain-text version for group chats.
- **Season stats.** Win-loss-draw records, and per player: games played, goals, assists, shots, shots on goal, penalties, saves, cards and own goals. Export everything as CSV.
- **Seasons and career stats.** Start a new season from a team's page to carry the roster forward and archive the old season. The Career view adds up each player's stats across every season, and you can export it as CSV.
- **Sync between devices (optional).** Keep one shared copy in your own Cloudflare storage so your phone, tablet and computer stay in step. Works offline and catches up later.
- **Team pages for other parents (optional).** Share a read-only page for any team: results, scorers, schedule, season totals and the live score during games. Needs sync.
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
5. **Timer:** set each team's **Game format** on its page (a game can override it in Game details). In a game, tap **Start Q1** (or **Start 1st half**) at kickoff and **End Q1** when the ref blows the whistle. The clock keeps running if you lock the phone. It turns gold once time is up and shows the added time. The timer sits in a strip at the bottom of the scoreboard. Use **❚❚** to pause for injury breaks, and **•••** for **−1 min / +1 min** (if you started late) or **Reset timer**. After the last period, tap **Finish game**, or **Start extra time** for overtime. The opponent's **+** now logs each goal with its time; **−** removes the latest one.
6. **Share:** in a game, tap **Share result**, then **Share image** to send it or save it to Photos, or **Copy as text**.
7. **Stats tab:** see records and player totals, and export CSV files.

### When a new season starts

Open the team on the Teams tab and tap **Start new season**. Check the new name, untick players who left, add the new calendar link, and keep **Archive** ticked. The old team moves to **Archived teams** with all its games and stats. In Stats, **By team** has a **Show archived** toggle, and **Career** combines each player's seasons. Tap a player there to see each season.

You can also import a downloaded `.ics` file or paste calendar text by hand, or add games one at a time.

## Your data

Everything is stored in your browser on this device. Nothing is sent anywhere except the requests that load your calendar feeds.

- Data in the home-screen app is separate from data in a browser tab. Clearing your browser's website data deletes it.
- Use **Stats → Download backup** now and then. On a new phone or browser, tap **Restore from a backup** on the welcome screen (or **Stats → Restore backup**). The backup includes your feed relay address.

## Sync between devices

The included Cloudflare worker (`relay/worker.js`) can also store one shared copy of your data. Every device with the same passphrase stays in sync. Each device keeps its own copy too, so the app works offline.

**Set up storage (once):**

1. In the Cloudflare dashboard, open **Storage & Databases → KV** (or **Workers KV**) and create a namespace named `touchline-data`.
2. Open your `touchline-relay` worker → **Settings → Bindings → Add → KV namespace**. Set the variable name to `TOUCHLINE_KV` and choose `touchline-data`. Save or deploy.
3. In the worker's **Settings → Variables and Secrets**, add a variable of type **Secret** named `SYNC_KEY`. Its value is your passphrase: at least 12 characters, for example four random words. Save or deploy.
4. Open **Edit code**, replace everything with the latest `relay/worker.js`, and click **Deploy**.

**Turn it on (each device):** on the **Teams** tab, scroll to **Sync between devices**, enter the passphrase and tap **Turn on sync**. On a new device you can tap **Turn on sync** on the welcome screen instead.

**How it works:**

- Changes upload a few seconds after you make them. The app downloads the latest when it opens and when you switch back to it.
- Changes are merged game by game, so goals logged on two devices are both kept. Team settings (name, roster, calendars) use the most recent edit.
- Deleted teams and games stay deleted on every device.
- The worker also keeps a snapshot of each day's data for 30 days (`snapshot-YYYY-MM-DD` in the KV namespace) in case you need to go back.
- The free Cloudflare plan allows 1,000 saves a day; a busy game day uses a few dozen.
- The passphrase is stored on each device. To stop syncing on a device, tap **Turn off sync on this device**.

## Official standings

On a team's page, paste the league's standings or rankings page under **Official standings**. An **Official standings ↗** link then appears on that team's record in Stats and on the parents' page. A new season keeps the link; update it if the league uses a new page.

## Captains

Each game has one captain, shown with a **C** on their player button.

- **Picking:** in a game with no captain, the app shows **Up next** and a **Make captain** button. The next captain is whoever has had the fewest turns this season, then whoever went longest ago, skipping anyone marked as not playing. **Choose** lets you pick anyone.
- **Planning ahead:** on the team's page, **Captains** lists everyone's turns. **Plan captains** fills every upcoming game in rotation order; **Clear planned captains** undoes it.
- **Absent captain:** if a planned captain is marked not playing, the game offers to move their turn to the next game, swapping with that game's captain so nobody loses a turn.
- **New seasons** start the rotation fresh.
- **Parents' page:** captains show on results and upcoming games.

## Sharing a team page with other parents

With sync on, open a team on the Teams tab and tap **Create share link** under **Share with other parents**. Send the link (`https://<your-worker>.workers.dev/t/…`) to other parents. They don't need the app or the passphrase.

- **The page shows:** the team's record, results with scorers, assists, minutes and score by period, upcoming games, and season totals (games played, goals, assists, shots, shots on goal, saves). During a game it shows the live score and refreshes every 30 seconds.
- **It never shows:** calendar links, attendance, cards, or your other teams.
- **Updates:** the page updates a few seconds after each change syncs. It's served by your worker from the synced data, so update the worker code (`relay/worker.js`) to get this feature.
- **Control:** search engines are told not to list it. **New link** replaces the link (the old one stops working), and **Turn off** removes the page.
- A new season starts without a share link. Create one for the new team when you're ready.

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
