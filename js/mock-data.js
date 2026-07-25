// Seed data mirroring the Google Sheet tabs 1:1 — same columns, same ids,
// same rows as what's actually in the sheet right now. This is what api.js
// reads from until the Apps Script backend is wired up; the id scheme
// (U00001, M00001, E00001, P00001) matches the sheet exactly so switching
// api.js to real fetch calls shouldn't require touching anything above it.

export function seedData() {
  return {
    users: [
      { user_id: "U00001", username: "carmine", display_name: "Carmine", is_superuser: true, active: true },
      { user_id: "U00002", username: "marco", display_name: "Marco", is_superuser: false, active: true },
      { user_id: "U00003", username: "giulia", display_name: "Giulia", is_superuser: false, active: true },
      { user_id: "U00004", username: "gigi", display_name: "Gigi", is_superuser: false, active: false },
    ],

    menu: [
      { item_id: "M00001", name: "Fruit", price: 0.5, active: true },
      { item_id: "M00002", name: "Doughnut", price: 1.2, active: true },
      { item_id: "M00003", name: "Croissant", price: 1.4, active: true },
      { item_id: "M00004", name: "Ready Sandwich", price: 3.5, active: true },
      { item_id: "M00005", name: "Main", price: 5.5, active: true },
      { item_id: "M00006", name: "Rice", price: 1.5, active: true },
      { item_id: "M00007", name: "Veggies", price: 1.5, active: true },
      { item_id: "M00008", name: "Greek Yogurt", price: 2, active: true },
    ],

    pendingEdits: [
      {
        edit_id: "E00001",
        type: "price_change",
        item_id: "M00004",
        proposed_name: "Ready Sandwich",
        proposed_price: 3.8,
        user_id: "U00003",
        proposed_by: "giulia",
        proposed_at: "2026-07-24T09:12",
        status: "pending",
        reviewed_by: "",
        reviewed_at: "",
      },
      {
        edit_id: "E00002",
        type: "new_item",
        item_id: "",
        proposed_name: "Coca-Cola",
        proposed_price: 1.6,
        user_id: "U00002",
        proposed_by: "marco",
        proposed_at: "2026-07-23T14:05",
        status: "pending",
        reviewed_by: "",
        reviewed_at: "",
      },
      {
        edit_id: "E00003",
        type: "price_change",
        item_id: "M00005",
        proposed_name: "Main",
        proposed_price: 5,
        user_id: "U00002",
        proposed_by: "marco",
        proposed_at: "2026-07-10T08:30",
        status: "approved",
        reviewed_by: "carmine",
        reviewed_at: "2026-07-10T18:00",
      },
    ],

    purchases: [
      { purchase_id: "P00001", user_id: "U00002", username: "marco", item_id: "M00004", item_name: "Ready Sandwich", units: 1, unit_price: 3.5, price_paid: 3.5, date: "2026-07-24", timestamp: "2026-07-24T12:34" },
      { purchase_id: "P00002", user_id: "U00002", username: "marco", item_id: "M00001", item_name: "Fruit", units: 2, unit_price: 0.5, price_paid: 1, date: "2026-07-24", timestamp: "2026-07-24T12:34" },
      { purchase_id: "P00003", user_id: "U00002", username: "marco", item_id: "M00002", item_name: "Doughnut", units: 1, unit_price: 1.2, price_paid: 1.2, date: "2026-07-24", timestamp: "2026-07-24T13:15" },
      { purchase_id: "P00004", user_id: "U00003", username: "giulia", item_id: "M00005", item_name: "Main", units: 1, unit_price: 5.5, price_paid: 5.5, date: "2026-07-24", timestamp: "2026-07-24T12:50" },
      { purchase_id: "P00005", user_id: "U00003", username: "giulia", item_id: "M00002", item_name: "Doughnut", units: 1, unit_price: 1.2, price_paid: 1.2, date: "2026-07-24", timestamp: "2026-07-24T12:50" },
      { purchase_id: "P00006", user_id: "U00001", username: "carmine", item_id: "M00007", item_name: "Veggies", units: 1, unit_price: 1.5, price_paid: 1.5, date: "2026-07-23", timestamp: "2026-07-23T12:40" },
      { purchase_id: "P00007", user_id: "U00001", username: "carmine", item_id: "M00008", item_name: "Greek Yogurt", units: 2, unit_price: 2, price_paid: 4, date: "2026-07-23", timestamp: "2026-07-23T13:10" },
    ],

    settings: {
      daily_allowance: 6,
      currency: "EUR",
    },
  };
}
