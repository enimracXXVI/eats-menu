import {
  el,
  showToast,
  sectionHeader,
  CURRENCIES,
  formatPriceOnBlur,
  onBusyClick,
  confirmDialog,
  editCategoryLabel,
  editPriceNode,
  editNameNode,
  refreshButton,
  attachOptimisticToggle,
  BARCODE_ICON_SVG,
  buildSelectField,
} from "../dom.js";
import { api } from "../api.js";
import { state } from "../state.js";
import { openBarcodeScanner } from "../barcode-scanner.js";

// `menu` (from getAdminBundle, includeInactive) is how "what did this used
// to cost" gets answered for a price-change proposal — without it, a row
// like "cocomero €0.30" gives no clue whether €0.30 is the new price, the
// whole cost, or something else entirely.
//
// Approve/Reject remove the row instantly (optimistic, like favoriting —
// the request happens in the background, and the row only comes back if
// it actually fails) rather than waiting on a round trip and a full
// rerender. This also fixes the earlier "both buttons stay live" bug more
// thoroughly than disabling did: once a row is gone, there's nothing left
// to double-tap.
function buildApprovalsSection(pendingEdits, users, menu, currency) {
  const usersByUsername = new Map(users.map((u) => [u.username, u]));
  const menuByItemId = new Map(menu.map((m) => [m.item_id, m]));
  let edits = [...pendingEdits];
  const slot = el("div", {});

  function refresh() {
    if (edits.length === 0) {
      slot.replaceChildren(el("p", { className: "empty" }, "No changes waiting on you."));
      return;
    }
    slot.replaceChildren(el("div", { className: "screen__section" }, edits.map(buildRow)));
  }

  function buildRow(edit) {
    const proposer = usersByUsername.get(edit.proposed_by);
    const previousItem = edit.item_id ? menuByItemId.get(edit.item_id) : null;
    const category = editCategoryLabel(edit);
    const nameNode = editNameNode(previousItem, edit.proposed_name);
    const priceNode = editPriceNode(previousItem, edit.proposed_price, currency);

    async function decide(approve) {
      const index = edits.indexOf(edit);
      edits = edits.filter((e) => e !== edit);
      refresh();
      try {
        await api.reviewEdit(edit.edit_id, { approve, reviewer: state.user });
        showToast(approve ? "Approved" : "Rejected");
      } catch {
        edits.splice(index, 0, edit);
        refresh();
      }
    }

    const approveBtn = el("button", { className: "btn btn--safe", onClick: () => decide(true) }, "Approve");
    const rejectBtn = el("button", { className: "btn btn--critical", onClick: () => decide(false) }, "Reject");

    return el("div", { className: "approval-row" }, [
      el("span", { className: "approval-row__who" }, [
        `${proposer ? proposer.display_name : edit.proposed_by} proposes `,
        el("span", { className: "approval-row__category" }, category),
      ]),
      el("div", { className: "edit-summary" }, [nameNode, priceNode]),
      el("div", { className: "approval-row__actions" }, [approveBtn, rejectBtn]),
    ]);
  }

  refresh();
  return slot;
}

function buildUserSwitch(label, isOn, onToggle) {
  const button = el(
    "button",
    {
      className: `switch${isOn ? " switch--on" : ""}`,
      role: "switch",
      "aria-checked": String(isOn),
      "aria-label": label,
    },
    []
  );
  attachOptimisticToggle(button, onToggle);
  return button;
}

function buildUsersCard(users, rerender) {
  const rows = users.map((user) => {
    const isSelf = user.user_id === state.user.user_id;

    let deleteBtn = null;
    if (!isSelf) {
      deleteBtn = el(
        "button",
        { className: "btn btn--icon u-push-right", "aria-label": `Delete ${user.display_name}` },
        "✕"
      );
      onBusyClick(deleteBtn, null, async () => {
        if (!(await confirmDialog(`Delete ${user.display_name}? This can't be undone.`))) return;
        await api.deleteUser(user.user_id, state.user.user_id);
        showToast("User deleted");
        rerender();
      });
    }

    const superuserSwitch = buildUserSwitch(`Toggle superuser for ${user.display_name}`, user.is_superuser, (next) =>
      api.updateUser(user.user_id, { is_superuser: next })
    );
    const activeSwitch = buildUserSwitch(`Toggle active for ${user.display_name}`, user.active, (next) =>
      api.updateUser(user.user_id, { active: next })
    );

    return el("div", { className: "user-row" }, [
      el(
        "div",
        { className: "user-row__name" },
        [
          user.display_name,
          user.is_superuser ? el("span", { className: "badge badge--superuser" }, "Superuser") : null,
          deleteBtn,
        ].filter(Boolean)
      ),
      el("div", { className: "user-row__toggles" }, [
        el("div", { className: "toggle-row" }, [el("span", { className: "toggle-row__label" }, "Superuser"), superuserSwitch]),
        el("div", { className: "toggle-row" }, [el("span", { className: "toggle-row__label" }, "Active"), activeSwitch]),
      ]),
    ]);
  });

  const usernameInput = el("input", { className: "field__input", type: "text", placeholder: "username" });
  const displayNameInput = el("input", { className: "field__input", type: "text", placeholder: "Display name" });

  // Scanning is optional here — a superuser can add someone before their
  // physical barcode is on hand, and attach/replace it later via updateUser
  // (not built here, since editing an existing user's barcode wasn't asked
  // for). The hint stays blank until there's something to report, rather
  // than announcing the empty state up front. A barcode that already
  // belongs to someone else is surfaced immediately (instead of only on
  // submit) and isn't attached to the new-user payload — addUser also
  // rejects a duplicate barcode server-side, so this is a fast local
  // warning on top of that real guard, not a substitute for it.
  let scannedBarcode = null;
  const barcodeHint = el("p", { className: "field__hint" }, "");
  const scanBtn = el(
    "button",
    { type: "button", className: "field__icon-btn", "aria-label": "Scan new user's barcode", html: BARCODE_ICON_SVG },
    []
  );
  scanBtn.addEventListener("click", () => {
    openBarcodeScanner({
      onDecode: async (code) => {
        let existing;
        try {
          existing = await api.findUserByBarcode(code);
        } catch {
          return;
        }
        if (existing) {
          scannedBarcode = null;
          barcodeHint.textContent = `Already registered to ${existing.display_name} (@${existing.username}).`;
          return;
        }
        scannedBarcode = code;
        barcodeHint.textContent = "Barcode captured.";
      },
    });
  });

  const addBtn = el("button", { className: "btn btn--outline btn--block" }, "+ Add user");
  onBusyClick(addBtn, "Adding…", async () => {
    if (!usernameInput.value.trim() || !displayNameInput.value.trim()) return;
    await api.addUser({
      username: usernameInput.value,
      display_name: displayNameInput.value,
      barcode: scannedBarcode,
    });
    showToast("User added");
    scannedBarcode = null;
    barcodeHint.textContent = "";
    rerender();
  });

  return el("div", { className: "card" }, [
    el("h2", { className: "card__title" }, "Users"),
    el("div", { className: "screen__section" }, rows),
    el("div", { className: "field" }, [
      el("label", { className: "field__label" }, "New user"),
      el("div", { className: "field--icon-input" }, [usernameInput, scanBtn]),
      displayNameInput,
      barcodeHint,
    ]),
    addBtn,
  ]);
}

// Both are static reference pages that live outside the hash-routed app
// (real .html files, sibling to index.html) — opened in a new tab so
// leaving them doesn't lose the current Admin screen state underneath.
function buildReferenceCard() {
  return el("div", { className: "card" }, [
    el("h2", { className: "card__title" }, "Reference"),
    el("div", { className: "screen__section" }, [
      el("a", { className: "btn btn--outline btn--block", href: "styleguide.html", target: "_blank", rel: "noopener" }, "Style guide"),
      el("a", { className: "btn btn--outline btn--block", href: "db-schema.html", target: "_blank", rel: "noopener" }, "Database schema"),
    ]),
  ]);
}

function buildSettingsCard(settings, rerender) {
  const allowanceInput = el("input", {
    className: "field__input",
    type: "number",
    step: "0.01",
    min: "0",
    value: Number(settings.daily_allowance).toFixed(2),
  });
  formatPriceOnBlur(allowanceInput);
  const currencyInput = buildSelectField({
    options: CURRENCIES.map((code) => ({ value: code, label: code })),
    value: settings.currency,
    placeholder: "Currency",
  });

  const saveBtn = el("button", { className: "btn btn--primary btn--block" }, "Save settings");
  onBusyClick(saveBtn, "Saving…", async () => {
    const daily_allowance = parseFloat(allowanceInput.value);
    if (Number.isNaN(daily_allowance)) return;
    await api.updateSettings({ daily_allowance, currency: currencyInput.value.trim() });
    showToast("Settings saved");
    rerender();
  });

  return el("div", { className: "card" }, [
    el("h2", { className: "card__title" }, "Settings"),
    el("div", { className: "field" }, [
      el("label", { className: "field__label" }, "Daily allowance"),
      allowanceInput,
    ]),
    el("div", { className: "field" }, [el("label", { className: "field__label" }, "Currency"), currencyInput]),
    saveBtn,
  ]);
}

// `refreshInPlace` is used only by the section's own refresh button — see
// app.js for why it's not just `rerender`.
export function renderAdmin(container, rerender, bundle, refreshInPlace) {
  const { pendingEdits, users, menu, settings } = bundle;

  container.replaceChildren(
    el("div", { className: "screen__section" }, [
      sectionHeader("Waiting on your approval", refreshButton("Refresh", refreshInPlace)),
      buildApprovalsSection(pendingEdits, users, menu, settings.currency),
    ]),
    buildUsersCard(users, rerender),
    buildSettingsCard(settings, rerender),
    buildReferenceCard()
  );
}
