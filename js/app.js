import { el, mount } from "./dom.js";
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

function buildHeader() {
  return el("header", { className: "app-header" }, [
    el("div", { className: "app-header__id" }, [
      el("span", { className: "app-header__brand" }, "Canteen Tally"),
    ]),
    el("div", { className: "app-header__actions" }, [
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

  const screenEl = el("div", { className: "screen" }, []);
  const shell = el("div", { className: "app-shell" }, [buildHeader(), screenEl, buildNav(tab.path)]);
  mount(appRoot, shell);

  await tab.render(screenEl, () => render());
}

window.addEventListener("hashchange", render);

render();
