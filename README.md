# Canteen Tally

Track what you buy at the work canteen against a daily allowance, split it with friends, and route menu changes through a superuser approval queue.

**Style guide:** [`styleguide.html`](styleguide.html) — every component, its states, its class name, and where it's used.

## Status

Frontend only, mobile-first, no build step — plain HTML/CSS/JS. Data is currently mocked in the browser (`localStorage`), shaped to match the [Google Sheet](https://docs.google.com/spreadsheets/d/14_4TrBJNnfyfz7c8LcpcTVum6fUialtnZ9leNSE6jps) 1:1 (same tabs, same columns, same ids) so swapping `js/api.js` for real Apps Script calls later shouldn't touch anything above it.

Screens: **Today** (budget ticket + tap-to-cart purchase log), **Menu** (browse + propose an edit), **Admin** (superuser-only: approve edits, manage users, manage settings).

## Running it locally

No build, no dependencies. Serve the folder and open it:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. Log in with any username from the `users` tab (e.g. `carmine`, `marco`, `giulia`).
