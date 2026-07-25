# Canteen Tally

Track what you buy at the work canteen against a daily allowance, split it with friends, and route menu changes through a superuser approval queue.

**Style guide:** [`styleguide.html`](styleguide.html) — every component, its states, its class name, and where it's used.

## Status

Mobile-first, no build step — plain HTML/CSS/JS. `js/api.js` currently reads/writes `localStorage`, shaped to match the [Google Sheet](https://docs.google.com/spreadsheets/d/14_4TrBJNnfyfz7c8LcpcTVum6fUialtnZ9leNSE6jps) 1:1 (same tabs, same columns, same ids).

**Backend:** `backend/Code.gs` is the Apps Script Web App meant to replace that mock — same function names, same shapes, deployed straight from the sheet (Extensions > Apps Script). It's the only thing that ever touches the spreadsheet.

Screens: **Today** (budget ticket, editable purchase log), **Menu** (search, tap to add to cart, propose an edit), **Admin** (superuser-only: approve edits, manage users, manage settings — a superuser's own menu edits apply immediately, no queue).

## Running it locally

No build, no dependencies. Serve the folder and open it:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. Log in with any username from the `users` tab (e.g. `carmine`, `marco`, `giulia`).
