import { el, fmtMoney, fmtTime, fmtDate, sectionHeader, showToast, budgetState, onBusyClick, SHARE_ICON_SVG } from "../dom.js";
import { api } from "../api.js";
import { state } from "../state.js";
import { updateDockSpent } from "../cart.js";
import { shareToday } from "../share-card.js";

function buildTicket(spent, allowance, currency) {
  const { remaining, ratio, state: budget } = budgetState(spent, allowance);

  const fillModifier = budget === "over" ? " gauge__fill--over" : budget === "warning" ? " gauge__fill--warning" : "";
  const remainingModifier =
    budget === "over" ? " ticket__remaining--critical" : budget === "warning" ? " ticket__remaining--warning" : "";

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

function buildLoggedRows(purchases, currency, onDelete) {
  if (purchases.length === 0) {
    return el("p", { className: "empty" }, `Nothing purchased yet today ${fmtDate()}`);
  }
  const rows = purchases.map((p) =>
    el("div", { className: "row" }, [
      el(
        "span",
        { className: "row__title" },
        p.units > 1 ? `${p.units}× ${p.item_name}` : p.item_name
      ),
      el("span", { className: "row__meta u-tabular" }, fmtTime(p.timestamp)),
      el("span", { className: "row__price u-tabular" }, fmtMoney(p.price_paid, currency)),
      el(
        "button",
        {
          className: "btn btn--icon",
          "aria-label": `Delete ${p.item_name}`,
          onClick: () => onDelete(p),
        },
        "✕"
      ),
    ])
  );
  return el("div", { className: "rows" }, rows);
}

// `bundle` ({settings, purchases}) is fetched once by app.js — it also
// drives the header's remaining-budget chip, so this screen doesn't repeat
// that request itself. The cart dock lives at the app-shell level (cart.js),
// not here. `purchases` is held as local mutable state so a delete can
// remove the row and update the ticket instantly — the same low-stakes,
// instantly-reversible pattern as favoriting: the request fires in the
// background, and the row only comes back if it actually fails.
export function renderToday(container, rerender, bundle) {
  const { settings } = bundle;
  let purchases = [...bundle.purchases];

  const ticketSlot = el("div", {});
  const rowsSlot = el("div", {});

  // `purchases` is read at click time via closure, not snapshotted here —
  // a delete right before sharing (or right after) is always reflected,
  // same as the ticket/rows themselves.
  const shareBtn = el(
    "button",
    { className: "btn btn--icon", "aria-label": "Share today's purchases", html: SHARE_ICON_SVG },
    []
  );
  onBusyClick(shareBtn, null, () => shareToday({ user: state.user, purchases, settings }));

  function refresh() {
    const spent = purchases.reduce((sum, p) => sum + p.price_paid, 0);
    ticketSlot.replaceChildren(buildTicket(spent, settings.daily_allowance, settings.currency));
    rowsSlot.replaceChildren(buildLoggedRows(purchases, settings.currency, deletePurchase));
    // Keeps the cart dock's "what's left after this" figure correct if the
    // cart gets opened right after a delete — the dock is app-shell level
    // and doesn't otherwise hear about a purchase removed from this screen's
    // own local state (see cart.js's updateDockSpent).
    updateDockSpent(spent);
  }

  async function deletePurchase(purchase) {
    const index = purchases.indexOf(purchase);
    purchases = purchases.filter((p) => p !== purchase);
    refresh();
    try {
      await api.deletePurchase(purchase.purchase_id, state.user.user_id);
      showToast("Purchase removed");
    } catch {
      purchases.splice(index, 0, purchase);
      refresh();
    }
  }

  refresh();

  container.replaceChildren(
    ticketSlot,
    el("div", { className: "screen__section" }, [sectionHeader("Purchased today", shareBtn), rowsSlot])
  );
}
