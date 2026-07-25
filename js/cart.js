// The cart is shared across the Menu (where items get added) and Today
// (where it gets reviewed and logged) screens — this is the one place that
// builds its UI, so both screens stay pixel-identical instead of drifting.

import { el, fmtMoney, openSheet, showToast } from "./dom.js";
import { api } from "./api.js";
import { state, addToCart, decrementCartItem, removeCartLine, clearCart, cartTotal, cartUnitCount } from "./state.js";

export function buildCartBar(currency, rerender) {
  if (state.cart.length === 0) return el("div", {}, []);

  const count = cartUnitCount();
  return el("div", { className: "cart-bar", onClick: () => openCartSheet(currency, rerender) }, [
    el("span", { className: "cart-bar__summary" }, [
      `${count} item${count > 1 ? "s" : ""} · `,
      el("span", { className: "u-tabular" }, fmtMoney(cartTotal(), currency)),
    ]),
    el(
      "button",
      {
        className: "btn btn--primary btn--sm",
        onClick: (event) => {
          event.stopPropagation();
          openCartSheet(currency, rerender);
        },
      },
      "Review"
    ),
  ]);
}

export function openCartSheet(currency, rerender) {
  const list = el("div", { className: "rows" }, []);
  const total = el("span", { className: "u-tabular" }, "");
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
    total.textContent = fmtMoney(cartTotal(), currency);
    confirmBtn.textContent = `Log purchase — ${fmtMoney(cartTotal(), currency)}`;
  }

  confirmBtn.addEventListener("click", async () => {
    const items = state.cart.map((item) => ({ ...item }));
    await api.logPurchases(state.user, items);
    clearCart();
    showToast("Purchase logged");
    close();
    rerender();
  });

  const body = el("div", { className: "screen__section" }, [
    list,
    el("p", { className: "ticket__gauge-caption" }, ["Subtotal: ", total]),
    el("div", { className: "sheet__actions" }, [confirmBtn]),
  ]);

  refresh();
  const close = openSheet("Your cart", body);
}
