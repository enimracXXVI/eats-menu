// Data-access layer. Every read/write in the app goes through here — screens
// never touch the network directly, so this is the only file that needed to
// change when the Apps Script backend went live.
//
// No explicit Content-Type is set on the POST body on purpose: Apps Script
// doesn't handle a CORS preflight (OPTIONS) request, so the body is sent as
// plain text (the browser's default for a string body) to keep this a
// CORS-simple request. backend/Code.gs parses it back out of
// e.postData.contents.

import { showToast } from "./dom.js";

const API_BASE_URL =
  "https://script.google.com/macros/s/AKfycbw5m2oKfpRpe_5G2G5Fd1S6_W59nO1RuEg3qfL-MF-3K_MLmfSjVwO1b5BrXXwtZn-T1g/exec";

async function call(action, payload = {}) {
  let response;
  try {
    response = await fetch(API_BASE_URL, {
      method: "POST",
      body: JSON.stringify({ action, payload }),
    });
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

  getMenu: (opts = {}) => call("getMenu", opts),

  getPendingEdits: (status = "pending") => call("getPendingEdits", { status }),
  proposeMenuEdit: (edit, proposer) => call("proposeMenuEdit", { edit, proposer }),
  reviewEdit: (editId, { approve, reviewer }) => call("reviewEdit", { editId, approve, reviewer }),

  getSettings: () => call("getSettings"),
  updateSettings: (patch) => call("updateSettings", patch),

  getPurchases: (opts = {}) => call("getPurchases", opts),
  logPurchases: (user, cartItems) => call("logPurchases", { user, cartItems }),
  deletePurchase: (purchaseId, requestedBy) => call("deletePurchase", { purchaseId, requestedBy }),
};
