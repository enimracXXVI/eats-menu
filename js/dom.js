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

export function fmtTime(isoTimestamp) {
  if (!isoTimestamp) return "";
  return isoTimestamp.slice(11, 16);
}

export function mount(root, node) {
  root.replaceChildren(node);
}

// Bottom sheet used for the cart review and the propose-edit form.
// Returns a close() function. Closes on: handle tap, backdrop tap, calling
// close() yourself, or the phone/browser back button — a pushState marker
// is added while the sheet is open so back closes the sheet instead of
// navigating the app away, same as any native modal would behave.
export function openSheet(title, bodyNode) {
  let closed = false;

  const backdrop = el(
    "div",
    {
      className: "sheet-backdrop",
      onClick: (event) => {
        if (event.target === backdrop) close();
      },
    },
    [
      el("div", { className: "sheet" }, [
        el("button", { className: "sheet__handle", "aria-label": "Close", onClick: () => close() }, []),
        el("h2", { className: "sheet__title" }, title),
        bodyNode,
      ]),
    ]
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

  return close;
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
