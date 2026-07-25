/**
 * Canteen Tally backend — Google Apps Script Web App bound to the sheet.
 *
 * This is the ONLY thing that touches the spreadsheet. The frontend (GitHub
 * Pages) calls it as a JSON API — see js/api.js for the client side of this
 * contract, which mirrors every function name here 1:1.
 *
 * Requests go over GET, not POST: Apps Script Web Apps reliably send
 * Access-Control-Allow-Origin on GET responses, but not on POST — calling
 * this over POST from a different origin (any static host, incl. GitHub
 * Pages) gets silently CORS-blocked by the browser even though the request
 * itself succeeds server-side. GET with the payload in the query string is
 * the standard workaround; our payloads are small (ids, names, prices), so
 * URL length is a non-issue. doPost is kept for direct/local calls but the
 * shipped frontend never uses it.
 *
 * Deploy: Extensions > Apps Script from the sheet, paste this in as Code.gs,
 * then Deploy > New deployment > Web app > Execute as: Me > Who has access:
 * Anyone. See the README for the full walkthrough.
 */

const SHEET = {
  USERS: "users",
  MENU: "menu",
  PENDING_EDITS: "pendingEdits",
  PURCHASES: "purchases",
  SETTINGS: "settings",
};

function doGet(e) {
  const action = e.parameter.action;
  const payload = e.parameter.payload ? JSON.parse(e.parameter.payload) : {};
  return handleAction(action, payload);
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  return handleAction(body.action, body.payload || {});
}

function handleAction(action, payload) {
  const handlers = {
    findUserByUsername: () => findUserByUsername(payload.username),
    getUsers: () => getUsers(),
    addUser: () => addUser(payload),
    updateUser: () => updateUser(payload.userId, payload.patch),
    getMenu: () => getMenu(payload),
    getPendingEdits: () => getPendingEdits(payload.status || "pending"),
    getSettings: () => getSettings(),
    updateSettings: () => updateSettings(payload),
    getPurchases: () => getPurchases(payload),
    logPurchases: () => logPurchases(payload.user, payload.cartItems),
    deletePurchase: () => deletePurchase(payload.purchaseId, payload.requestedBy),
    proposeMenuEdit: () => proposeMenuEdit(payload.edit, payload.proposer),
    reviewEdit: () => reviewEdit(payload.editId, payload.approve, payload.reviewer),
  };

  const handler = handlers[action];
  if (!handler) return jsonOutput({ error: "Unknown action: " + action });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return jsonOutput(handler());
  } catch (err) {
    return jsonOutput({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonOutput(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ---------------------------------------------------------------------------
// Generic table helpers — every tab except `settings` is a header row plus
// data rows, keyed by its own id column.
// ---------------------------------------------------------------------------

function getSheetByName(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error("Missing sheet tab: " + name);
  return sheet;
}

function readTable(name) {
  const sheet = getSheetByName(name);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1).map((row, index) => {
    const obj = { _row: index + 2 }; // 1-based, +1 for header row
    headers.forEach((header, col) => (obj[header] = row[col]));
    return obj;
  });
}

function appendRow(name, obj) {
  const sheet = getSheetByName(name);
  const headers = sheet.getDataRange().getValues()[0];
  sheet.appendRow(headers.map((h) => (obj[h] !== undefined ? obj[h] : "")));
}

function updateRow(name, rowIndex, patch) {
  const sheet = getSheetByName(name);
  const headers = sheet.getDataRange().getValues()[0];
  headers.forEach((header, col) => {
    if (patch[header] !== undefined) sheet.getRange(rowIndex, col + 1).setValue(patch[header]);
  });
}

function deleteRow(name, rowIndex) {
  getSheetByName(name).deleteRow(rowIndex);
}

function nextId(rows, key, prefix) {
  const max = rows.reduce((m, row) => {
    const n = parseInt(String(row[key]).slice(prefix.length), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return prefix + String(max + 1).padStart(5, "0");
}

function isoDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function isoTimestamp(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm");
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function findUserByUsername(username) {
  const user = readTable(SHEET.USERS).find(
    (u) => String(u.username).toLowerCase() === String(username).trim().toLowerCase() && u.active
  );
  return user || null;
}

function getUsers() {
  return readTable(SHEET.USERS);
}

function addUser({ username, display_name }) {
  const users = readTable(SHEET.USERS);
  const row = {
    user_id: nextId(users, "user_id", "U"),
    username: username.trim().toLowerCase(),
    display_name: display_name.trim(),
    is_superuser: false,
    active: true,
  };
  appendRow(SHEET.USERS, row);
  return row;
}

function updateUser(userId, patch) {
  const users = readTable(SHEET.USERS);
  const user = users.find((u) => u.user_id === userId);
  if (!user) return null;
  updateRow(SHEET.USERS, user._row, patch);
  return Object.assign({}, user, patch);
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function getMenu({ includeInactive }) {
  const rows = readTable(SHEET.MENU);
  return includeInactive ? rows : rows.filter((m) => m.active);
}

function applyEdit(edit) {
  if (edit.type === "new_item") {
    const menu = readTable(SHEET.MENU);
    appendRow(SHEET.MENU, {
      item_id: nextId(menu, "item_id", "M"),
      name: edit.proposed_name,
      price: edit.proposed_price,
      active: true,
    });
  } else if (edit.type === "price_change") {
    const item = readTable(SHEET.MENU).find((m) => m.item_id === edit.item_id);
    if (item) updateRow(SHEET.MENU, item._row, { price: edit.proposed_price });
  } else if (edit.type === "remove_item") {
    const item = readTable(SHEET.MENU).find((m) => m.item_id === edit.item_id);
    if (item) updateRow(SHEET.MENU, item._row, { active: false });
  }
}

// ---------------------------------------------------------------------------
// Menu edits — regular users queue for approval; a superuser's own edit
// applies immediately (see proposeMenuEdit). reviewEdit is the only other
// way an edit gets applied, and it re-checks the reviewer is a superuser
// server-side rather than trusting the client.
// ---------------------------------------------------------------------------

function getPendingEdits(status) {
  return readTable(SHEET.PENDING_EDITS).filter((e) => e.status === status);
}

function proposeMenuEdit(edit, proposer) {
  const edits = readTable(SHEET.PENDING_EDITS);
  const now = isoTimestamp(new Date());
  const row = Object.assign(
    {
      edit_id: nextId(edits, "edit_id", "E"),
      status: "pending",
      reviewed_by: "",
      reviewed_at: "",
      proposed_at: now,
      user_id: proposer.user_id,
      proposed_by: proposer.username,
    },
    edit
  );

  if (proposer.is_superuser) {
    applyEdit(row);
    row.status = "approved";
    row.reviewed_by = proposer.username;
    row.reviewed_at = now;
  }

  appendRow(SHEET.PENDING_EDITS, row);
  return row;
}

function reviewEdit(editId, approve, reviewer) {
  if (!reviewer || !reviewer.is_superuser) throw new Error("Only a superuser can review edits.");

  const edit = readTable(SHEET.PENDING_EDITS).find((e) => e.edit_id === editId);
  if (!edit) return null;

  const patch = {
    status: approve ? "approved" : "rejected",
    reviewed_by: reviewer.username,
    reviewed_at: isoTimestamp(new Date()),
  };
  updateRow(SHEET.PENDING_EDITS, edit._row, patch);
  if (approve) applyEdit(edit);

  return Object.assign({}, edit, patch);
}

// ---------------------------------------------------------------------------
// Settings — key/value tab, not a row-per-record table like the others.
// ---------------------------------------------------------------------------

function getSettings() {
  const sheet = getSheetByName(SHEET.SETTINGS);
  const values = sheet.getDataRange().getValues();
  const settings = {};
  values.slice(1).forEach(([key, value]) => (settings[key] = value));
  return settings;
}

function updateSettings(patch) {
  const sheet = getSheetByName(SHEET.SETTINGS);
  const values = sheet.getDataRange().getValues();
  Object.keys(patch).forEach((key) => {
    const rowIndex = values.findIndex((row) => row[0] === key);
    if (rowIndex >= 0) sheet.getRange(rowIndex + 1, 2).setValue(patch[key]);
  });
  return getSettings();
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

function getPurchases({ userId, date }) {
  return readTable(SHEET.PURCHASES).filter(
    (p) => (!userId || p.user_id === userId) && (!date || p.date === date)
  );
}

function logPurchases(user, cartItems) {
  const purchases = readTable(SHEET.PURCHASES);
  const now = new Date();
  const date = isoDate(now);
  const timestamp = isoTimestamp(now);

  let lastId = nextId(purchases, "purchase_id", "P");
  const created = cartItems.map((item) => {
    const row = {
      purchase_id: lastId,
      user_id: user.user_id,
      username: user.username,
      item_id: item.item_id,
      item_name: item.name,
      units: item.units,
      unit_price: item.price,
      price_paid: Math.round(item.units * item.price * 100) / 100,
      date,
      timestamp,
    };
    appendRow(SHEET.PURCHASES, row);
    lastId = "P" + String(parseInt(lastId.slice(1), 10) + 1).padStart(5, "0");
    return row;
  });
  return created;
}

// Only the purchase's own owner can delete it, and only for today — this is
// re-checked here rather than trusted from the client.
function deletePurchase(purchaseId, requestedBy) {
  const purchase = readTable(SHEET.PURCHASES).find((p) => p.purchase_id === purchaseId);
  if (!purchase) return false;
  if (purchase.user_id !== requestedBy) throw new Error("You can only delete your own purchases.");
  if (purchase.date !== isoDate(new Date())) throw new Error("You can only delete a purchase logged today.");
  deleteRow(SHEET.PURCHASES, purchase._row);
  return true;
}
