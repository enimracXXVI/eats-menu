import { el, fmtMoney, openSheet, showToast, sectionHeader, formatPriceOnBlur, onBusyClick } from "../dom.js";
import { api } from "../api.js";
import { state } from "../state.js";
import { addToCart, removeCartLine, decrementCartItem, onCartChange } from "../cart.js";

function openProposeSheet({ item, onSubmitted }) {
  const isNewItem = !item;
  const isSuperuser = state.user.is_superuser;

  const nameInput = isNewItem
    ? el("input", { className: "field__input", type: "text", placeholder: "Item Name" })
    : null;
  const priceInput = el("input", {
    className: "field__input",
    type: "number",
    step: "0.01",
    min: "0",
    value: item ? item.price.toFixed(2) : "",
    placeholder: "0.00",
  });
  formatPriceOnBlur(priceInput);

  const saveBtn = el("button", { className: "btn btn--primary" }, isSuperuser ? "Save" : "Submit for approval");

  onBusyClick(saveBtn, isSuperuser ? "Saving…" : "Sending…", async () => {
    const proposed_price = parseFloat(priceInput.value);
    const proposed_name = isNewItem ? nameInput.value.trim() : item.name;
    if (!proposed_name || Number.isNaN(proposed_price)) return;

    await api.proposeMenuEdit(
      {
        type: isNewItem ? "new_item" : "price_change",
        item_id: item ? item.item_id : "",
        proposed_name,
        proposed_price,
      },
      state.user
    );
    showToast(isSuperuser ? "Updated" : "Sent for approval");
    close();
    onSubmitted();
  });

  // Item names are permanent once created — a typo can only be fixed with
  // direct sheet access — so an existing item's sheet only ever offers a
  // price change plus, via the header trash button, removal.
  const fields = [
    isNewItem ? el("div", { className: "field" }, [el("label", { className: "field__label" }, "Name"), nameInput]) : null,
    el("div", { className: "field" }, [el("label", { className: "field__label" }, "Price"), priceInput]),
  ].filter(Boolean);

  const body = el("div", { className: "screen__section" }, [...fields, el("div", { className: "sheet__actions" }, [saveBtn])]);

  let deleteBtn = null;
  if (!isNewItem) {
    deleteBtn = el("button", { className: "btn btn--icon", "aria-label": `Delete ${item.name}` }, "🗑");
    onBusyClick(deleteBtn, null, async () => {
      const confirmMsg = isSuperuser
        ? `Delete ${item.name}? This can't be undone.`
        : `Propose removing ${item.name}? A superuser will need to approve it.`;
      if (!confirm(confirmMsg)) return;
      await api.proposeMenuEdit(
        { type: "remove_item", item_id: item.item_id, proposed_name: item.name, proposed_price: item.price },
        state.user
      );
      showToast(isSuperuser ? "Item deleted" : "Sent for approval");
      close();
      onSubmitted();
    });
  }

  const close = openSheet(isNewItem ? "Propose a new item" : `Edit ${item.name}`, body, deleteBtn);
}

// Shown to a superuser when they tap a pending badge (existing-item price
// change/removal, or a brand new item) from the Menu tab itself, so they
// don't have to detour through Admin just to decide on one change.
function openReviewSheet(edit, currency, rerender) {
  const label =
    edit.type === "new_item" ? "New item" : edit.type === "remove_item" ? "Remove item" : "Price change";

  const approveBtn = el("button", { className: "btn btn--safe" }, "Approve");
  const rejectBtn = el("button", { className: "btn btn--critical" }, "Reject");

  onBusyClick(approveBtn, "Approving…", async () => {
    await api.reviewEdit(edit.edit_id, { approve: true, reviewer: state.user });
    showToast("Approved");
    close();
    rerender();
  });
  onBusyClick(rejectBtn, "Rejecting…", async () => {
    await api.reviewEdit(edit.edit_id, { approve: false, reviewer: state.user });
    showToast("Rejected");
    close();
    rerender();
  });

  const body = el("div", { className: "screen__section" }, [
    el("p", { className: "row__proposer" }, `Proposed by ${edit.proposed_by}`),
    el("div", { className: "row" }, [
      el("span", { className: "row__title" }, edit.proposed_name),
      el("span", { className: "row__price u-tabular" }, fmtMoney(edit.proposed_price, currency)),
    ]),
    el("div", { className: "sheet__actions" }, [approveBtn, rejectBtn]),
  ]);

  const close = openSheet(label, body);
}

function buildQtyStepper(item, cartLine) {
  const decBtn = el("button", { className: "btn btn--icon", "aria-label": `Remove one ${item.name}` }, "−");
  const incBtn = el("button", { className: "btn btn--icon", "aria-label": `Add one more ${item.name}` }, "+");
  decBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    decrementCartItem(item.item_id);
  });
  incBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    addToCart(item);
  });
  return el("div", { className: "qty-stepper" }, [
    decBtn,
    el("span", { className: "qty-stepper__value" }, String(cartLine.units)),
    incBtn,
  ]);
}

// `rerender` here is always the real app-level rerender (from app.js) — a
// proposed/reviewed edit changes server data (pendingEdits, maybe the menu
// itself), so it needs a real refetch, unlike a plain cart tap which
// onCartChange already handles locally.
function buildMenuRows(menu, pendingByItemId, query, currency, rerender, ui) {
  const filtered = menu.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));

  if (filtered.length === 0) {
    return el("p", { className: "empty" }, "No items match your search.");
  }

  const isSuperuser = state.user.is_superuser;

  const rows = filtered.map((item) => {
    const pending = pendingByItemId.get(item.item_id);
    const cartLine = state.cart.find((c) => c.item_id === item.item_id);
    const expanded = cartLine && ui.expandedItemId === item.item_id;

    const titleNode = pending
      ? el("div", { className: "row__title-group" }, [
          el("span", { className: "row__title" }, item.name),
          el("span", { className: "row__proposer" }, `by ${pending.proposed_by}`),
        ])
      : el("span", { className: "row__title" }, item.name);

    const pendingBadge = pending
      ? isSuperuser
        ? el(
            "button",
            {
              className: "badge badge--pending",
              onClick: (event) => {
                event.stopPropagation();
                openReviewSheet(pending, currency, rerender);
              },
            },
            "Pending"
          )
        : el("span", { className: "badge badge--pending" }, "Pending")
      : null;

    return el(
      "div",
      {
        className: `row row--tappable${cartLine ? " row--selected" : ""}`,
        // No manual refresh call needed for the cart side — addToCart/
        // removeCartLine (from cart.js) notify every subscriber, including
        // this screen's own refreshRows (see onCartChange below), so the
        // row's highlight/count and the dock update together no matter
        // where a cart change came from: this tap, or the inline stepper.
        onClick: () => (cartLine ? removeCartLine(item.item_id) : addToCart(item)),
      },
      [
        titleNode,
        pendingBadge,
        cartLine
          ? expanded
            ? buildQtyStepper(item, cartLine)
            : el(
                "button",
                {
                  className: "qty-badge",
                  "aria-label": `Change quantity of ${item.name}`,
                  onClick: (event) => {
                    event.stopPropagation();
                    ui.expandedItemId = item.item_id;
                    ui.refresh();
                  },
                },
                String(cartLine.units)
              )
          : null,
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
  const isSuperuser = state.user.is_superuser;

  const pendingByItemId = new Map(pendingEdits.filter((e) => e.item_id).map((e) => [e.item_id, e]));
  const newItemProposals = pendingEdits.filter((e) => e.type === "new_item");

  let query = "";
  const rowsSlot = el("div", {});
  const ui = { expandedItemId: null, refresh: refreshRows };
  function refreshRows() {
    rowsSlot.replaceChildren(buildMenuRows(menu, pendingByItemId, query, settings.currency, rerender, ui));
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
  // reflecting what's already been proposed. Superusers can tap a row to
  // approve/reject it right here instead of detouring through Admin.
  const newItemRows = newItemProposals.map((edit) =>
    el(
      "div",
      {
        className: `row${isSuperuser ? " row--tappable" : ""}`,
        onClick: isSuperuser ? () => openReviewSheet(edit, settings.currency, rerender) : null,
      },
      [
        el("div", { className: "row__title-group" }, [
          el("span", { className: "row__title" }, edit.proposed_name),
          el("span", { className: "row__proposer" }, `by ${edit.proposed_by}`),
        ]),
        el("span", { className: "badge badge--pending" }, "New item"),
        el("span", { className: "row__price u-tabular" }, fmtMoney(edit.proposed_price, settings.currency)),
      ]
    )
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
