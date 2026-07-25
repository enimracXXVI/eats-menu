import { el, fmtMoney, showToast, sectionHeader, CURRENCIES, formatPriceOnBlur } from "../dom.js";
import { api } from "../api.js";
import { state } from "../state.js";

function buildApprovals(pendingEdits, users, rerender) {
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
            el("span", { className: "approval-row__num" }, fmtMoney(edit.proposed_price)),
          ])
        : el("span", { className: "approval-row__diff" }, [
            label,
            " · ",
            el("span", { className: "approval-row__num" }, fmtMoney(edit.proposed_price)),
          ]);

    async function decide(approve) {
      await api.reviewEdit(edit.edit_id, { approve, reviewer: state.user });
      showToast(approve ? "Approved" : "Rejected");
      rerender();
    }

    return el("div", { className: "approval-row" }, [
      el(
        "span",
        { className: "approval-row__who" },
        `${proposer ? proposer.display_name : edit.proposed_by} proposes`
      ),
      diff,
      el("div", { className: "approval-row__actions" }, [
        el("button", { className: "btn btn--safe", onClick: () => decide(true) }, "Approve"),
        el("button", { className: "btn btn--critical", onClick: () => decide(false) }, "Reject"),
      ]),
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
  const rows = users.map((user) =>
    el("div", { className: "user-row" }, [
      el("div", { className: "user-row__name" }, [
        user.display_name,
        user.is_superuser ? el("span", { className: "badge badge--superuser" }, "Superuser") : null,
      ]),
      el("div", { className: "user-row__toggles" }, [
        el("div", { className: "toggle-row" }, [
          el("span", { className: "toggle-row__label" }, "Superuser"),
          buildUserSwitch(`Toggle superuser for ${user.display_name}`, user.is_superuser, async () => {
            await api.updateUser(user.user_id, { is_superuser: !user.is_superuser });
            rerender();
          }),
        ]),
        el("div", { className: "toggle-row" }, [
          el("span", { className: "toggle-row__label" }, "Active"),
          buildUserSwitch(`Toggle active for ${user.display_name}`, user.active, async () => {
            await api.updateUser(user.user_id, { active: !user.active });
            rerender();
          }),
        ]),
      ]),
    ])
  );

  const usernameInput = el("input", { className: "field__input", type: "text", placeholder: "username" });
  const displayNameInput = el("input", { className: "field__input", type: "text", placeholder: "Display name" });

  return el("div", { className: "card" }, [
    el("h2", { className: "card__title" }, "Users"),
    el("div", { className: "screen__section" }, rows),
    el("div", { className: "field" }, [
      el("label", { className: "field__label" }, "New user"),
      usernameInput,
      displayNameInput,
    ]),
    el(
      "button",
      {
        className: "btn btn--outline btn--block",
        onClick: async () => {
          if (!usernameInput.value.trim() || !displayNameInput.value.trim()) return;
          await api.addUser({ username: usernameInput.value, display_name: displayNameInput.value });
          showToast("User added");
          rerender();
        },
      },
      "+ Add user"
    ),
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

  return el("div", { className: "card" }, [
    el("h2", { className: "card__title" }, "Settings"),
    el("div", { className: "field" }, [
      el("label", { className: "field__label" }, "Daily allowance"),
      allowanceInput,
    ]),
    el("div", { className: "field" }, [el("label", { className: "field__label" }, "Currency"), currencyInput]),
    el(
      "button",
      {
        className: "btn btn--primary btn--block",
        onClick: async () => {
          const daily_allowance = parseFloat(allowanceInput.value);
          if (Number.isNaN(daily_allowance)) return;
          await api.updateSettings({ daily_allowance, currency: currencyInput.value.trim() });
          showToast("Settings saved");
          rerender();
        },
      },
      "Save settings"
    ),
  ]);
}

export async function renderAdmin(container, rerender) {
  container.replaceChildren(el("p", { className: "empty" }, "Loading…"));

  const [pendingEdits, users, settings] = await Promise.all([
    api.getPendingEdits("pending"),
    api.getUsers(),
    api.getSettings(),
  ]);

  container.replaceChildren(
    el("div", { className: "screen__section" }, [
      sectionHeader("Waiting on your approval"),
      buildApprovals(pendingEdits, users, rerender),
    ]),
    buildUsersCard(users, rerender),
    buildSettingsCard(settings, rerender)
  );
}
