import { el, fmtMoney, showToast, sectionHeader, CURRENCIES, formatPriceOnBlur, onBusyClick } from "../dom.js";
import { api } from "../api.js";
import { state } from "../state.js";

function buildApprovals(pendingEdits, users, currency, rerender) {
  const usersByUsername = new Map(users.map((u) => [u.username, u]));

  if (pendingEdits.length === 0) {
    return el("p", { className: "empty" }, "No changes waiting on you.");
  }

  const rows = pendingEdits.map((edit) => {
    const proposer = usersByUsername.get(edit.proposed_by);
    const label =
      edit.type === "new_item"
        ? `New item — ${edit.proposed_name}`
        : edit.type === "remove_item"
        ? `Remove ${edit.proposed_name}`
        : edit.proposed_name;

    const diff =
      edit.type === "price_change"
        ? el("span", { className: "approval-row__diff" }, [
            label,
            " ",
            el("span", { className: "approval-row__num" }, fmtMoney(edit.proposed_price, currency)),
          ])
        : el("span", { className: "approval-row__diff" }, [
            label,
            " · ",
            el("span", { className: "approval-row__num" }, fmtMoney(edit.proposed_price, currency)),
          ]);

    async function decide(approve) {
      await api.reviewEdit(edit.edit_id, { approve, reviewer: state.user });
      showToast(approve ? "Approved" : "Rejected");
      rerender();
    }

    const approveBtn = el("button", { className: "btn btn--safe" }, "Approve");
    const rejectBtn = el("button", { className: "btn btn--critical" }, "Reject");
    onBusyClick(approveBtn, "Approving…", () => decide(true));
    onBusyClick(rejectBtn, "Rejecting…", () => decide(false));

    return el("div", { className: "approval-row" }, [
      el(
        "span",
        { className: "approval-row__who" },
        `${proposer ? proposer.display_name : edit.proposed_by} proposes`
      ),
      diff,
      el("div", { className: "approval-row__actions" }, [approveBtn, rejectBtn]),
    ]);
  });

  return el("div", { className: "screen__section" }, rows);
}

function buildUserSwitch(label, isOn, onToggle) {
  return el(
    "button",
    {
      className: `switch${isOn ? " switch--on" : ""}`,
      role: "switch",
      "aria-checked": String(isOn),
      "aria-label": label,
      onClick: onToggle,
    },
    []
  );
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
        if (!confirm(`Delete ${user.display_name}? This can't be undone.`)) return;
        await api.deleteUser(user.user_id, state.user.user_id);
        showToast("User deleted");
        rerender();
      });
    }

    const superuserSwitch = buildUserSwitch(`Toggle superuser for ${user.display_name}`, user.is_superuser, null);
    const activeSwitch = buildUserSwitch(`Toggle active for ${user.display_name}`, user.active, null);
    onBusyClick(superuserSwitch, null, async () => {
      await api.updateUser(user.user_id, { is_superuser: !user.is_superuser });
      rerender();
    });
    onBusyClick(activeSwitch, null, async () => {
      await api.updateUser(user.user_id, { active: !user.active });
      rerender();
    });

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

  const addBtn = el("button", { className: "btn btn--outline btn--block" }, "+ Add user");
  onBusyClick(addBtn, "Adding…", async () => {
    if (!usernameInput.value.trim() || !displayNameInput.value.trim()) return;
    await api.addUser({ username: usernameInput.value, display_name: displayNameInput.value });
    showToast("User added");
    rerender();
  });

  return el("div", { className: "card" }, [
    el("h2", { className: "card__title" }, "Users"),
    el("div", { className: "screen__section" }, rows),
    el("div", { className: "field" }, [
      el("label", { className: "field__label" }, "New user"),
      usernameInput,
      displayNameInput,
    ]),
    addBtn,
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
  const currencyInput = el(
    "select",
    { className: "field__input" },
    CURRENCIES.map((code) =>
      el("option", { value: code, selected: code === settings.currency || null }, code)
    )
  );

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

export function renderAdmin(container, rerender, bundle) {
  const { pendingEdits, users, settings } = bundle;

  container.replaceChildren(
    el("div", { className: "screen__section" }, [
      sectionHeader("Waiting on your approval"),
      buildApprovals(pendingEdits, users, settings.currency, rerender),
    ]),
    buildUsersCard(users, rerender),
    buildSettingsCard(settings, rerender)
  );
}
