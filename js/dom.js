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
export function openSheet(title, bodyNode) {
  let closed = false;

  const handle = el("div", { className: "sheet__handle", "aria-hidden": "true" }, []);
  const sheetEl = el("div", { className: "sheet" }, [
    handle,
    el("h2", { className: "sheet__title" }, title),
    bodyNode,
  ]);

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
export function sectionHeader(text) {
  return el("div", { className: "section-divider" }, [
    el("span", { className: "section-divider__tag" }, text),
    el("span", { className: "section-divider__rule" }),
  ]);
}

export function showToast(message) {
  const toast = el("div", { className: "toast" }, message);
  document.body.append(toast);
  setTimeout(() => toast.remove(), 2200);
}
