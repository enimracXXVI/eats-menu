import { el, fmtMoney, fmtTime, openSheet, showToast, sectionHeader } from "../dom.js";
import { api } from "../api.js";
import { state, addToCart, removeFromCart, clearCart, cartTotal } from "../state.js";

function buildTicket(spent, allowance, currency) {
  const remaining = allowance - spent;
  const ratio = allowance > 0 ? spent / allowance : 0;

  let fillModifier = "";
  let remainingModifier = "";
  if (ratio >= 1) {
    fillModifier = " gauge__fill--over";
    remainingModifier = " ticket__remaining--critical";
  } else if (ratio >= 0.85) {
    fillModifier = " gauge__fill--warning";
    remainingModifier = " ticket__remaining--warning";
  }

  const headline =
    remaining >= 0 ? `${fmtMoney(remaining, currency)} left` : `${fmtMoney(-remaining, currency)} over`;

  return el("div", { className: "ticket" }, [
    el("span", { className: "ticket__remaining-label" }, "Remaining today"),
    el("span", { className: `ticket__remaining${remainingModifier}` }, headline),
    el("div", { className: "ticket__perforation" }),
    el("div", { className: "gauge" }, [
      el("div", { className: "gauge__track" }, [
        el("div", {
          className: `gauge__fill${fillModifier}`,
          style: `width:${Math.min(ratio, 1) * 100}%`,
        }),
      ]),
      el("div", { className: "gauge__marks" }, [
        el("span", {}, fmtMoney(0, currency)),
        el("span", {}, fmtMoney(allowance, currency)),
      ]),
    ]),
    el("p", { className: "ticket__gauge-caption" }, [
      el("strong", {}, fmtMoney(spent, currency)),
      ` of ${fmtMoney(allowance, currency)}`,
    ]),
  ]);
}

function buildMenuRows(menu, container, refreshCart) {
  const rows = menu.map((item) => {
    const isInCart = state.cart.some((c) => c.item_id === item.item_id);
    return el(
      "div",
      {
        className: `row row--tappable${isInCart ? " row--selected" : ""}`,
        onClick: () => {
          if (isInCart) {
            removeFromCart(state.cart.findIndex((c) => c.item_id === item.item_id));
          } else {
            addToCart(item);
          }
          refreshCart();
        },
      },
      [
        el("span", { className: "row__title" }, item.name),
        el("span", { className: "row__meta" }, item.category),
        el("span", { className: "row__price u-tabular" }, fmtMoney(item.price)),
      ]
    );
  });
  return el("div", { className: "rows" }, rows);
}

function buildLoggedRows(purchases, currency) {
  if (purchases.length === 0) {
    return el("p", { className: "empty" }, "Nothing logged yet today — tap something above.");
  }
  const rows = purchases.map((p) =>
    el("div", { className: "row" }, [
      el("span", { className: "row__title" }, p.item_name),
      el("span", { className: "row__meta u-tabular" }, fmtTime(p.timestamp)),
      el("span", { className: "row__price u-tabular" }, fmtMoney(p.price_paid, currency)),
    ])
  );
  return el("div", { className: "rows" }, rows);
}

function openCartSheet({ currency, onConfirm }) {
  const list = el("div", { className: "rows" }, []);

  function renderList() {
    if (state.cart.length === 0) {
      list.replaceChildren(el("p", { className: "empty" }, "Cart is empty."));
      return;
    }
    list.replaceChildren(
      ...state.cart.map((item, index) =>
        el("div", { className: "row" }, [
          el("span", { className: "row__title" }, item.name),
          el("span", { className: "row__price u-tabular" }, fmtMoney(item.price, currency)),
          el(
            "button",
            {
              className: "btn btn--icon",
              "aria-label": `Remove ${item.name}`,
              onClick: () => {
                removeFromCart(index);
                renderList();
                total.textContent = fmtMoney(cartTotal(), currency);
                if (state.cart.length === 0) close();
              },
            },
            "✕"
          ),
        ])
      )
    );
  }

  const total = el("span", { className: "u-tabular" }, fmtMoney(cartTotal(), currency));

  const body = el("div", { className: "screen__section" }, [
    list,
    el("p", { className: "ticket__gauge-caption" }, ["Subtotal: ", total]),
    el("div", { className: "sheet__actions" }, [
      el(
        "button",
        {
          className: "btn btn--primary",
          onClick: () => {
            onConfirm();
            close();
          },
        },
        `Log purchase — ${fmtMoney(cartTotal(), currency)}`
      ),
    ]),
  ]);

  renderList();
  const close = openSheet("Your cart", body);
}

export async function renderToday(container, rerender) {
  container.replaceChildren(el("p", { className: "empty" }, "Loading…"));

  const [settings, menu, purchases] = await Promise.all([
    api.getSettings(),
    api.getMenu(),
    api.getPurchases({ userId: state.user.user_id, date: new Date().toISOString().slice(0, 10) }),
  ]);

  const spent = purchases.reduce((sum, p) => sum + p.price_paid, 0);

  const menuRowsSlot = el("div", {});
  function refreshMenuRows() {
    menuRowsSlot.replaceChildren(buildMenuRows(menu, menuRowsSlot, refreshMenuRows));
    refreshCartBar();
  }

  const cartBarSlot = el("div", {});
  function refreshCartBar() {
    if (state.cart.length === 0) {
      cartBarSlot.replaceChildren();
      return;
    }
    cartBarSlot.replaceChildren(
      el(
        "div",
        { className: "cart-bar", onClick: openReviewSheet },
        [
          el("span", { className: "cart-bar__summary" }, [
            `${state.cart.length} item${state.cart.length > 1 ? "s" : ""} · `,
            el("span", { className: "u-tabular" }, fmtMoney(cartTotal(), settings.currency)),
          ]),
          el(
            "button",
            {
              className: "btn btn--primary btn--sm",
              onClick: (event) => {
                event.stopPropagation();
                openReviewSheet();
              },
            },
            "Review"
          ),
        ]
      )
    );
  }

  function openReviewSheet() {
    openCartSheet({
      currency: settings.currency,
      onConfirm: async () => {
        const items = [...state.cart];
        await api.logPurchases(state.user.user_id, items);
        clearCart();
        showToast("Purchase logged");
        rerender();
      },
    });
  }

  refreshMenuRows();
  refreshCartBar();

  container.replaceChildren(
    buildTicket(spent, settings.daily_allowance, settings.currency),
    el("div", { className: "screen__section" }, [sectionHeader("Tap what you got"), menuRowsSlot]),
    el("div", { className: "screen__section" }, [
      sectionHeader("Logged today"),
      buildLoggedRows(purchases, settings.currency),
    ]),
    cartBarSlot
  );
}
