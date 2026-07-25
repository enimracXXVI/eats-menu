import { el, fmtMoney, fmtTime, sectionHeader, showToast, budgetState } from "../dom.js";
import { api } from "../api.js";
import { state } from "../state.js";

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

function buildLoggedRows(purchases, currency, onDeleted) {
  if (purchases.length === 0) {
    return el("p", { className: "empty" }, "Nothing purchased yet today — add something from Menu.");
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
          onClick: async () => {
            await api.deletePurchase(p.purchase_id, state.user.user_id);
            showToast("Purchase removed");
            onDeleted();
          },
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
// not here.
export function renderToday(container, rerender, bundle) {
  const { settings, purchases } = bundle;
  const spent = purchases.reduce((sum, p) => sum + p.price_paid, 0);

  container.replaceChildren(
    buildTicket(spent, settings.daily_allowance, settings.currency),
    el("div", { className: "screen__section" }, [
      sectionHeader("Purchased today"),
      buildLoggedRows(purchases, settings.currency, rerender),
    ])
  );
}
