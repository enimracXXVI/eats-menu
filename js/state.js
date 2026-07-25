// App-wide session state: who's logged in, and the in-progress cart.
// Not persisted purchases — those live in api.js / the sheet. This is only
// "what am I about to log" plus "who am I", so a refresh doesn't force a
// re-login or drop a half-built cart.

const SESSION_KEY = "eats-menu-session-v1";
const CART_KEY = "eats-menu-cart-v1";

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

function readCart() {
  try {
    return JSON.parse(sessionStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

export const state = {
  user: readSession(),
  cart: readCart(),
};

export function login(user) {
  state.user = user;
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function logout() {
  state.user = null;
  state.cart = [];
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(CART_KEY);
}

function persistCart() {
  sessionStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}

// Adding the same item again increases its quantity instead of creating a
// second line — one row per distinct item per checkout, matching a receipt.
export function addToCart(menuItem) {
  const existing = state.cart.find((c) => c.item_id === menuItem.item_id);
  if (existing) {
    existing.units += 1;
  } else {
    state.cart.push({ item_id: menuItem.item_id, name: menuItem.name, price: menuItem.price, units: 1 });
  }
  persistCart();
}

export function decrementCartItem(itemId) {
  const existing = state.cart.find((c) => c.item_id === itemId);
  if (!existing) return;
  existing.units -= 1;
  if (existing.units <= 0) {
    state.cart = state.cart.filter((c) => c.item_id !== itemId);
  }
  persistCart();
}

export function removeCartLine(itemId) {
  state.cart = state.cart.filter((c) => c.item_id !== itemId);
  persistCart();
}

export function clearCart() {
  state.cart = [];
  sessionStorage.removeItem(CART_KEY);
}

export function cartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.units, 0);
}

export function cartUnitCount() {
  return state.cart.reduce((sum, item) => sum + item.units, 0);
}
