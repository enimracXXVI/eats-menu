import { el, mount, fmtMoney, budgetState } from "./dom.js";
import { api } from "./api.js";
import { state, logout } from "./state.js";
import { renderLogin } from "./screens/login.js";
import { renderToday } from "./screens/today.js";
import { renderMenu } from "./screens/menu.js";
import { renderAdmin } from "./screens/admin.js";

const TABS = [
  { path: "today", label: "Today", mark: "T", render: renderToday },
  { path: "menu", label: "Menu", mark: "M", render: renderMenu },
  { path: "admin", label: "Admin", mark: "A", render: renderAdmin, superuserOnly: true },
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
    remaining >= 0 ? `${fmtMoney(remaining, bundle.settings.currency)} left` : `${fmtMoney(-remaining, bundle.settings.currency)} over`;
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

  const { header, remainingChip } = buildHeader();
  const screenEl = el("div", { className: "screen" }, []);
  const shell = el("div", { className: "app-shell" }, [header, screenEl, buildNav(tab.path)]);
  mount(appRoot, shell);

  const todayBundlePromise = api.getTodayBundle({
    userId: state.user.user_id,
    date: new Date().toISOString().slice(0, 10),
  });
  todayBundlePromise.then((bundle) => updateRemainingChip(remainingChip, bundle)).catch(() => {});

  if (tab.path === "today") {
    await tab.render(screenEl, () => render(), await todayBundlePromise);
  } else {
    await tab.render(screenEl, () => render());
  }
}

window.addEventListener("hashchange", render);

render();
