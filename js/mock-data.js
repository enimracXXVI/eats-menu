// Seed data mirroring the Google Sheet tabs 1:1 (same column names, same
// numeric ids). This is what api.js reads from until the Apps Script
// backend exists — swapping api.js to real fetch calls should need no
// changes here, since the shapes already match the sheet.

export function seedData() {
  return {
    users: [
      { user_id: 1, username: "carmine", display_name: "Carmine", is_superuser: true, active: true },
      { user_id: 2, username: "marco", display_name: "Marco", is_superuser: false, active: true },
      { user_id: 3, username: "giulia", display_name: "Giulia", is_superuser: false, active: true },
    ],

    menu: [
      { item_id: 1, name: "Pasta with tomato sauce", category: "Main course", price: 3.2, active: true },
      { item_id: 2, name: "Prosciutto and mozzarella sandwich", category: "Sandwich", price: 3.5, active: true },
      { item_id: 3, name: "Mixed salad", category: "Side", price: 2.8, active: true },
      { item_id: 4, name: "Still water 0.5L", category: "Drink", price: 0.5, active: true },
      { item_id: 5, name: "Coffee", category: "Drink", price: 1.0, active: true },
    ],

    pendingEdits: [
      {
        edit_id: 1,
        type: "price_change",
        item_id: 2,
        proposed_name: "Prosciutto and mozzarella sandwich",
        proposed_price: 3.8,
        proposed_by: 3,
        proposed_at: "2026-07-24T09:12",
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
      },
      {
        edit_id: 2,
        type: "new_item",
        item_id: null,
        proposed_name: "Seasonal fruit",
        proposed_price: 1.2,
        proposed_category: "Dessert",
        proposed_by: 2,
        proposed_at: "2026-07-23T14:05",
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
      },
      {
        edit_id: 3,
        type: "price_change",
        item_id: 4,
        proposed_name: "Still water 0.5L",
        proposed_price: 0.6,
        proposed_by: 2,
        proposed_at: "2026-07-10T08:30",
        status: "approved",
        reviewed_by: 1,
        reviewed_at: "2026-07-10T18:00",
      },
    ],

    purchases: [
      { purchase_id: 1, user_id: 2, item_id: 1, item_name: "Pasta with tomato sauce", price_paid: 3.2, date: "2026-07-24", timestamp: "2026-07-24T12:34" },
      { purchase_id: 2, user_id: 2, item_id: 4, item_name: "Still water 0.5L", price_paid: 0.5, date: "2026-07-24", timestamp: "2026-07-24T12:34" },
      { purchase_id: 3, user_id: 2, item_id: 5, item_name: "Coffee", price_paid: 1.0, date: "2026-07-24", timestamp: "2026-07-24T13:15" },
      { purchase_id: 4, user_id: 3, item_id: 2, item_name: "Prosciutto and mozzarella sandwich", price_paid: 3.5, date: "2026-07-24", timestamp: "2026-07-24T12:50" },
      { purchase_id: 5, user_id: 3, item_id: 3, item_name: "Mixed salad", price_paid: 2.8, date: "2026-07-24", timestamp: "2026-07-24T12:50" },
      { purchase_id: 6, user_id: 1, item_id: 1, item_name: "Pasta with tomato sauce", price_paid: 3.2, date: "2026-07-23", timestamp: "2026-07-23T12:40" },
      { purchase_id: 7, user_id: 1, item_id: 5, item_name: "Coffee", price_paid: 1.0, date: "2026-07-23", timestamp: "2026-07-23T13:10" },
    ],

    settings: {
      daily_allowance: 7.0,
      currency: "EUR",
    },
  };
}
