import { fileStore } from "./db.js";

const app = document.querySelector("#app");
const dialog = document.querySelector("#entry-dialog");
const state = { tripId: null, search: "", unfulfilledOnly: false, columns: 2, sort: "activity" };
function reportError(error) {
  const message = error instanceof Error ? error.message : String(error);
  window.alert(`Riceball could not complete that action.\n\n${message}`);
  console.error(error);
}
async function load() {
  return fileStore.load();
}

const timestamp = () => new Date().toISOString();
const identifier = () => crypto.randomUUID();
const folderButton = () => `<button class="button ${fileStore.hasFolder() ? "" : "button-primary"}" data-action="choose-folder">${fileStore.hasFolder() ? "Riceball folder" : "Choose folder"}</button>`;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function formatMoney(minor, currency) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format((minor ?? 0) / 100);
}

function fulfillment(item, purchases) {
  const bought = purchases.filter((purchase) => purchase.itemId === item.id).reduce((sum, purchase) => sum + purchase.quantity, 0);
  return { bought, remaining: Math.max(0, item.desiredQuantity - bought), complete: bought >= item.desiredQuantity };
}

function renderHeader(title, action = "") {
  return `<header class="topbar"><button class="brand" data-action="home" aria-label="All trips"><span class="brand-mark">▲</span><span>riceball</span></button><div class="topbar-title">${title}</div>${action}</header>`;
}

async function render() {
  const data = await load();
  const trip = data.trips.find((candidate) => candidate.id === state.tripId && candidate.status !== "archived");
  if (!trip) {
    state.tripId = null;
    renderTrips(data);
    return;
  }
  renderTrip(data, trip);
}

function renderTrips(data) {
  const activeTrips = data.trips.filter((trip) => trip.status !== "archived").sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  app.innerHTML = `${renderHeader("Trips", `${folderButton()}<button class="button button-primary" data-action="new-trip">New trip</button>`)}
    <section class="hero"><p class="eyebrow">Offline vacation shopping</p><h1>Keep the good finds, lose the paper trail.</h1><p>Trips, shopping quantities, and receipts stay in your chosen Riceball folder.</p>${fileStore.hasFolder() ? '<p class="storage-ready">Folder connected. Data saves to <code>riceball.json</code>.</p>' : '<p class="storage-warning">Choose a folder before creating data so it can be saved outside browser storage.</p>'}</section>
    <section class="trip-list">${activeTrips.length ? activeTrips.map((trip) => `<button class="trip-card" data-open-trip="${trip.id}"><span class="trip-card-arrow">↗</span><span class="trip-card-name">${escapeHtml(trip.name)}</span><span>${escapeHtml(trip.currency)}</span></button>`).join("") : '<div class="empty-state"><span class="empty-mark">△</span><h2>Your first trip starts here.</h2><p>Create one trip and Riceball will keep its shopping list and receipts together.</p><button class="button button-primary" data-action="new-trip">Create trip</button></div>'}</section>`;
}

function renderTrip(data, trip) {
  const tripItems = data.items.filter((item) => item.tripId === trip.id && item.status !== "archived");
  const tripReceipts = data.receipts.filter((receipt) => receipt.tripId === trip.id);
  const total = tripReceipts.reduce((sum, receipt) => sum + (receipt.totalMinor ?? 0), 0);
  const pending = tripReceipts.filter((receipt) => receipt.totalMinor == null).length;
  const filtered = tripItems
    .filter((item) => item.name.toLowerCase().includes(state.search.toLowerCase()))
    .filter((item) => !state.unfulfilledOnly || !fulfillment(item, data.purchases).complete)
    .sort((left, right) => state.sort === "name" ? left.name.localeCompare(right.name) : right.updatedAt.localeCompare(left.updatedAt));

  app.innerHTML = `${renderHeader(escapeHtml(trip.name), `${folderButton()}<button class="button button-primary" data-action="new-item">Add item</button>`)}
    <section class="trip-hero"><p class="eyebrow">${escapeHtml(trip.currency)} · ${tripItems.length} wanted items</p><h1>${escapeHtml(trip.name)}</h1><div class="metric-row"><article><span>Receipt spend</span><strong>${formatMoney(total, trip.currency)}</strong></article><article><span>Pending receipts</span><strong>${pending}</strong></article><article><span>Items left</span><strong>${tripItems.filter((item) => !fulfillment(item, data.purchases).complete).length}</strong></article></div></section>
    <section class="controls"><input data-search type="search" value="${escapeHtml(state.search)}" placeholder="Search items"><label class="switch"><input data-unfulfilled type="checkbox" ${state.unfulfilledOnly ? "checked" : ""}><span>Unfulfilled</span></label><select data-sort aria-label="Sort items"><option value="activity" ${state.sort === "activity" ? "selected" : ""}>Recent activity</option><option value="name" ${state.sort === "name" ? "selected" : ""}>Name</option></select><select data-columns aria-label="Grid columns"><option value="1" ${state.columns === 1 ? "selected" : ""}>1 column</option><option value="2" ${state.columns === 2 ? "selected" : ""}>2 columns</option><option value="3" ${state.columns === 3 ? "selected" : ""}>3 columns</option></select></section>
    <section class="items-section"><div class="section-heading"><h2>Shopping list</h2><span>${filtered.length} shown</span></div><div class="item-grid columns-${state.columns}">${filtered.length ? filtered.map((item) => itemCard(item, data.purchases)).join("") : '<div class="empty-inline">No items match these filters.</div>'}</div></section>
    <section class="receipt-section"><div class="section-heading"><h2>Receipts</h2><button class="text-button" data-action="new-receipt">Add receipt</button></div>${tripReceipts.length ? tripReceipts.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map((receipt) => `<article class="receipt-row"><span>${receipt.totalMinor == null ? "Pending total" : formatMoney(receipt.totalMinor, trip.currency)}</span><small>${new Date(receipt.createdAt).toLocaleDateString()}</small></article>`).join("") : '<p class="muted">No receipts yet. Add one after shopping to track your spend.</p>'}</section>`;
  decoratePhotos();
}

function itemCard(item, purchases) {
  const progress = fulfillment(item, purchases);
  const percent = Math.min(100, Math.round((progress.bought / item.desiredQuantity) * 100));
  return `<article class="item-card">${item.photoPath ? `<img class="item-photo" data-photo="${escapeHtml(item.photoPath)}" alt="">` : `<div class="item-art"><span>${escapeHtml(item.name.slice(0, 1).toUpperCase())}</span></div>`}<div class="item-content"><h3>${escapeHtml(item.name)}</h3><p>${progress.complete ? `Complete · ${progress.bought}/${item.desiredQuantity}` : `${progress.remaining} remaining · ${progress.bought}/${item.desiredQuantity}`}</p><div class="progress"><span style="width:${percent}%"></span></div><div class="stepper"><button data-decrement="${item.id}" aria-label="Decrease ${escapeHtml(item.name)}">−</button><strong>${progress.bought}</strong><button data-increment="${item.id}" aria-label="Increase ${escapeHtml(item.name)}">+</button></div></div></article>`;
}

async function decoratePhotos() {
  for (const image of app.querySelectorAll("[data-photo]")) {
    try { image.src = await fileStore.photoUrl(image.dataset.photo); } catch { image.remove(); }
  }
}

function openForm(kind) {
  const forms = {
    trip: `<form method="dialog" data-form="trip"><h2>New trip</h2><label>Trip name<input name="name" required autofocus placeholder="Tokyo spring"></label><label>Currency<input name="currency" required value="USD" maxlength="3" autocapitalize="characters"></label><menu><button value="cancel">Cancel</button><button class="button button-primary" value="default">Create trip</button></menu></form>`,
    item: `<form method="dialog" data-form="item"><h2>Add wanted item</h2><label>Name<input name="name" required autofocus placeholder="Matcha snacks"></label><label>Desired quantity<input name="quantity" type="number" min="1" value="10" required></label><label>Photo <span class="optional">optional</span><input name="photo" type="file" accept="image/*"></label><menu><button value="cancel">Cancel</button><button class="button button-primary" value="default">Add item</button></menu></form>`,
    receipt: `<form method="dialog" data-form="receipt"><h2>Add receipt</h2><label>Total <span class="optional">optional</span><input name="total" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></label><label>Photo <span class="optional">optional</span><input name="photo" type="file" accept="image/*"></label><menu><button value="cancel">Cancel</button><button class="button button-primary" value="default">Save receipt</button></menu></form>`
  };
  dialog.innerHTML = forms[kind];
  dialog.showModal();
}

async function saveForm(form) {
  if (!fileStore.hasFolder()) throw new Error("Choose a Riceball folder before saving");
  const data = await load();
  const values = new FormData(form);
  const type = form.dataset.form;
  if (type === "trip") {
    const createdAt = timestamp();
    const trip = { id: identifier(), name: values.get("name").trim(), currency: values.get("currency").trim().toUpperCase(), status: "active", createdAt, updatedAt: createdAt };
    data.trips.push(trip);
    await fileStore.save(data);
    state.tripId = trip.id;
  }
  if (type === "item") {
    const createdAt = timestamp();
    const item = { id: identifier(), tripId: state.tripId, name: values.get("name").trim(), desiredQuantity: Number(values.get("quantity")), status: "active", createdAt, updatedAt: createdAt };
    const photo = values.get("photo");
    if (photo?.size) item.photoPath = await fileStore.savePhoto(photo, item.id);
    data.items.push(item);
    await fileStore.save(data);
  }
  if (type === "receipt") {
    const total = values.get("total").trim();
    const createdAt = timestamp();
    const receipt = { id: identifier(), tripId: state.tripId, totalMinor: total ? Math.round(Number(total) * 100) : null, createdAt, updatedAt: createdAt };
    const photo = values.get("photo");
    if (photo?.size) receipt.photoPath = await fileStore.savePhoto(photo, receipt.id);
    data.receipts.push(receipt);
    await fileStore.save(data);
  }
  dialog.close();
  render();
}

app.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action], [data-open-trip], [data-increment], [data-decrement]");
  if (!target) return;
  if (target.dataset.action === "choose-folder") {
    try {
      await fileStore.chooseFolder();
      state.tripId = null;
      render();
    } catch (error) { reportError(error); }
    return;
  }
  if (target.dataset.openTrip) { state.tripId = target.dataset.openTrip; render(); return; }
  if (target.dataset.action === "home") { state.tripId = null; render(); return; }
  if (target.dataset.action === "new-trip") return openForm("trip");
  if (target.dataset.action === "new-item") return openForm("item");
  if (target.dataset.action === "new-receipt") return openForm("receipt");
  const itemId = target.dataset.increment ?? target.dataset.decrement;
  if (itemId) {
    const data = await load();
    const delta = target.dataset.increment ? 1 : -1;
    const existing = data.purchases.find((purchase) => purchase.itemId === itemId && purchase.quick === true);
    if (existing && existing.quantity + delta > 0) existing.quantity += delta;
    else if (existing) data.purchases.splice(data.purchases.indexOf(existing), 1);
    else if (delta > 0) data.purchases.push({ id: identifier(), itemId, quantity: 1, quick: true, createdAt: timestamp(), updatedAt: timestamp() });
    try {
      await fileStore.save(data);
      render();
    } catch (error) { reportError(error); }
  }
});

app.addEventListener("input", (event) => { if (event.target.matches("[data-search]")) { state.search = event.target.value; render(); } });
app.addEventListener("change", (event) => {
  if (event.target.matches("[data-unfulfilled]")) state.unfulfilledOnly = event.target.checked;
  if (event.target.matches("[data-sort]")) state.sort = event.target.value;
  if (event.target.matches("[data-columns]")) state.columns = Number(event.target.value);
  render();
});
dialog.addEventListener("submit", (event) => { event.preventDefault(); saveForm(event.target).catch(reportError); });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
render();
