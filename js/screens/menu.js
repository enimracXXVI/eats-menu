import { el, fmtMoney, openSheet, showToast, sectionHeader } from "../dom.js";
import { api } from "../api.js";
import { state } from "../state.js";

function openProposeSheet({ item, onSubmitted }) {
  const isNewItem = !item;

  const nameInput = el("input", {
    className: "field__input",
    type: "text",
    value: item ? item.name : "",
    placeholder: "e.g. Seasonal fruit",
  });
  const categoryInput = el("input", {
    className: "field__input",
    type: "text",
    value: item ? item.category : "",
    placeholder: "e.g. Dessert",
  });
  const priceInput = el("input", {
    className: "field__input",
    type: "number",
    step: "0.10",
    min: "0",
    value: item ? item.price : "",
    placeholder: "0.00",
  });

  const body = el("div", { className: "screen__section" }, [
    el("div", { className: "field" }, [el("label", { className: "field__label" }, "Name"), nameInput]),
    el("div", { className: "field" }, [el("label", { className: "field__label" }, "Category"), categoryInput]),
    el("div", { className: "field" }, [el("label", { className: "field__label" }, "Price (€)"), priceInput]),
    el("p", { className: "field__hint" }, "This goes to your superuser for approval before it appears on the menu."),
    el("div", { className: "sheet__actions" }, [
      el(
        "button",
        {
          className: "btn btn--primary",
          onClick: async () => {
            const proposed_price = parseFloat(priceInput.value);
            if (!nameInput.value.trim() || Number.isNaN(proposed_price)) return;

            await api.proposeMenuEdit({
              type: isNewItem ? "new_item" : "price_change",
              item_id: item ? item.item_id : null,
              proposed_name: nameInput.value.trim(),
              proposed_category: categoryInput.value.trim() || "Other",
              proposed_price,
              proposed_by: state.user.user_id,
            });
            showToast("Sent for approval");
            close();
            onSubmitted();
          },
        },
        "Submit for approval"
      ),
    ]),
  ]);

  const close = openSheet(isNewItem ? "Propose a new item" : `Edit ${item.name}`, body);
}

export async function renderMenu(container, rerender) {
  container.replaceChildren(el("p", { className: "empty" }, "Loading…"));

  const [menu, pendingEdits] = await Promise.all([api.getMenu(), api.getPendingEdits("pending")]);

  const pendingByItemId = new Map(pendingEdits.filter((e) => e.item_id).map((e) => [e.item_id, e]));
  const newItemProposals = pendingEdits.filter((e) => e.type === "new_item");

  const cards = menu.map((item) => {
    const pending = pendingByItemId.get(item.item_id);
    return el(
      "div",
      { className: `menu-card${pending ? " menu-card--pending" : ""}` },
      [
        el("div", { className: "menu-card__main" }, [
          el("span", { className: "menu-card__name" }, item.name),
          pending
            ? el("span", { className: "badge badge--pending" }, "Pending")
            : el("span", { className: "menu-card__category" }, item.category),
        ]),
        pending
          ? el("span", { className: "menu-card__price u-tabular" }, [
              el("span", { className: "menu-card__price-old" }, fmtMoney(item.price)),
              fmtMoney(pending.proposed_price),
            ])
          : el("span", { className: "menu-card__price u-tabular" }, fmtMoney(item.price)),
        pending
          ? null
          : el(
              "button",
              {
                className: "btn btn--icon",
                "aria-label": `Propose edit for ${item.name}`,
                onClick: () => openProposeSheet({ item, onSubmitted: rerender }),
              },
              "✎"
            ),
      ]
    );
  });

  newItemProposals.forEach((edit) => {
    cards.push(
      el("div", { className: "menu-card menu-card--pending" }, [
        el("div", { className: "menu-card__main" }, [
          el("span", { className: "menu-card__name" }, edit.proposed_name),
          el("span", { className: "badge badge--pending" }, "Pending · new item"),
        ]),
        el("span", { className: "menu-card__price u-tabular" }, fmtMoney(edit.proposed_price)),
      ])
    );
  });

  container.replaceChildren(
    el("div", { className: "screen__section" }, [sectionHeader("Today's menu"), el("div", { className: "screen__section" }, cards)]),
    el(
      "button",
      {
        className: "btn btn--outline btn--block",
        onClick: () => openProposeSheet({ item: null, onSubmitted: rerender }),
      },
      "+ Propose a new item"
    )
  );
}
