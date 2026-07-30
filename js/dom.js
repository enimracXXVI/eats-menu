// Tiny DOM helper so screens stay readable without a framework.
// No inline styles are ever set through this — only className and attrs.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "className") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "html") {
      node.innerHTML = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

// A plain line-icon, not an emoji — colored via currentColor so a CSS class
// (e.g. .btn--icon--critical) drives its color instead of a fixed glyph.
export const TRASH_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M4 7h16"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>' +
  '<path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>' +
  '<path d="M10 11v6"/><path d="M14 11v6"/></svg>';

// Barcode glyph — filled bars rather than a stroke line-icon like the
// others, since a barcode is inherently a set of bars, not an outline.
export const BARCODE_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">' +
  '<rect x="2" y="4" width="1.6" height="16"/><rect x="5" y="4" width="1" height="16"/>' +
  '<rect x="7.5" y="4" width="2" height="16"/><rect x="11" y="4" width="1" height="16"/>' +
  '<rect x="13" y="4" width="1.6" height="16"/><rect x="16" y="4" width="1" height="16"/>' +
  '<rect x="18.5" y="4" width="2" height="16"/><rect x="21.5" y="4" width="1" height="16"/>' +
  "</svg>";

// Standard "share" glyph (arrow out of a tray) — used by the Today
// screen's share button, same line-icon treatment as the others.
export const SHARE_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 15V4"/><path d="M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>' +
  "</svg>";

const CURRENCY_SYMBOLS = {
  EUR: "€",
  GBP: "£",
  USD: "$",
  CAD: "CA$",
  AUD: "A$",
  BRL: "R$",
  COP: "COL$",
};

export const CURRENCIES = Object.keys(CURRENCY_SYMBOLS);

export function currencySymbol(currency) {
  return CURRENCY_SYMBOLS[currency] || currency;
}

export function fmtMoney(value, currency = "EUR") {
  return `${currencySymbol(currency)}${Number(value).toFixed(2)}`;
}

// Keeps a price input always showing two decimals (0.00), even if the
// user types "5" or the value was prefilled from a whole number.
export function formatPriceOnBlur(input) {
  input.addEventListener("blur", () => {
    const value = parseFloat(input.value);
    if (!Number.isNaN(value)) input.value = value.toFixed(2);
  });
}

// Shared by the header chip and the Today ticket, so "how much is left"
// and its safe/warning/over color always agree wherever it's shown.
export function budgetState(spent, allowance) {
  const remaining = allowance - spent;
  const ratio = allowance > 0 ? spent / allowance : 0;
  let state = "safe";
  if (ratio >= 1) state = "over";
  else if (ratio >= 0.85) state = "warning";
  return { remaining, ratio, state };
}

export function fmtTime(isoTimestamp) {
  if (!isoTimestamp) return "";
  return isoTimestamp.slice(11, 16);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "26 July 2026" — always this format, regardless of browser locale (the
// app is English-only throughout, so this doesn't defer to
// toLocaleDateString, which would follow the visitor's browser locale).
export function fmtDate(date = new Date()) {
  return `${String(date.getDate()).padStart(2, "0")} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

// Shared between the Admin approval list and the Menu tab's inline review
// sheet, so "what kind of change is this" always reads the same way in both
// places. This trusts edit.type as the single source of truth — the backend
// (proposeMenuEdit's classifyItemEdit) already worked out whether an
// existing-item edit is a rename, a price change, or both, and stored
// exactly that in the sheet, so there's nothing left to re-derive here.
export function editCategoryLabel(edit) {
  switch (edit.type) {
    case "new_item":
      return "New item";
    case "remove_item":
      return "Remove";
    case "reinstate":
      return "Reinstate";
    case "rename":
      return "Rename";
    case "edit":
      return "Edit";
    default:
      return "Price change";
  }
}

// The price line for a proposed edit: struck-through previous price next to
// the proposed one when they actually differ, otherwise just the price —
// this is what was missing that made a price-change proposal unreadable
// ("cocomero €0.30" with no indication of what it used to cost).
export function editPriceNode(previousItem, proposedPrice, currency) {
  if (previousItem && previousItem.price !== proposedPrice) {
    return el("span", { className: "row__price u-tabular" }, [
      el("span", { className: "row__price-was" }, fmtMoney(previousItem.price, currency)),
      fmtMoney(proposedPrice, currency),
    ]);
  }
  return el("span", { className: "row__price u-tabular" }, fmtMoney(proposedPrice, currency));
}

// Same idea as editPriceNode, for the name — a rename showed only the new
// name with nothing to compare it to, exactly the same problem a bare
// proposed price had.
export function editNameNode(previousItem, proposedName) {
  if (previousItem && previousItem.name !== proposedName) {
    return el("span", { className: "row__title" }, [
      el("span", { className: "row__name-was" }, previousItem.name),
      proposedName,
    ]);
  }
  return el("span", { className: "row__title" }, proposedName);
}

export function mount(root, node) {
  root.replaceChildren(node);
}

// Bottom sheet used for the cart review and the propose-edit form.
// Returns a close() function. Closes on: a real drag of the handle past
// the dismiss threshold (see attachSheetDrag — a tap alone does nothing),
// backdrop tap, calling close() yourself, or the phone/browser back
// button — a pushState marker is added while the sheet is open so back
// closes the sheet instead of navigating the app away, same as any native
// modal would behave.
// `headerAction`, when given, renders as a button next to the title (e.g.
// the delete-item trash icon on the edit-item sheet). `onClose`, when
// given, fires exactly once whenever the sheet actually closes, however it
// closes (a button inside it, the backdrop, a drag-dismiss, or back) — used
// by confirmDialog below to resolve its promise even if the sheet was
// dismissed without picking either option.
//
// Sheets can nest (buildSelectField opens one from inside whatever sheet
// it's placed in) — a shared stack plus one shared popstate listener, not
// one listener per sheet, is what makes that safe. Every sheet still pushes
// its own history entry, but a given back-navigation must only ever close
// the topmost sheet, not every listener still attached from sheets
// underneath it. `pendingProgrammaticCloses` exists for the other half of
// that: a sheet's own close() calls history.back() to unwind its pushState,
// which fires a popstate "echo" of a close that already happened
// synchronously — without counting and skipping that echo, it would go on
// to close whatever sheet is left open underneath instead of doing nothing.
const openSheetStack = [];
let pendingProgrammaticCloses = 0;

window.addEventListener("popstate", () => {
  if (pendingProgrammaticCloses > 0) {
    pendingProgrammaticCloses--;
    return;
  }
  const top = openSheetStack[openSheetStack.length - 1];
  if (top) top();
});

export function openSheet(title, bodyNode, headerAction = null, onClose = null) {
  let closed = false;

  const handle = el("div", { className: "sheet__handle", "aria-hidden": "true" }, []);
  const titleRow = el(
    "div",
    { className: "sheet__title-row" },
    [el("h2", { className: "sheet__title" }, title), headerAction].filter(Boolean)
  );
  const sheetEl = el("div", { className: "sheet" }, [handle, titleRow, bodyNode]);

  const backdrop = el(
    "div",
    {
      className: "sheet-backdrop",
      onClick: (event) => {
        if (event.target === backdrop) close();
      },
    },
    [sheetEl]
  );
  document.body.append(backdrop);

  history.pushState({ sheet: true }, "");
  openSheetStack.push(finish);

  function finish() {
    if (closed) return;
    closed = true;
    const index = openSheetStack.indexOf(finish);
    if (index !== -1) openSheetStack.splice(index, 1);
    backdrop.remove();
    if (onClose) onClose();
  }

  function close() {
    if (closed) return;
    finish();
    if (history.state && history.state.sheet) {
      pendingProgrammaticCloses++;
      history.back();
    }
  }

  attachSheetDrag(handle, sheetEl, backdrop, close);

  return close;
}

// A styled stand-in for <select> — a native select's open list renders with
// the OS/browser's own chrome, which no CSS here can touch (least of all on
// mobile, where that's most of this app's usage), so this opens the same
// bottom sheet every other picker in the app already uses instead. Behaves
// like a real form control for the caller: the returned trigger carries a
// live `.value`, and `.refresh(options, value)` swaps its options/value in
// place (e.g. once an async fetch of a longer list lands).
// `options`: [{ value, label, hint }] — hint renders muted next to the
// label (e.g. "inactive"). `searchable` adds a filter field atop the list,
// worth it once the list is longer than a handful of options.
export function buildSelectField({ options, value, placeholder = "Select…", onChange, searchable = false }) {
  let currentOptions = options;
  let current = value;
  const label = el("span", { className: "select-field__label" }, "");
  const trigger = el("button", { type: "button", className: "field__input select-field" }, [label]);
  // A real <button>'s native `.value` always reflects to/from a string HTML
  // attribute, silently stringifying anything assigned to it — useless here
  // since option values are frequently numbers (item ids, user ids). This
  // getter overrides that so `.value` keeps behaving like a normal form
  // control's for callers (e.g. admin.js's `currencyInput.value.trim()`)
  // without ever coercing a numeric value into "4" !== 4.
  Object.defineProperty(trigger, "value", { get: () => current, configurable: true });

  function paint() {
    const match = currentOptions.find((o) => o.value === current);
    label.textContent = match ? match.label : placeholder;
    trigger.classList.toggle("select-field--placeholder", !match);
  }

  function choose(newValue) {
    current = newValue;
    paint();
    if (onChange) onChange(newValue);
  }

  trigger.addEventListener("click", () => {
    let query = "";
    const listSlot = el("div", { className: "rows" }, []);

    function renderList() {
      const q = query.trim().toLowerCase();
      const filtered = q ? currentOptions.filter((o) => o.label.toLowerCase().includes(q)) : currentOptions;
      listSlot.replaceChildren(
        ...(filtered.length
          ? filtered.map((o) =>
              el(
                "div",
                {
                  className: `row row--tappable${o.value === current ? " row--selected" : ""}`,
                  onClick: () => {
                    choose(o.value);
                    close();
                  },
                },
                [
                  el("span", { className: "row__title" }, o.label),
                  o.hint ? el("span", { className: "row__meta" }, o.hint) : null,
                ].filter(Boolean)
              )
            )
          : [el("p", { className: "empty" }, "No matches.")])
      );
    }

    const searchInput = searchable
      ? el("input", {
          className: "field__input",
          type: "text",
          placeholder: "Search…",
          autofocus: true,
          onInput: (event) => {
            query = event.target.value;
            renderList();
          },
        })
      : null;

    renderList();
    const body = el("div", { className: "screen__section" }, [searchInput, listSlot].filter(Boolean));
    const close = openSheet(placeholder, body);
  });

  paint();
  trigger.refresh = (newOptions, newValue) => {
    currentOptions = newOptions;
    current = newValue;
    paint();
  };
  return trigger;
}

// Real drag-to-dismiss, not a tap target: the sheet tracks the pointer
// 1:1 while dragging (no transition during the drag itself — a
// transitioned drag lags behind the finger instead of feeling physically
// attached). On release, dragging far or fast enough finishes the
// dismissal in the same direction it was already moving; anything short
// of that eases back open. A plain tap (near-zero distance, released
// immediately) never crosses either threshold, so it does nothing —
// there is no tap-to-close anymore.
function attachSheetDrag(handle, sheetEl, backdrop, close) {
  const DISMISS_DISTANCE_RATIO = 0.35; // dragged past 35% of the sheet's own height
  const DISMISS_VELOCITY = 0.5; // or flicked at 0.5px/ms+, however short the distance

  let dragging = false;
  let startY = 0;
  let startTime = 0;
  let deltaY = 0;
  let sheetHeight = 0;

  function onPointerDown(event) {
    dragging = true;
    startY = event.clientY;
    startTime = performance.now();
    sheetHeight = sheetEl.getBoundingClientRect().height;
    sheetEl.classList.remove("sheet--settling");
    backdrop.classList.remove("sheet-backdrop--settling");
    handle.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!dragging) return;
    deltaY = Math.max(0, event.clientY - startY);
    sheetEl.style.transform = `translateY(${deltaY}px)`;
    backdrop.style.opacity = String(Math.max(0.15, 1 - deltaY / sheetHeight));
  }

  function settle(shouldClose) {
    sheetEl.classList.add("sheet--settling");
    backdrop.classList.add("sheet-backdrop--settling");

    if (shouldClose) {
      sheetEl.style.transform = "translateY(100%)";
      backdrop.style.opacity = "0";
      const finishClose = () => close();
      sheetEl.addEventListener("transitionend", finishClose, { once: true });
      setTimeout(finishClose, 300); // in case transitionend never fires (e.g. reduced motion)
    } else {
      sheetEl.style.transform = "";
      backdrop.style.opacity = "";
    }
  }

  function onPointerUp(event) {
    if (!dragging) return;
    dragging = false;
    handle.releasePointerCapture(event.pointerId);

    const elapsed = Math.max(1, performance.now() - startTime);
    const velocity = deltaY / elapsed;
    settle(deltaY > sheetHeight * DISMISS_DISTANCE_RATIO || velocity > DISMISS_VELOCITY);
    deltaY = 0;
  }

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("pointermove", onPointerMove);
  handle.addEventListener("pointerup", onPointerUp);
  handle.addEventListener("pointercancel", onPointerUp);
}

// The recurring "label + horizontal rule" section header used to separate
// stacked groups within a screen (e.g. "Tap what you got" / "Logged today").
// `action`, when given (e.g. a refresh button), renders after the rule, at
// the far right of the same row.
export function sectionHeader(text, action = null) {
  return el(
    "div",
    { className: "section-divider" },
    [el("span", { className: "section-divider__tag" }, text), el("span", { className: "section-divider__rule" }), action].filter(
      Boolean
    )
  );
}

// A plain line-icon refresh glyph, for the same reason TRASH_ICON_SVG
// exists — no emoji anywhere in the app.
export const REFRESH_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3 12a9 9 0 0 1 15.3-6.5L21 8"/><path d="M21 3v5h-5"/>' +
  '<path d="M21 12a9 9 0 0 1-15.3 6.5L3 16"/><path d="M3 21v-5h5"/></svg>';

// Search field's clear (×) button — paprika, not the neutral icon-button
// color, so it reads as "discard this text" rather than a plain action.
export const CLOSE_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M6 6l12 12M18 6L6 18"/></svg>';

// Sort-direction toggle — a single upward arrow, flipped 180° via the
// .is-flipped class for descending, same reuse-one-icon approach as the
// refresh button's spin.
export const SORT_ARROW_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>';

// Outline vs filled star, swapped based on favorited state — same
// currentColor approach as the other icons, no emoji.
const STAR_PATH = "M12 3l2.6 5.6 6.1.6-4.5 4.2 1.3 6-5.5-3.1-5.5 3.1 1.3-6-4.5-4.2 6.1-.6z";
export const STAR_ICON_SVG_OUTLINE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
export const STAR_ICON_SVG_FILLED = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;

export function refreshButton(label, onClick) {
  const button = el("button", { className: "btn btn--icon", "aria-label": label, html: REFRESH_ICON_SVG }, []);
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.classList.add("is-spinning");
    try {
      await onClick();
    } finally {
      button.disabled = false;
      button.classList.remove("is-spinning");
    }
  });
  return button;
}

// Wraps a button's click handler so a slow round trip can't be fired twice
// by an impatient second tap: the button disables itself and (when a label
// is given) swaps its text for the duration, restoring both afterwards
// whether the action succeeded or failed. Icon-only buttons and toggle
// switches pass label=null — they still get the disable, just no text swap.
export function onBusyClick(button, label, handler) {
  button.addEventListener("click", async (event) => {
    if (button.disabled) return;
    const original = button.textContent;
    button.disabled = true;
    if (label) button.textContent = label;
    try {
      await handler(event);
    } finally {
      button.disabled = false;
      if (label) button.textContent = original;
    }
  });
}

// Approve/Reject (and similar mutually-exclusive action pairs): clicking
// one disables AND hides the other for the duration, so the busy one
// expands to fill the whole row (via the existing flex:1 on both buttons)
// instead of leaving a dead, still-clickable sibling next to a button that
// says "Approving…" — tapping Reject while Approve is mid-flight fired a
// reject on top of an in-flight approve, which is exactly the bug this
// closes.
export function pairBusyActions(a, aLabel, aHandler, b, bLabel, bHandler) {
  async function run(button, label, handler, other) {
    if (button.disabled) return;
    const original = button.textContent;
    button.disabled = true;
    other.disabled = true;
    other.classList.add("u-hidden");
    button.textContent = label;
    try {
      await handler();
    } finally {
      button.disabled = false;
      other.disabled = false;
      other.classList.remove("u-hidden");
      button.textContent = original;
    }
  }
  a.addEventListener("click", () => run(a, aLabel, aHandler, b));
  b.addEventListener("click", () => run(b, bLabel, bHandler, a));
}

// A switch (or anything else toggled by an "on" class) that flips the
// instant the user taps it — same reasoning as favoriting: this is a quick,
// reversible preference, not a purchase, so there's no reason to make the
// tap wait on a round trip. `onChange(nextOn)` fires in the background;
// the flip is undone if it throws (api.js has already toasted why).
export function attachOptimisticToggle(button, onChange) {
  button.addEventListener("click", async () => {
    const wasOn = button.classList.contains("switch--on");
    const nextOn = !wasOn;
    button.classList.toggle("switch--on", nextOn);
    button.setAttribute("aria-checked", String(nextOn));
    try {
      await onChange(nextOn);
    } catch {
      button.classList.toggle("switch--on", wasOn);
      button.setAttribute("aria-checked", String(wasOn));
    }
  });
}

// On-brand replacement for the browser's native confirm() — same bottom
// sheet as everything else, resolving true/false instead of blocking the
// whole page. Resolves false if dismissed any other way (backdrop, drag,
// back) without picking either button.
export function confirmDialog(message, opts = {}) {
  const { confirmLabel = "Delete", cancelLabel = "Cancel", tone = "critical" } = opts;

  return new Promise((resolve) => {
    let settled = false;
    function settle(result) {
      if (settled) return;
      settled = true;
      resolve(result);
    }

    const confirmBtn = el("button", { className: `btn btn--${tone}` }, confirmLabel);
    const cancelBtn = el("button", { className: "btn btn--outline" }, cancelLabel);
    confirmBtn.addEventListener("click", () => {
      settle(true);
      close();
    });
    cancelBtn.addEventListener("click", () => {
      settle(false);
      close();
    });

    const body = el("div", { className: "screen__section" }, [
      el("p", { className: "confirm-dialog__message" }, message),
      el("div", { className: "sheet__actions" }, [cancelBtn, confirmBtn]),
    ]);

    const close = openSheet("Are you sure?", body, null, () => settle(false));
  });
}

export function showToast(message) {
  const toast = el("div", { className: "toast" }, message);
  document.body.append(toast);
  setTimeout(() => toast.remove(), 2200);
}
