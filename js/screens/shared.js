// The page a shared read-only link opens — no login, no nav, just one
// user's one day of purchases. Reached via app.js's own boot check for a
// ?shared= token, before the normal authenticated app ever gets involved.
import { el, mount } from "../dom.js";
import { api } from "../api.js";
import { buildShareCardNode } from "../share-card.js";

export async function renderShared(root, token) {
  mount(root, el("div", { className: "shared-page" }, [el("p", { className: "empty" }, "Loading…")]));

  let data;
  try {
    data = await api.getSharedPurchases(token);
  } catch {
    data = null;
  }

  if (!data) {
    mount(
      root,
      el("div", { className: "shared-page" }, [
        el("p", { className: "empty" }, "This link isn't valid."),
        el("a", { className: "btn btn--outline", href: "index.html" }, "Open eats Tab"),
      ])
    );
    return;
  }

  mount(
    root,
    el("div", { className: "shared-page" }, [
      buildShareCardNode(data),
      el("a", { className: "btn btn--outline btn--block", href: "index.html" }, "Open eats Tab"),
    ])
  );
}
