// Data-access layer. Every read/write in the app goes through here.
//
// Today this is backed by localStorage + the seed data in mock-data.js, so
// the whole app is usable before the Apps Script backend exists. When that
// backend is deployed, only the bodies of these functions change (to
// `fetch()` calls) — screens never talk to storage directly, so nothing
// above this file should need to change.

import { seedData } from "./mock-data.js";

const STORAGE_KEY = "eats-menu-db-v2";
const LATENCY_MS = 120; // small delay so it behaves like a real network call

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // fall through to reseed on corrupt storage
    }
  }
  const fresh = seedData();
  save(fresh);
  return fresh;
}

function save(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function delay(value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

// Ids in the sheet are prefixed and zero-padded (U00001, M00001, E00001,
// P00001) rather than plain numbers — this mirrors that scheme.
function nextId(rows, key, prefix) {
  const max = rows.reduce((m, row) => {
    const n = parseInt(String(row[key]).slice(prefix.length), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

let db = load();

export const api = {
  async findUserByUsername(username) {
    const user = db.users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.active
    );
    return delay(user ? { ...user } : null);
  },

  async getUsers() {
    return delay(db.users.map((u) => ({ ...u })));
  },

  async addUser({ username, display_name }) {
    const user = {
      user_id: nextId(db.users, "user_id", "U"),
      username: username.trim().toLowerCase(),
      display_name: display_name.trim(),
      is_superuser: false,
      active: true,
    };
    db.users.push(user);
    save(db);
    return delay({ ...user });
  },

  async updateUser(userId, patch) {
    const user = db.users.find((u) => u.user_id === userId);
    if (!user) return delay(null);
    Object.assign(user, patch);
    save(db);
    return delay({ ...user });
  },

  async getMenu({ includeInactive = false } = {}) {
    const rows = db.menu.filter((m) => includeInactive || m.active);
    return delay(rows.map((m) => ({ ...m })));
  },

  async getPendingEdits(status = "pending") {
    const rows = db.pendingEdits.filter((e) => e.status === status);
    return delay(rows.map((e) => ({ ...e })));
  },

  async getSettings() {
    return delay({ ...db.settings });
  },

  async updateSettings(patch) {
    Object.assign(db.settings, patch);
    save(db);
    return delay({ ...db.settings });
  },

  async getPurchases({ userId, date } = {}) {
    const rows = db.purchases.filter(
      (p) => (!userId || p.user_id === userId) && (!date || p.date === date)
    );
    return delay(rows.map((p) => ({ ...p })));
  },

  async logPurchases(user, cartItems) {
    const date = todayISODate();
    const timestamp = new Date().toISOString().slice(0, 16);
    const created = cartItems.map((item) => {
      const purchase = {
        purchase_id: nextId(db.purchases, "purchase_id", "P"),
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
      db.purchases.push(purchase);
      return purchase;
    });
    save(db);
    return delay(created);
  },

  async deletePurchase(purchaseId) {
    db.purchases = db.purchases.filter((p) => p.purchase_id !== purchaseId);
    save(db);
    return delay(true);
  },

  // Regular users' edits go to the queue. A superuser's own edit is applied
  // immediately — being superuser would be pointless if they still had to
  // wait on themselves for approval.
  async proposeMenuEdit(edit, proposer) {
    const row = {
      edit_id: nextId(db.pendingEdits, "edit_id", "E"),
      status: "pending",
      reviewed_by: "",
      reviewed_at: "",
      proposed_at: new Date().toISOString().slice(0, 16),
      user_id: proposer.user_id,
      proposed_by: proposer.username,
      ...edit,
    };
    db.pendingEdits.push(row);

    if (proposer.is_superuser) {
      applyEdit(row);
      row.status = "approved";
      row.reviewed_by = proposer.username;
      row.reviewed_at = row.proposed_at;
    }

    save(db);
    return delay({ ...row });
  },

  async reviewEdit(editId, { approve, reviewer }) {
    const edit = db.pendingEdits.find((e) => e.edit_id === editId);
    if (!edit) return delay(null);

    edit.status = approve ? "approved" : "rejected";
    edit.reviewed_by = reviewer.username;
    edit.reviewed_at = new Date().toISOString().slice(0, 16);

    if (approve) applyEdit(edit);

    save(db);
    return delay({ ...edit });
  },
};

function applyEdit(edit) {
  if (edit.type === "new_item") {
    db.menu.push({
      item_id: nextId(db.menu, "item_id", "M"),
      name: edit.proposed_name,
      price: edit.proposed_price,
      active: true,
    });
  } else if (edit.type === "price_change") {
    const item = db.menu.find((m) => m.item_id === edit.item_id);
    if (item) item.price = edit.proposed_price;
  } else if (edit.type === "remove_item") {
    const item = db.menu.find((m) => m.item_id === edit.item_id);
    if (item) item.active = false;
  }
}
