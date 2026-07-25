import { el } from "../dom.js";
import { api } from "../api.js";
import { login } from "../state.js";

export function renderLogin(onLoggedIn) {
  let errorNode = null;

  const input = el("input", {
    className: "field__input",
    type: "text",
    name: "username",
    placeholder: "e.g. marco",
    autocomplete: "username",
    autocapitalize: "off",
    autofocus: true,
  });

  const errorSlot = el("div", {});

  const form = el(
    "form",
    {
      className: "login-screen__form",
      onSubmit: async (event) => {
        event.preventDefault();
        const username = input.value.trim();
        if (!username) return;

        submitBtn.setAttribute("disabled", "true");
        submitBtn.textContent = "Checking…";

        const user = await api.findUserByUsername(username);

        if (!user) {
          errorNode = el(
            "p",
            { className: "field__error" },
            "We don't recognize that name — check with your superuser."
          );
          errorSlot.replaceChildren(errorNode);
          submitBtn.removeAttribute("disabled");
          submitBtn.textContent = "Continue";
          return;
        }

        login(user);
        onLoggedIn();
      },
    },
    [
      el("div", { className: "field" }, [
        el("label", { className: "field__label", for: "username" }, "Your name"),
        input,
        errorSlot,
      ]),
    ]
  );

  const submitBtn = el("button", { className: "btn btn--primary btn--block", type: "submit" }, "Continue");
  form.append(submitBtn);
  input.id = "username";

  return el("div", { className: "login-screen" }, [
    el("div", { className: "screen__section" }, [
      el("span", { className: "eyebrow" }, "Canteen Tally"),
      el("h1", { className: "login-screen__mark" }, "What's your name?"),
      el("p", {}, "No password — just tell us who you are. Ask your superuser to add you if you're not on the list yet."),
    ]),
    form,
  ]);
}
