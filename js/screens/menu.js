import { el, fmtMoney, openSheet, showToast, sectionHeader, formatPriceOnBlur } from "../dom.js";
import { api } from "../api.js";
import { state } from "../state.js";
import { addToCart, onCartChange } from "../cart.js";

function openProposeSheet({ item, onSubmitted }) {
  const isNewItem = !item;

  const nameInput = el("input", {
    className: "field__input",
    type: "text",
    value: item ? item.name : "",
    placeholder: "e.g. Coca-Cola",
  });
  const priceInput = el("input", {
    className: "field__input",
    type: "number",
    step: "0.01",
    min: "0",
    value: item ? item.price.toFixed(2) : "",
    placeholder: "0.00",
  });
  formatPriceOnBlur(priceInput);

  const isSuperuser = state.user.is_superuser;

  const body = el("div", { className: "screen__section" }, [
    el("div", { className: "field" }, [el("label", { className: "field__label" }, "Name"), nameInput]),
    el("div", { className: "field" }, [el("label", { className: "field__label" }, "Price"), priceInput]),
    el("div", { className: "sheet__actions" }, [
      el(
        "button",
        {
          className: "btn btn--primary",
          onClick: async () => {
            const proposed_price = parseFloat(priceInput.value);
            if (!nameInput.value.trim() || Number.isNaN(proposed_price)) return;

            await api.proposeMenuEdit(
              {
                type: isNewItem ? "new_item" : "price_change",
                item_id: item ? item.item_id : "",
                proposed_name: nameInput.value.trim(),
                proposed_price,
              },
              state.user
            );
            showToast(isSuperuser ? "Updated" : "Sent for approval");
            close();
            onSubmitted();
          },
        },
        isSuperuser ? "Save" : "Submit for approval"
      ),
    ]),
  ]);

  const close = openSheet(isNewItem ? "Propose a new item" : `Edit ${item.name}`, body);
}

// `rerender` here is always the real app-level rerender (from app.js) — a
// proposed edit changes server data (a new/updated pendingEdits row, maybe
// the menu itself for a superuser), so it needs a real refetch, unlike a
// plain cart tap which onCartChange already handles locally.
function buildMenuRows(menu, pendingByItemId, query, currency, rerender) {
  const filtered = menu.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));

  if (filtered.length === 0) {
    return el("p", { className: "empty" }, "No items match your search.");
  }

  const rows = filtered.map((item) => {
    const pending = pendingByItemId.get(item.item_id);
    const cartLine = state.cart.find((c) => c.item_id === item.item_id);

    return el(
      "div",
      {
        className: `row row--tappable${cartLine ? " row--selected" : ""}`,
        // No manual refresh call needed — addToCart (from cart.js) notifies
        // every subscriber, including this screen's own refreshRows (see
        // onCartChange below), so the row's highlight/count and the dock
        // update together no matter where a cart change came from: this
        // tap, or +/-/remove inside the cart sheet.
        onClick: () => addToCart(item),
      },
      [
        el("span", { className: "row__title" }, item.name),
        pending ? el("span", { className: "badge badge--pending" }, "Pending") : null,
        cartLine ? el("span", { className: "qty-badge" }, String(cartLine.units)) : null,
        el("span", { className: "row__price u-tabular" }, fmtMoney(item.price, currency)),
        pending
          ? null
          : el(
              "button",
              {
                className: "btn btn--icon",
                "aria-label": `Propose edit for ${item.name}`,
                onClick: (event) => {
                  event.stopPropagation();
                  openProposeSheet({ item, onSubmitted: rerender });
                },
              },
              "✎"
            ),
      ]
    );
  });
  return el("div", { className: "rows" }, rows);
}

// `bundle` ({menu, pendingEdits, settings}) is fetched once by app.js.
export function renderMenu(container, rerender, bundle) {
  const { menu, pendingEdits, settings } = bundle;

  const pendingByItemId = new Map(pendingEdits.filter((e) => e.item_id).map((e) => [e.item_id, e]));
  const newItemProposals = pendingEdits.filter((e) => e.type === "new_item");

  let query = "";
  const rowsSlot = el("div", {});
  function refreshRows() {
    rowsSlot.replaceChildren(buildMenuRows(menu, pendingByItemId, query, settings.currency, rerender));
  }
  onCartChange(refreshRows);

  const searchInput = el("input", {
    className: "field__input",
    type: "search",
    placeholder: "Search menu",
    "aria-label": "Search menu",
    onInput: (event) => {
      query = event.target.value;
      refreshRows();
    },
  });

  refreshRows();

  // Visible to everyone, not just superusers, so who's asking for what is
  // always shown here — this isn't the approval queue, just the catalog
  // reflecting what's already been proposed.
  const newItemRows = newItemProposals.map((edit) =>
    el("div", { className: "row" }, [
      el("div", { className: "row__title-group" }, [
        el("span", { className: "row__title" }, edit.proposed_name),
        el("span", { className: "row__proposer" }, `by ${edit.proposed_by}`),
      ]),
      el("span", { className: "badge badge--pending" }, "New item"),
      el("span", { className: "row__price u-tabular" }, fmtMoney(edit.proposed_price, settings.currency)),
    ])
  );

  container.replaceChildren(
    ...[
      el("div", { className: "screen__section" }, [sectionHeader("Menu"), searchInput, rowsSlot]),
      newItemRows.length > 0
        ? el("div", { className: "screen__section" }, [
            sectionHeader("Awaiting approval"),
            el("div", { className: "rows" }, newItemRows),
          ])
        : null,
      el(
        "button",
        {
          className: "btn btn--outline btn--block",
          onClick: () => openProposeSheet({ item: null, onSubmitted: rerender }),
        },
        "+ Propose a new item"
      ),
    ].filter(Boolean)
  );
}
