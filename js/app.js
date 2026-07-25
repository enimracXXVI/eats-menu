import { el, mount, fmtMoney, budgetState } from "./dom.js";
import { api } from "./api.js";
import { state, logout } from "./state.js";
import { renderLogin } from "./screens/login.js";
import { renderToday } from "./screens/today.js";
import { renderMenu } from "./screens/menu.js";
import { renderAdmin } from "./screens/admin.js";
import { mountCartDock, clearCartChangeListeners } from "./cart.js";

const TABS = [
  { path: "today", label: "Today", mark: "T", render: renderToday, fetchBundle: api.getTodayBundle, showCartDock: true },
  { path: "menu", label: "Menu", mark: "M", render: renderMenu, fetchBundle: api.getMenuBundle, showCartDock: true },
  { path: "admin", label: "Admin", mark: "A", render: renderAdmin, fetchBundle: api.getAdminBundle, superuserOnly: true },
];

const appRoot = document.getElementById("app");

function currentPath() {
  return (location.hash.replace(/^#\/?/, "") || "today").split("?")[0];
}

function navigate(path) {
  location.hash = `#/${path}`;
}

function buildNav(activePath) {
  const items = TABS.filter((tab) => !tab.superuserOnly || state.user?.is_superuser).map((tab) =>
    el(
      "button",
      {
        className: `nav__item${tab.path === activePath ? " nav__item--active" : ""}`,
        onClick: () => navigate(tab.path),
      },
      [el("span", { className: "nav__icon" }, tab.mark), el("span", {}, tab.label)]
    )
  );
  return el("nav", { className: "nav" }, items);
}

// The remaining-budget chip starts as a placeholder and fills in once the
// bundle resolves (see render()) — the header/nav/shell shouldn't wait on
// that network round trip just to appear.
function buildHeader() {
  const remainingChip = el("span", { className: "chip" }, "…");

  const header = el("header", { className: "app-header" }, [
    el("div", { className: "app-header__id" }, [
      el("img", { className: "brand-logo brand-logo--header", src: "assets/icons/logo.svg", alt: "Canteen Tally" }),
    ]),
    el("div", { className: "app-header__actions" }, [
      remainingChip,
      el("span", { className: "chip" }, state.user.display_name),
      el(
        "button",
        {
          className: "btn btn--icon",
          "aria-label": "Log out",
          onClick: () => {
            logout();
            navigate("");
            render();
          },
        },
        "✕"
      ),
    ]),
  ]);

  return { header, remainingChip };
}

function updateRemainingChip(chipEl, bundle) {
  const spent = bundle.purchases.reduce((sum, p) => sum + p.price_paid, 0);
  const { remaining, state: budget } = budgetState(spent, bundle.settings.daily_allowance);
  const modifier = budget === "over" ? " chip--critical" : budget === "warning" ? " chip--warning" : "";
  chipEl.className = `chip${modifier}`;
  chipEl.textContent =
    remaining >= 0
      ? `${fmtMoney(remaining, bundle.settings.currency)} left`
      : `${fmtMoney(-remaining, bundle.settings.currency)} over`;
}

async function render() {
  const path = currentPath();

  if (!state.user) {
    mount(appRoot, el("div", { className: "app-shell" }, [renderLogin(() => render())]));
    return;
  }

  const tab = TABS.find((t) => t.path === path) || TABS[0];
  if (tab.superuserOnly && !state.user.is_superuser) {
    navigate("today");
    return;
  }

  clearCartChangeListeners();

  const { header, remainingChip } = buildHeader();
  const screenEl = el(
    "div",
    { className: `screen${tab.showCartDock ? " screen--with-dock" : ""}` },
    [el("p", { className: "empty" }, "Loading…")]
  );
  const cartDockEl = tab.showCartDock ? el("div", { className: "cart-dock" }, []) : null;

  const shell = el(
    "div",
    { className: "app-shell" },
    [header, screenEl, cartDockEl, buildNav(tab.path)].filter(Boolean)
  );
  mount(appRoot, shell);

  try {
    const bundle = await tab.fetchBundle({
      userId: state.user.user_id,
      date: new Date().toISOString().slice(0, 10),
    });

    updateRemainingChip(remainingChip, bundle);
    if (cartDockEl) mountCartDock(cartDockEl, bundle.settings.currency, () => render());

    await tab.render(screenEl, () => render(), bundle);
  } catch {
    // api.js already toasted the specific error — just don't leave the
    // screen stuck on "Loading…" forever.
    screenEl.replaceChildren(el("p", { className: "empty" }, "Couldn't load. Try again."));
  }
}

window.addEventListener("hashchange", render);

render();
