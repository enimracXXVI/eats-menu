// The cart is shared across the Menu (where items get added) and Today
// (where it's reviewed and logged) screens. This file is the one place that
// mutates it and the one place that builds its UI, so:
//   - every mutation (tapping a row, +/- in the sheet, removing a line)
//     goes through the wrapped functions below, which notify listeners —
//     so the menu rows behind an open cart sheet can never go stale
//     relative to what's actually in the cart.
//   - the floating cart dock (mountCartDock) lives at the app-shell level,
//     not inside either screen, so it's always reachable without scrolling.

import { el, fmtMoney, openSheet, showToast, onBusyClick, budgetState } from "./dom.js";
import { api } from "./api.js";
import {
  state,
  addToCart as _addToCart,
  decrementCartItem as _decrementCartItem,
  removeCartLine as _removeCartLine,
  clearCart,
  cartTotal,
  cartUnitCount,
} from "./state.js";

const listeners = new Set();

// A screen calls this once, when it mounts, with the callback to run
// whenever the cart changes for ANY reason (including from inside the
// sheet). app.js clears all listeners at the start of every render(), so a
// screen never needs to explicitly unsubscribe on navigation.
export function onCartChange(fn) {
  listeners.add(fn);
}

export function clearCartChangeListeners() {
  listeners.clear();
}

function notifyCartChanged() {
  refreshCartDock();
  listeners.forEach((fn) => fn());
}

export function addToCart(item) {
  _addToCart(item);
  notifyCartChanged();
}

export function decrementCartItem(itemId) {
  _decrementCartItem(itemId);
  notifyCartChanged();
}

export function removeCartLine(itemId) {
  _removeCartLine(itemId);
  notifyCartChanged();
}

// ---------------------------------------------------------------------------
// The floating dock — a sibling of .screen and .nav in the app shell (see
// app.js), so it sits above the nav regardless of how far the current
// screen is scrolled. Only rendered once the cart has something in it.
// ---------------------------------------------------------------------------

let dockEl = null;
let dockCurrency = "EUR";
let dockAllowance = 0;
let dockSpent = 0;
let onPurchaseLogged = () => {};

// `allowance`/`spent` are today's, from whichever bundle mounted this dock
// (every bundle carries today's purchases — see app.js) — what the cart
// sheet needs to show what's left *after* the cart, not just today so far.
export function mountCartDock(el_, currency, allowance, spent, onLogged) {
  dockEl = el_;
  dockCurrency = currency;
  dockAllowance = allowance;
  dockSpent = spent;
  onPurchaseLogged = onLogged;
  refreshCartDock();
}

// Today's own delete-purchase flow updates `purchases` locally (optimistic,
// no full app rerender — see today.js), which would otherwise leave this
// module's `dockSpent` stale until the next real navigation/refetch. Called
// alongside that screen's own ticket update so a cart opened right after a
// delete already reflects the new spent-today total.
export function updateDockSpent(spent) {
  dockSpent = spent;
}

export function refreshCartDock() {
  if (!dockEl) return;
  dockEl.replaceChildren(...(state.cart.length > 0 ? [buildCartBar()] : []));
}

function buildCartBar() {
  const count = cartUnitCount();
  return el("div", { className: "cart-bar", onClick: () => openCartSheet() }, [
    el("span", { className: "cart-bar__summary" }, [
      `${count} item${count > 1 ? "s" : ""} · `,
      el("span", { className: "u-tabular" }, fmtMoney(cartTotal(), dockCurrency)),
    ]),
    el(
      "button",
      {
        className: "btn btn--primary btn--sm",
        onClick: (event) => {
          event.stopPropagation();
          openCartSheet();
        },
      },
      "View"
    ),
  ]);
}

function openCartSheet() {
  const currency = dockCurrency;
  const list = el("div", { className: "rows" }, []);
  const projectedNode = el("p", { className: "ticket__gauge-caption" }, "");
  const overWarning = el("p", { className: "field__error" }, "");
  const confirmBtn = el("button", { className: "btn btn--primary" }, "");

  function refresh() {
    if (state.cart.length === 0) {
      list.replaceChildren(el("p", { className: "empty" }, "Cart is empty."));
      close();
      return;
    }
    list.replaceChildren(
      ...state.cart.map((item) =>
        el("div", { className: "row" }, [
          el("span", { className: "row__title" }, item.name),
          el("div", { className: "qty-stepper" }, [
            el(
              "button",
              {
                className: "btn btn--icon",
                "aria-label": `Remove one ${item.name}`,
                onClick: () => {
                  decrementCartItem(item.item_id);
                  refresh();
                },
              },
              "−"
            ),
            el("span", { className: "qty-stepper__value" }, String(item.units)),
            el(
              "button",
              {
                className: "btn btn--icon",
                "aria-label": `Add one more ${item.name}`,
                onClick: () => {
                  addToCart(item);
                  refresh();
                },
              },
              "+"
            ),
          ]),
          el("span", { className: "row__price u-tabular" }, fmtMoney(item.price * item.units, currency)),
          el(
            "button",
            {
              className: "btn btn--icon",
              "aria-label": `Remove ${item.name} from cart`,
              onClick: () => {
                removeCartLine(item.item_id);
                refresh();
              },
            },
            "✕"
          ),
        ])
      )
    );
    confirmBtn.textContent = `Log purchase — ${fmtMoney(cartTotal(), currency)}`;

    // What today's remaining amount would become if this cart gets logged
    // — not just today's total so far, so a purchase that would tip you
    // over is obvious before you confirm it, not after. Deliberately binary
    // (unlike the Today ticket's safe/warning/over 3-tier gauge): this alert
    // only fires once the cart would actually put you over, not while
    // merely approaching the allowance. The over-amount lives in the
    // warning sentence itself rather than a separate line — that separate
    // line used to combine .ticket__gauge-caption with a color-modifier
    // class, and .ticket__gauge-caption's own color rule (declared later in
    // components.css) silently won the cascade, making the amount
    // functionally invisible.
    const { remaining, state: budget } = budgetState(dockSpent + cartTotal(), dockAllowance);
    const isOver = budget === "over";
    projectedNode.textContent = isOver ? "" : `${fmtMoney(remaining, currency)} left after this`;
    overWarning.textContent = isOver
      ? `This purchase will put you over your daily allowance by ${fmtMoney(-remaining, currency)}.`
      : "";
  }

  onBusyClick(confirmBtn, "Logging…", async () => {
    const items = state.cart.map((item) => ({ ...item }));
    await api.logPurchases(state.user, items);
    clearCart();
    notifyCartChanged();
    showToast("Purchase logged");
    // Redirect before close(): close() calls history.back() to pop the
    // sheet's own pushState marker, which races a hash change made after
    // it — call it first here so by the time close() checks history.state,
    // the redirect has already replaced the top of the stack and there's
    // nothing left for history.back() to undo.
    onPurchaseLogged();
    close();
  });

  const body = el("div", { className: "screen__section" }, [
    list,
    projectedNode,
    overWarning,
    el("div", { className: "sheet__actions" }, [confirmBtn]),
  ]);

  refresh();
  const close = openSheet("Your cart", body);
}
