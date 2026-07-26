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

export function fmtMoney(value, currency = "EUR") {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  return `${symbol}${Number(value).toFixed(2)}`;
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
  window.addEventListener("popstate", onPopState);

  function onPopState() {
    finish();
  }

  function finish() {
    if (closed) return;
    closed = true;
    window.removeEventListener("popstate", onPopState);
    backdrop.remove();
    if (onClose) onClose();
  }

  function close() {
    if (closed) return;
    finish();
    if (history.state && history.state.sheet) history.back();
  }

  attachSheetDrag(handle, sheetEl, backdrop, close);

  return close;
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

export function refreshButton(label, onClick) {
  const button = el("button", { className: "btn btn--icon", "aria-label": label, html: REFRESH_ICON_SVG }, []);
  onBusyClick(button, null, onClick);
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
