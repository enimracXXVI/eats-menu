import { el, onBusyClick, BARCODE_ICON_SVG } from "../dom.js";
import { api } from "../api.js";
import { login } from "../state.js";
import { openBarcodeScanner } from "../barcode-scanner.js";

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
  const newUserSlot = el("div", {});

  const submitBtn = el("button", { className: "btn btn--primary btn--block", type: "submit" }, "Log in");

  const scanBtn = el(
    "button",
    { type: "button", className: "field__icon-btn", "aria-label": "Scan barcode to log in", html: BARCODE_ICON_SVG },
    []
  );
  scanBtn.addEventListener("click", () => {
    newUserSlot.replaceChildren();
    openBarcodeScanner({ onDecode: handleBarcode });
  });

  // Not on the list — same fork the login screen already handles for a
  // typed username, just reached by a scan that found no match instead.
  function showNewUserForm(barcode) {
    const newUsername = el("input", { className: "field__input", type: "text", placeholder: "Username" });
    const newDisplayName = el("input", { className: "field__input", type: "text", placeholder: "Display name" });
    const createErrorSlot = el("div", {});
    const createBtn = el("button", { className: "btn btn--primary btn--block", type: "button" }, "Create account & log in");
    const cancelBtn = el("button", { className: "btn btn--outline btn--block", type: "button" }, "Cancel");

    onBusyClick(createBtn, "Creating…", async () => {
      const username = newUsername.value.trim();
      const display_name = newDisplayName.value.trim();
      if (!username || !display_name) return;

      let user;
      try {
        user = await api.addUser({ username, display_name, barcode });
      } catch {
        return;
      }

      login(user);
      onLoggedIn();
    });

    cancelBtn.addEventListener("click", () => newUserSlot.replaceChildren());

    newUserSlot.replaceChildren(
      el("div", { className: "screen__section" }, [
        el("p", { className: "field__hint" }, "No account found for that barcode. Create one to log in:"),
        el("div", { className: "field" }, [
          el("label", { className: "field__label" }, "New user"),
          newUsername,
          newDisplayName,
        ]),
        createErrorSlot,
        createBtn,
        cancelBtn,
      ])
    );
  }

  async function handleBarcode(barcode) {
    errorSlot.replaceChildren();

    let user;
    try {
      user = await api.findUserByBarcode(barcode);
    } catch {
      return;
    }

    if (!user) {
      showNewUserForm(barcode);
      return;
    }

    if (!user.active) {
      errorSlot.replaceChildren(el("p", { className: "field__error" }, "This account is deactivated."));
      return;
    }

    login(user);
    onLoggedIn();
  }

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
        el("div", { className: "field--icon-input" }, [input, scanBtn]),
        errorSlot,
      ]),
      submitBtn,
      newUserSlot,
    ]
  );

  return el("div", { className: "login-screen" }, [
    el("img", { className: "brand-logo brand-logo--login", src: "assets/icons/logo.svg", alt: "eats Tab" }),
    el("h1", { className: "login-screen__mark" }, "Log in"),
    form,
  ]);
}
