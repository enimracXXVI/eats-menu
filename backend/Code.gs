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
    // Bundles — one round trip per screen instead of two or three. Apps
    // Script's per-request overhead is the dominant cost of this backend,
    // so cutting request COUNT matters far more than trimming what each one
    // does.
    getTodayBundle: () => getTodayBundle(payload),
    getMenuBundle: () => getMenuBundle(),
    getAdminBundle: () => getAdminBundle(),
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

// Cheap header read — getRange(1, ...) instead of getDataRange(), so this
// doesn't cost more as a table grows. appendRow/updateRow each need this on
// every call, so the difference matters.
function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

// Sheets silently coerces a date-shaped string (our own isoDate/isoTimestamp
// output) into a real Date cell value depending on the column's format,
// regardless of how it was written. getValues() then hands back a Date
// object instead of the string we wrote — which broke the "today" purchase
// filter and same-day delete check, since a Date object is never === a
// string. Reformatting on read (rather than fighting Sheets' autodetection
// on write) keeps every date/timestamp field a predictable string no matter
// how the cell happens to be formatted.
function normalizeCell(header, value) {
  if (!(value instanceof Date)) return value;
  if (header === "date") return isoDate(value);
  if (header === "timestamp" || header === "proposed_at" || header === "reviewed_at") {
    return isoTimestamp(value);
  }
  return value;
}

function readTable(name) {
  const sheet = getSheetByName(name);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1).map((row, index) => {
    const obj = { _row: index + 2 }; // 1-based, +1 for header row
    headers.forEach((header, col) => (obj[header] = normalizeCell(header, row[col])));
    return obj;
  });
}

function appendRow(name, obj) {
  const sheet = getSheetByName(name);
  const headers = getHeaders(sheet);
  sheet.appendRow(headers.map((h) => (obj[h] !== undefined ? obj[h] : "")));
}

// One read + one write for the whole row, regardless of how many fields in
// `patch` actually changed — cheaper than a setValue() per field.
function updateRow(name, rowIndex, patch) {
  const sheet = getSheetByName(name);
  const headers = getHeaders(sheet);
  const range = sheet.getRange(rowIndex, 1, 1, headers.length);
  const current = range.getValues()[0];
  headers.forEach((header, col) => {
    if (patch[header] !== undefined) current[col] = patch[header];
  });
  range.setValues([current]);
}

function deleteRow(name, rowIndex) {
  getSheetByName(name).deleteRow(rowIndex);
}

// Ids are plain numbers in the sheet — U00001/M00004/etc. is just a custom
// number FORMAT on those cells, not the stored value, so ids generated here
// must be numbers too, not zero-padded prefixed strings.
function nextId(rows, key) {
  return rows.reduce((max, row) => Math.max(max, Number(row[key]) || 0), 0) + 1;
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

// Returns the user regardless of active/inactive, so the caller can tell
// "not on the list" apart from "on the list but deactivated" — matching
// them into the same null used to mean losing that distinction entirely.
function findUserByUsername(username) {
  const user = readTable(SHEET.USERS).find(
    (u) => String(u.username).toLowerCase() === String(username).trim().toLowerCase()
  );
  return user || null;
}

function getUsers() {
  return readTable(SHEET.USERS);
}

function addUser({ username, display_name }) {
  const users = readTable(SHEET.USERS);
  const row = {
    user_id: nextId(users, "user_id"),
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
      item_id: nextId(menu, "item_id"),
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
      edit_id: nextId(edits, "edit_id"),
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

// Cart items are written as one batched setValues() call instead of one
// appendRow() per item — a 3-item cart was previously 3 separate round
// trips into the Sheets service just for the writes, on top of everything
// else a request already costs.
function logPurchases(user, cartItems) {
  const sheet = getSheetByName(SHEET.PURCHASES);
  const headers = getHeaders(sheet);
  const purchases = readTable(SHEET.PURCHASES);
  const now = new Date();
  const date = isoDate(now);
  const timestamp = isoTimestamp(now);

  let nextPurchaseId = nextId(purchases, "purchase_id");
  const created = cartItems.map((item) => {
    const row = {
      purchase_id: nextPurchaseId,
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
    nextPurchaseId += 1;
    return row;
  });

  const startRow = sheet.getLastRow() + 1;
  const values = created.map((row) => headers.map((h) => (row[h] !== undefined ? row[h] : "")));
  sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);

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

// ---------------------------------------------------------------------------
// Bundles — combine what each screen needs into a single request/response.
// ---------------------------------------------------------------------------

function getTodayBundle({ userId, date }) {
  return { settings: getSettings(), purchases: getPurchases({ userId, date }) };
}

function getMenuBundle() {
  return { menu: getMenu({}), pendingEdits: getPendingEdits("pending"), settings: getSettings() };
}

function getAdminBundle() {
  return { pendingEdits: getPendingEdits("pending"), users: getUsers(), settings: getSettings() };
}
