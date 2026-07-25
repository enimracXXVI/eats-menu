import { el, fmtMoney, fmtTime, sectionHeader, showToast, budgetState } from "../dom.js";
import { api } from "../api.js";
import { state } from "../state.js";
import { buildCartBar } from "../cart.js";

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

// `bundle` is {settings, purchases} for today, already fetched once by
// app.js for the header — passed in here so this screen doesn't repeat the
// same request a second time.
export async function renderToday(container, rerender, bundle) {
  container.replaceChildren(el("p", { className: "empty" }, "Loading…"));

  const { settings, purchases } =
    bundle ||
    (await api.getTodayBundle({
      userId: state.user.user_id,
      date: new Date().toISOString().slice(0, 10),
    }));

  const spent = purchases.reduce((sum, p) => sum + p.price_paid, 0);

  const cartBarSlot = el("div", {}, buildCartBar(settings.currency, rerender));

  container.replaceChildren(
    buildTicket(spent, settings.daily_allowance, settings.currency),
    el("div", { className: "screen__section" }, [
      sectionHeader("Purchased today"),
      buildLoggedRows(purchases, settings.currency, rerender),
    ]),
    cartBarSlot
  );
}
