import { el } from "../dom.js";
import { api } from "../api.js";
import { login } from "../state.js";

export function renderLogin(onLoggedIn) {
  const input = el("input", {
    className: "field__input",
    type: "text",
    name: "username",
    id: "username",
    autocomplete: "username",
    autocapitalize: "off",
    autofocus: true,
  });

  const errorSlot = el("div", {});

  const submitBtn = el("button", { className: "btn btn--primary btn--block", type: "submit" }, "Log in");

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

        let user;
        try {
          user = await api.findUserByUsername(username);
        } catch {
          submitBtn.removeAttribute("disabled");
          submitBtn.textContent = "Log in";
          return;
        }

        if (!user) {
          errorSlot.replaceChildren(el("p", { className: "field__error" }, "User not authorised."));
          submitBtn.removeAttribute("disabled");
          submitBtn.textContent = "Log in";
          return;
        }

        if (!user.active) {
          errorSlot.replaceChildren(
            el("p", { className: "field__error" }, "This account is deactivated.")
          );
          submitBtn.removeAttribute("disabled");
          submitBtn.textContent = "Log in";
          return;
        }

        login(user);
        onLoggedIn();
      },
    },
    [
      el("div", { className: "field" }, [
        el("label", { className: "field__label", for: "username" }, "Username"),
        input,
        errorSlot,
      ]),
      submitBtn,
    ]
  );

  return el("div", { className: "login-screen" }, [
    el("img", { className: "brand-logo brand-logo--login", src: "assets/icons/logo.svg", alt: "eats Tab" }),
    el("h1", { className: "login-screen__mark" }, "Log in"),
    form,
  ]);
}
