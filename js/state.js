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

export function addToCart(menuItem) {
  state.cart.push({ item_id: menuItem.item_id, name: menuItem.name, price: menuItem.price });
  sessionStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}

export function removeFromCart(index) {
  state.cart.splice(index, 1);
  sessionStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}

export function clearCart() {
  state.cart = [];
  sessionStorage.removeItem(CART_KEY);
}

export function cartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price, 0);
}
