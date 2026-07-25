// Data-access layer. Every read/write in the app goes through here.
//
// Today this is backed by localStorage + the seed data in mock-data.js, so
// the whole app is usable before the Google Sheet backend exists. When the
// Apps Script Web App is ready, only the bodies of these functions change
// (to `fetch()` calls) — screens never talk to storage directly, so nothing
// above this file should need to change.

import { seedData } from "./mock-data.js";

const STORAGE_KEY = "eats-menu-db-v1";
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

function nextId(rows, key) {
  return rows.reduce((max, row) => Math.max(max, row[key]), 0) + 1;
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
      user_id: nextId(db.users, "user_id"),
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

  async logPurchases(userId, cartItems) {
    const date = todayISODate();
    const timestamp = new Date().toISOString().slice(0, 16);
    const created = cartItems.map((item) => {
      const purchase = {
        purchase_id: nextId(db.purchases, "purchase_id") + db.purchases.length,
        user_id: userId,
        item_id: item.item_id,
        item_name: item.name,
        price_paid: item.price,
        date,
        timestamp,
      };
      db.purchases.push(purchase);
      return purchase;
    });
    save(db);
    return delay(created);
  },

  async proposeMenuEdit(edit) {
    const row = {
      edit_id: nextId(db.pendingEdits, "edit_id"),
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      proposed_at: new Date().toISOString().slice(0, 16),
      ...edit,
    };
    db.pendingEdits.push(row);
    save(db);
    return delay({ ...row });
  },

  async reviewEdit(editId, { approve, reviewedBy }) {
    const edit = db.pendingEdits.find((e) => e.edit_id === editId);
    if (!edit) return delay(null);

    edit.status = approve ? "approved" : "rejected";
    edit.reviewed_by = reviewedBy;
    edit.reviewed_at = new Date().toISOString().slice(0, 16);

    if (approve) {
      if (edit.type === "new_item") {
        db.menu.push({
          item_id: nextId(db.menu, "item_id"),
          name: edit.proposed_name,
          category: edit.proposed_category || "Other",
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

    save(db);
    return delay({ ...edit });
  },
};
