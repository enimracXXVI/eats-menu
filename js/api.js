// Data-access layer. Every read/write in the app goes through here — screens
// never touch the network directly, so this is the only file that needed to
// change when the Apps Script backend went live.
//
// Requests go over GET, with the payload in the query string, not POST with
// a JSON body. Apps Script Web Apps reliably send Access-Control-Allow-Origin
// on GET responses but not on POST — a cross-origin POST here still runs
// server-side, but the browser silently blocks reading the response, which
// looks exactly like a network failure from the app's side. See the comment
// in backend/Code.gs for the same note on the other end of this contract.

import { showToast } from "./dom.js";

const API_BASE_URL =
  "https://script.google.com/macros/s/AKfycbw5m2oKfpRpe_5G2G5Fd1S6_W59nO1RuEg3qfL-MF-3K_MLmfSjVwO1b5BrXXwtZn-T1g/exec";

async function call(action, payload = {}) {
  const url = `${API_BASE_URL}?action=${encodeURIComponent(action)}&payload=${encodeURIComponent(
    JSON.stringify(payload)
  )}`;

  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    showToast("Couldn't reach the sheet — check your connection.");
    throw err;
  }

  const data = await response.json();
  if (data && data.error) {
    showToast(data.error);
    throw new Error(data.error);
  }
  return data;
}

export const api = {
  findUserByUsername: (username) => call("findUserByUsername", { username }),

  getUsers: () => call("getUsers"),
  addUser: ({ username, display_name }) => call("addUser", { username, display_name }),
  updateUser: (userId, patch) => call("updateUser", { userId, patch }),
  deleteUser: (userId, requestedBy) => call("deleteUser", { userId, requestedBy }),

  getMenu: (opts = {}) => call("getMenu", opts),

  getPendingEdits: (status = "pending") => call("getPendingEdits", { status }),
  proposeMenuEdit: (edit, proposer) => call("proposeMenuEdit", { edit, proposer }),
  reviewEdit: (editId, { approve, reviewer }) => call("reviewEdit", { editId, approve, reviewer }),

  addFavorite: (userId, itemId) => call("addFavorite", { userId, itemId }),
  removeFavorite: (userId, itemId) => call("removeFavorite", { userId, itemId }),

  getSettings: () => call("getSettings"),
  updateSettings: (patch) => call("updateSettings", patch),

  getPurchases: (opts = {}) => call("getPurchases", opts),
  logPurchases: (user, cartItems) => call("logPurchases", { user, cartItems }),
  deletePurchase: (purchaseId, requestedBy) => call("deletePurchase", { purchaseId, requestedBy }),

  // One request per screen instead of two or three — Apps Script's per-call
  // overhead dominates load time far more than what each call actually does.
  getTodayBundle: (opts = {}) => call("getTodayBundle", opts),
  getMenuBundle: (opts = {}) => call("getMenuBundle", opts),
  getAdminBundle: (opts = {}) => call("getAdminBundle", opts),
};
