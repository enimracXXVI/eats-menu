import {
  el,
  fmtMoney,
  currencySymbol,
  openSheet,
  showToast,
  sectionHeader,
  formatPriceOnBlur,
  onBusyClick,
  confirmDialog,
  editCategoryLabel,
  editPriceNode,
  editNameNode,
  CLOSE_ICON_SVG,
  SORT_ARROW_ICON_SVG,
  refreshButton,
  STAR_ICON_SVG_OUTLINE,
  STAR_ICON_SVG_FILLED,
  buildSelectField,
} from "../dom.js";
import { api } from "../api.js";
import { state } from "../state.js";
import { addToCart, removeCartLine, decrementCartItem, onCartChange } from "../cart.js";

// How long an expanded quantity stepper stays open before collapsing back
// to the plain count badge on its own, if it's not touched again.
const STEPPER_IDLE_TIMEOUT_MS = 2000;

function openAddItemSheet({ onSubmitted }) {
  const isSuperuser = state.user.is_superuser;

  const nameInput = el("input", { className: "field__input", type: "text", value: "", placeholder: "Item Name" });
  const priceInput = el("input", {
    className: "field__input",
    type: "number",
    step: "0.01",
    min: "0",
    value: "",
    placeholder: "0.00",
  });
  formatPriceOnBlur(priceInput);

  const saveBtn = el("button", { className: "btn btn--primary" }, isSuperuser ? "Save" : "Send for review");

  onBusyClick(saveBtn, isSuperuser ? "Saving…" : "Sending…", async () => {
    const proposed_price = parseFloat(priceInput.value);
    const proposed_name = nameInput.value.trim();
    if (!proposed_name || Number.isNaN(proposed_price)) return;

    await api.proposeMenuEdit({ type: "new_item", item_id: "", proposed_name, proposed_price }, state.user);
    showToast(isSuperuser ? "Updated" : "Sent for review");
    close();
    onSubmitted();
  });

  const body = el("div", { className: "screen__section" }, [
    el("div", { className: "field" }, [el("label", { className: "field__label" }, "Name"), nameInput]),
    el("div", { className: "field" }, [el("label", { className: "field__label" }, "Price"), priceInput]),
    el("div", { className: "sheet__actions" }, [saveBtn]),
  ]);

  const close = openSheet("Add new item", body);
}

// Reached from the bottom of Menu (replaces the old per-row pencil) — picks
// any item, active or not, via the searchable select. An active item can be
// renamed/repriced or deleted, same as the old pencil did; an inactive one
// (soft-deleted — see Code.gs, nothing in this sheet is ever hard-deleted)
// gets a Reinstate button in place of Delete instead, flipping it back to
// active. `items` includes inactive rows on purpose — this is the only
// place in the app that ever needs them, so it's fetched fresh when the
// sheet opens rather than carried in Menu's own bundle (which stays
// active-only, same as before).
function openEditItemSheet({ items, onSubmitted }) {
  const isSuperuser = state.user.is_superuser;
  const detailsSlot = el("div", {});

  function showItem(item) {
    const nameInput = el("input", { className: "field__input", type: "text", value: item.name, placeholder: "Item Name" });
    const priceInput = el("input", {
      className: "field__input",
      type: "number",
      step: "0.01",
      min: "0",
      value: item.price.toFixed(2),
      placeholder: "0.00",
    });
    formatPriceOnBlur(priceInput);

    const saveBtn = el("button", { className: "btn btn--primary" }, isSuperuser ? "Save" : "Send for review");
    onBusyClick(saveBtn, isSuperuser ? "Saving…" : "Sending…", async () => {
      const proposed_price = parseFloat(priceInput.value);
      const proposed_name = nameInput.value.trim();
      if (!proposed_name || Number.isNaN(proposed_price)) return;

      await api.proposeMenuEdit(
        { type: "price_change", item_id: item.item_id, proposed_name, proposed_price },
        state.user
      );
      showToast(isSuperuser ? "Updated" : "Sent for review");
      close();
      onSubmitted();
    });

    const statusBtn = item.active
      ? el("button", { className: "btn btn--critical" }, "Delete")
      : el("button", { className: "btn btn--safe" }, "Reinstate");
    onBusyClick(statusBtn, null, async () => {
      if (item.active) {
        const confirmMsg = isSuperuser
          ? `Delete ${item.name}? This can't be undone.`
          : `Propose removing ${item.name}? This change will be reviewed before it applies.`;
        if (!(await confirmDialog(confirmMsg))) return;
        await api.proposeMenuEdit(
          { type: "remove_item", item_id: item.item_id, proposed_name: item.name, proposed_price: item.price },
          state.user
        );
        showToast(isSuperuser ? "Item deleted" : "Sent for review");
      } else {
        await api.proposeMenuEdit(
          { type: "reinstate", item_id: item.item_id, proposed_name: item.name, proposed_price: item.price },
          state.user
        );
        showToast(isSuperuser ? "Item reinstated" : "Sent for review");
      }
      close();
      onSubmitted();
    });

    detailsSlot.replaceChildren(
      el("div", { className: "field" }, [el("label", { className: "field__label" }, "Name"), nameInput]),
      el("div", { className: "field" }, [el("label", { className: "field__label" }, "Price"), priceInput]),
      el("div", { className: "sheet__actions" }, [statusBtn, saveBtn])
    );
  }

  const picker = buildSelectField({
    options: items.map((item) => ({ value: item.item_id, label: item.name, hint: item.active ? null : "inactive" })),
    value: null,
    placeholder: "Choose an item",
    searchable: true,
    onChange: (itemId) => showItem(items.find((i) => i.item_id === itemId)),
  });

  const body = el("div", { className: "screen__section" }, [
    el("div", { className: "field" }, [el("label", { className: "field__label" }, "Item"), picker]),
    detailsSlot,
  ]);

  const close = openSheet("Edit item", body);
}

// Shown to a superuser when they tap a pending badge (existing-item edit/
// removal, or a brand new item) from the Menu tab itself, so they don't
// have to detour through Admin just to decide on one change. `previousItem`
// is the item's current row when reviewing an edit against an existing
// item — null for a brand new item proposal, where there's nothing to
// compare against. `onDecide(edit, approve)` (from renderMenu) removes the
// edit from the screen instantly and fires the real request in the
// background — same optimistic pattern as favoriting — so this sheet just
// closes immediately on a tap rather than showing its own busy state.
function openReviewSheet(edit, currency, previousItem, onDecide) {
  const category = editCategoryLabel(edit);
  const nameNode = editNameNode(previousItem, edit.proposed_name);
  const priceNode = editPriceNode(previousItem, edit.proposed_price, currency);

  const approveBtn = el(
    "button",
    {
      className: "btn btn--safe",
      onClick: () => {
        onDecide(edit, true);
        close();
      },
    },
    "Approve"
  );
  const rejectBtn = el(
    "button",
    {
      className: "btn btn--critical",
      onClick: () => {
        onDecide(edit, false);
        close();
      },
    },
    "Reject"
  );

  // No category badge here — the sheet's own title (below) already is the
  // category, so repeating it next to the name would just be noise.
  const body = el("div", { className: "screen__section" }, [
    el("p", { className: "row__proposer" }, `Proposed by ${edit.proposed_by}`),
    el("div", { className: "edit-summary" }, [nameNode, priceNode]),
    el("div", { className: "sheet__actions" }, [approveBtn, rejectBtn]),
  ]);

  const close = openSheet(category, body);
}

function buildQtyStepper(item, cartLine, ui) {
  const decBtn = el("button", { className: "btn btn--icon", "aria-label": `Remove one ${item.name}` }, "−");
  const incBtn = el("button", { className: "btn btn--icon", "aria-label": `Add one more ${item.name}` }, "+");
  decBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    decrementCartItem(item.item_id);
    ui.keepExpanded(item.item_id);
  });
  incBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    addToCart(item);
    ui.keepExpanded(item.item_id);
  });
  return el("div", { className: "qty-stepper" }, [
    decBtn,
    el("span", { className: "qty-stepper__value" }, String(cartLine.units)),
    incBtn,
  ]);
}

function buildStarButton(item, favoriteIds, onToggleFavorite) {
  const isFavorited = favoriteIds.has(item.item_id);
  const button = el(
    "button",
    {
      className: `star-btn${isFavorited ? " star-btn--active" : ""}`,
      "aria-label": isFavorited ? `Remove ${item.name} from favourites` : `Add ${item.name} to favourites`,
      html: isFavorited ? STAR_ICON_SVG_FILLED : STAR_ICON_SVG_OUTLINE,
    },
    []
  );
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onToggleFavorite(item);
  });
  return button;
}

// `rerender` here is always the real app-level rerender (from app.js) — a
// saved edit (Save/Send for review, or delete) changes server data in a
// way that isn't reflected in this screen's own local state, so it needs a
// real refetch, unlike a cart tap, a favorite toggle, or an approve/reject
// decision, which all update this screen's own state directly instead.
function buildMenuRows(menu, pendingByItemId, query, currency, rerender, ui, favoriteIds, onToggleFavorite, decideEdit) {
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
                openReviewSheet(pending, currency, item, decideEdit);
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
        onClick: () => {
          // Tapping any row other than the one whose stepper is open
          // collapses that stepper back to a badge — "tap somewhere else"
          // closes it, same as the idle timeout does.
          if (ui.expandedItemId !== item.item_id) ui.collapse();
          cartLine ? removeCartLine(item.item_id) : addToCart(item);
        },
      },
      [
        buildStarButton(item, favoriteIds, onToggleFavorite),
        titleNode,
        pendingBadge,
        cartLine
          ? expanded
            ? buildQtyStepper(item, cartLine, ui)
            : el(
                "button",
                {
                  className: "qty-badge",
                  "aria-label": `Change quantity of ${item.name}`,
                  onClick: (event) => {
                    event.stopPropagation();
                    ui.keepExpanded(item.item_id);
                  },
                },
                String(cartLine.units)
              )
          : null,
        el("span", { className: "row__price u-tabular" }, fmtMoney(item.price, currency)),
      ]
    );
  });
  return el("div", { className: "rows" }, rows);
}

// Builds one independent sort-direction + sort-field button pair — used for
// both the main Menu list and the Favourites section, each with its own
// state, so sorting Favourites by name doesn't disturb how the main catalog
// is currently sorted (mirroring how each section already has its own
// independent refresh button). `onChange` re-renders whichever list this
// instance belongs to; `compare` is read by that list's own refresh.
function createSortControls(currency, onChange) {
  const SORT_FIELDS = ["price", "name", "id"];
  let field = "price";
  let dir = "asc";

  function fieldLabel() {
    if (field === "price") return currencySymbol(currency);
    if (field === "name") return "A–Z";
    return "ID";
  }

  const fieldBtn = el(
    "button",
    { className: "btn btn--icon btn--icon--text", "aria-label": `Sorting by ${field}. Tap to change.` },
    fieldLabel()
  );
  fieldBtn.addEventListener("click", () => {
    field = SORT_FIELDS[(SORT_FIELDS.indexOf(field) + 1) % SORT_FIELDS.length];
    fieldBtn.textContent = fieldLabel();
    fieldBtn.setAttribute("aria-label", `Sorting by ${field}. Tap to change.`);
    onChange();
  });

  const dirBtn = el(
    "button",
    { className: "btn btn--icon", "aria-label": "Sort ascending. Tap for descending.", html: SORT_ARROW_ICON_SVG },
    []
  );
  dirBtn.addEventListener("click", () => {
    dir = dir === "asc" ? "desc" : "asc";
    dirBtn.classList.toggle("is-flipped", dir === "desc");
    dirBtn.setAttribute(
      "aria-label",
      dir === "asc" ? "Sort ascending. Tap for descending." : "Sort descending. Tap for ascending."
    );
    onChange();
  });

  function compare(a, b) {
    if (field === "price") {
      const priceCmp = a.price - b.price;
      // Ties (same price) always break alphabetically, regardless of the
      // asc/desc toggle — that toggle is about price order, not name order.
      return priceCmp !== 0 ? (dir === "asc" ? priceCmp : -priceCmp) : a.name.localeCompare(b.name);
    }
    let cmp;
    if (field === "name") cmp = a.name.localeCompare(b.name);
    else cmp = a.item_id - b.item_id;
    return dir === "asc" ? cmp : -cmp;
  }

  return { dirBtn, fieldBtn, compare };
}

// One handler at a time collapses whichever stepper is currently open when
// the user taps outside it (another item's badge, the cart dock, anywhere)
// — cleared/replaced on every renderMenu so switching tabs never leaves a
// stray listener behind.
let outsideTapHandler = null;

function watchOutsideTaps(ui) {
  if (outsideTapHandler) document.removeEventListener("pointerdown", outsideTapHandler, true);
  outsideTapHandler = (event) => {
    if (ui.expandedItemId == null) return;
    if (event.target.closest(".qty-stepper")) return;
    ui.collapse();
  };
  document.addEventListener("pointerdown", outsideTapHandler, true);
}

// `bundle` ({menu, pendingEdits, favorites, settings}) is fetched once by
// app.js. `favorites` and `pendingEdits` are both held as local mutable
// state here rather than the shared state.js/cart.js — favoriting and
// approve/reject decisions only ever need to be reflected on this one
// screen, unlike the cart. `refreshInPlace` is used only by the sections'
// own refresh buttons — see app.js for why it's not just `rerender`.
export function renderMenu(container, rerender, bundle, refreshInPlace) {
  const { menu, favorites, settings } = bundle;
  const isSuperuser = state.user.is_superuser;

  let edits = [...bundle.pendingEdits];
  const favoriteIds = new Set(favorites || []);

  const pendingByItemId = () => new Map(edits.filter((e) => e.item_id).map((e) => [e.item_id, e]));
  const newItemProposals = () => edits.filter((e) => e.type === "new_item");

  // Favoriting updates the UI immediately rather than waiting on the round
  // trip — it's a low-stakes, instantly-reversible preference, not a
  // purchase, so there's no reason to make a tap feel laggy. Reverted (with
  // api.js's own error toast already shown) if the request actually fails.
  async function toggleFavorite(item) {
    const wasFavorited = favoriteIds.has(item.item_id);
    if (wasFavorited) favoriteIds.delete(item.item_id);
    else favoriteIds.add(item.item_id);
    refreshAll();
    try {
      if (wasFavorited) await api.removeFavorite(state.user.user_id, item.item_id);
      else await api.addFavorite(state.user.user_id, item.item_id);
    } catch {
      if (wasFavorited) favoriteIds.add(item.item_id);
      else favoriteIds.delete(item.item_id);
      refreshAll();
    }
  }

  // Same instant-then-background pattern for a superuser's approve/reject,
  // here or from the review sheet: the edit disappears from every list on
  // this screen immediately, restored only if the request actually fails.
  async function decideEdit(edit, approve) {
    const index = edits.indexOf(edit);
    edits = edits.filter((e) => e !== edit);
    refreshAll();
    try {
      await api.reviewEdit(edit.edit_id, { approve, reviewer: state.user });
      showToast(approve ? "Approved" : "Rejected");
    } catch {
      edits.splice(index, 0, edit);
      refreshAll();
    }
  }

  let query = "";
  const rowsSlot = el("div", {});
  const favoritesSectionSlot = el("div", {});
  const newItemSlot = el("div", {});

  // Menu's own bundle stays active-only (see buildMenuRows) — inactive
  // items only ever matter for this one sheet, so they're fetched on
  // demand here rather than carried on every Menu load.
  const editItemBtn = el("button", { className: "btn btn--outline btn--block" }, "Edit item");
  onBusyClick(editItemBtn, "Loading…", async () => {
    const items = await api.getMenu({ includeInactive: true });
    openEditItemSheet({ items, onSubmitted: rerender });
  });

  // Independent sort controls for the main Menu list and for Favourites —
  // sorting one doesn't disturb the other. Awaiting review stays in its own
  // natural order (no sort controls there).
  const menuSort = createSortControls(settings.currency, () => refreshRows());
  const favSort = createSortControls(settings.currency, () => refreshFavorites());

  function refreshRows() {
    const sorted = [...menu].sort(menuSort.compare);
    rowsSlot.replaceChildren(
      buildMenuRows(sorted, pendingByItemId(), query, settings.currency, rerender, ui, favoriteIds, toggleFavorite, decideEdit)
    );
  }

  // Sits above the main catalog — not filtered by the search query, always
  // showing every currently-favorited item. Collapses to nothing (no empty
  // state) the moment there are none, same as "Awaiting review" below.
  function refreshFavorites() {
    const favoriteItems = menu.filter((item) => favoriteIds.has(item.item_id)).sort(favSort.compare);
    favoritesSectionSlot.replaceChildren(
      ...(favoriteItems.length > 0
        ? [
            el("div", { className: "screen__section" }, [
              sectionHeader(
                "Favourites",
                el("div", { className: "section-divider__actions" }, [
                  favSort.dirBtn,
                  favSort.fieldBtn,
                  refreshButton("Refresh favourites", refreshInPlace),
                ])
              ),
              buildMenuRows(
                favoriteItems,
                pendingByItemId(),
                "",
                settings.currency,
                rerender,
                ui,
                favoriteIds,
                toggleFavorite,
                decideEdit
              ),
            ]),
          ]
        : [])
    );
  }

  // Visible to everyone, not just superusers, so who's asking for what is
  // always shown here — this isn't the approval queue, just the catalog
  // reflecting what's already been proposed. Superusers can tap a row to
  // approve/reject it right here instead of detouring through Admin.
  function refreshNewItems() {
    const proposals = newItemProposals();
    newItemSlot.replaceChildren(
      ...(proposals.length > 0
        ? [
            el("div", { className: "screen__section" }, [
              sectionHeader("Awaiting review"),
              el(
                "div",
                { className: "rows" },
                proposals.map((edit) =>
                  el(
                    "div",
                    {
                      className: `row${isSuperuser ? " row--tappable" : ""}`,
                      onClick: isSuperuser ? () => openReviewSheet(edit, settings.currency, null, decideEdit) : null,
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
                )
              ),
            ]),
          ]
        : [])
    );
  }

  function refreshAll() {
    refreshRows();
    refreshFavorites();
    refreshNewItems();
  }

  const ui = {
    expandedItemId: null,
    timer: null,
    // Opens (or keeps open) the stepper for one item and (re)starts the
    // idle-collapse timer — used both when the badge is first tapped and
    // on every +/- press, so actively using the stepper never times out
    // mid-interaction.
    keepExpanded(itemId) {
      clearTimeout(this.timer);
      this.expandedItemId = itemId;
      refreshAll();
      this.timer = setTimeout(() => this.collapse(), STEPPER_IDLE_TIMEOUT_MS);
    },
    collapse() {
      clearTimeout(this.timer);
      if (this.expandedItemId == null) return;
      this.expandedItemId = null;
      refreshAll();
    },
  };
  onCartChange(refreshAll);
  watchOutsideTaps(ui);

  const clearSearchBtn = el(
    "button",
    { className: "search-field__clear u-hidden", "aria-label": "Clear search", html: CLOSE_ICON_SVG },
    []
  );
  const searchInput = el("input", {
    className: "field__input",
    type: "text",
    placeholder: "Search menu",
    "aria-label": "Search menu",
    onInput: (event) => {
      ui.collapse();
      query = event.target.value;
      clearSearchBtn.classList.toggle("u-hidden", query.length === 0);
      refreshRows();
    },
  });
  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    query = "";
    clearSearchBtn.classList.add("u-hidden");
    ui.collapse();
    refreshRows();
    searchInput.focus();
  });

  refreshAll();

  container.replaceChildren(
    favoritesSectionSlot,
    el("div", { className: "screen__section" }, [
      sectionHeader(
        "Menu",
        el("div", { className: "section-divider__actions" }, [
          menuSort.dirBtn,
          menuSort.fieldBtn,
          refreshButton("Refresh menu", refreshInPlace),
        ])
      ),
      el("div", { className: "search-field" }, [searchInput, clearSearchBtn]),
      rowsSlot,
    ]),
    newItemSlot,
    el(
      "button",
      {
        className: "btn btn--outline btn--block",
        onClick: () => openAddItemSheet({ onSubmitted: rerender }),
      },
      "+ Add new item"
    ),
    editItemBtn
  );
}
