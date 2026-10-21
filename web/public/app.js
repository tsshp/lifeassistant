import { fileStore } from "./db.js";

const app = document.querySelector("#app");
const dialog = document.querySelector("#entry-dialog");
const itemActionsDialog = document.querySelector("#item-actions-dialog");
const sortMenuDialog = document.querySelector("#sort-menu-dialog");
const photoViewerDialog = document.querySelector("#photo-viewer-dialog");
const errorOverlay = document.querySelector("#error-overlay");
const restoreInput = document.querySelector("#restore-input");
const state = { tripId: null, subpage: "overview", tripSearch: "", search: "", unfulfilledOnly: true, tagId: "", storeTypeTagId: "", categoryTagId: "", storeId: "", pendingReceipts: false, receiptFilterType: "", showArchived: false, columns: 4, sort: "name", sortDirection: "asc" };
let initialRender = true;
const errorLog = [];
function renderErrors() {
  errorOverlay.hidden = errorLog.length === 0 || errorOverlay.dataset.closed === "true";
  errorOverlay.innerHTML = `<div class="error-overlay-header"><strong>Riceball errors (${errorLog.length})</strong><button type="button" data-close-errors aria-label="Close errors">×</button></div><div class="error-list">${errorLog.slice().reverse().map((entry) => `<article><time>${escapeHtml(entry.time)}</time><p>${escapeHtml(entry.message)}</p></article>`).join("")}</div>`;
}
function reportError(error) {
  const message = error instanceof Error ? error.message : String(error);
  errorLog.push({ message, time: new Date().toLocaleString() });
  if (errorLog.length > 50) errorLog.shift();
  errorOverlay.dataset.closed = "false";
  renderErrors();
  console.error(error);
}
fileStore.setErrorHandler(reportError);
async function load() {
  return fileStore.load();
}

async function finalizeQuickPurchases() {
  if (!fileStore.hasFolder()) return;
  const data = await load();
  let changed = false;
  for (const purchase of data.purchases) {
    if (purchase.quick) { purchase.quick = false; purchase.updatedAt = timestamp(); changed = true; }
  }
  if (changed) await fileStore.save(data);
}

const timestamp = () => new Date().toISOString();
const identifier = () => crypto.randomUUID();
const folderButton = () => `<button class="button ${fileStore.hasFolder() ? "" : "button-primary"}" data-action="choose-folder">${fileStore.hasFolder() ? "Riceball folder" : fileStore.hasSavedFolder() ? "Reconnect folder" : "Choose folder"}</button>`;
const backupButtons = () => `<button class="button" data-action="export-data">Export JSON</button><button class="button" data-action="backup-folder">Copy folder backup</button><button class="button" data-action="import-data">Restore JSON</button>`;

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

function tagAndDescendants(tags, tagId) {
  const ids = new Set([tagId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const tag of tags) if (tag.parentId && ids.has(tag.parentId) && !ids.has(tag.id)) { ids.add(tag.id); changed = true; }
  }
  return ids;
}

function tripNavigation(page) {
  const links = [["overview", "⌂", "Trip overview"], ["receipts", "▤", "Receipts"], ["stores", "⌂", "Stores"], ["tags", "#", "Tags"], ["purchase-types", "◈", "Purchase types"]];
  return `<nav class="trip-nav" aria-label="Trip pages">${links.map(([id, icon, label]) => `<button class="trip-nav-button ${page === id ? "active" : ""}" data-subpage="${id}" aria-label="${label}" title="${label}">${icon}</button>`).join("")}</nav>`;
}

function renderHeader(title, action = "", nav = "") {
  const page = nav || (title === "Trips" ? "" : title.includes("Receipts") ? "receipts" : title.includes("Stores") ? "stores" : title.includes("Tags") ? "tags" : title.includes("Purchase types") ? "purchase-types" : "overview");
  return `<header class="topbar"><button class="brand" data-action="home" aria-label="All trips"><span class="brand-mark">▲</span><span>riceball</span></button>${page ? tripNavigation(page) : ""}<div class="topbar-title">${title}</div><details class="top-actions"><summary>Actions</summary><div class="top-action-list">${action}</div></details></header>`;
}

function floatingAdd(action, label) {
  return `<button class="floating-add" data-action="${action}" aria-label="${label}" title="${label}">+</button>`;
}

function openSortMenu() {
  sortMenuDialog.innerHTML = `<form method="dialog" data-sort-form><h2>Sort items</h2><label>Order<select name="sort"><option value="name-asc">Name, ascending</option><option value="name-desc">Name, descending</option><option value="activity-asc">Recent activity, oldest first</option><option value="activity-desc">Recent activity, newest first</option><option value="remaining-asc">Remaining quantity, low to high</option><option value="remaining-desc">Remaining quantity, high to low</option></select></label><menu><button type="button" data-action="cancel-dialog">Cancel</button><button class="button button-primary" type="submit">Apply</button></menu></form>`;
  sortMenuDialog.querySelector("[name=sort]").value = `${state.sort}-${state.sortDirection}`;
  sortMenuDialog.showModal();
}

function removeRedundantMenuActions() {
  app.querySelectorAll('.top-action-list [data-subpage], .top-action-list [data-action="new-item"], .top-action-list [data-action="new-receipt"], .top-action-list [data-action="new-store"], .top-action-list [data-action="new-tag"], .top-action-list [data-action="new-purchase-type"]').forEach((button) => button.remove());
}

function compactFilterRows(controls) {
  const primary = document.createElement("div");
  primary.className = "filter-row filter-row-primary";
  ["[data-search]", "[data-store-type-tag]", "[data-category-tag]", "[data-store]"].forEach((selector) => { const element = controls.querySelector(selector); if (element) primary.append(element); });
  controls.querySelector("[data-unfulfilled]")?.closest("label")?.remove();
  controls.querySelector("[data-sort]")?.remove();
  controls.querySelector("[data-columns]")?.remove();
  controls.querySelector('[data-action="toggle-sort-direction"]')?.remove();
  primary.insertAdjacentHTML("beforeend", `<button class="filter-icon ${state.unfulfilledOnly ? "active" : ""}" data-action="toggle-unfulfilled" aria-label="${state.unfulfilledOnly ? "Showing unfulfilled items" : "Showing all items"}" title="${state.unfulfilledOnly ? "Showing unfulfilled items" : "Showing all items"}">${state.unfulfilledOnly ? "✅" : "⬜"}</button><button class="filter-icon" data-action="cycle-columns" aria-label="Columns: ${state.columns}" title="Columns: ${state.columns}">▦${state.columns}</button><button class="filter-icon" data-action="cycle-sort" aria-label="Sort: ${state.sort}, ${state.sortDirection}" title="Sort: ${state.sort}, ${state.sortDirection}">↕</button><button class="filter-icon" data-action="clear-filters" aria-label="Clear filters" title="Clear filters">×</button>`);
  controls.replaceChildren(primary);
}

async function render() {
  const data = await load();
  if (initialRender) {
    const savedTripId = await fileStore.getLastTripId();
    state.tripId = data.trips.some((trip) => trip.id === savedTripId && trip.status !== "archived") ? savedTripId : data.trips.find((trip) => trip.status !== "archived")?.id ?? null;
    initialRender = false;
  }
  const trip = data.trips.find((candidate) => candidate.id === state.tripId && candidate.status !== "archived");
  if (!trip) {
    state.tripId = null;
    renderTrips(data);
    return;
  }
  renderTrip(data, trip);
}

function renderSubpage(data, trip, page) {
  const back = `<button class="button" data-subpage="overview">Trip overview</button>`;
  if (page === "receipts") {
    const receipts = data.receipts.filter((receipt) => receipt.tripId === trip.id && (!state.pendingReceipts || receipt.totalMinor == null) && (!state.receiptFilterType || (receipt.splits ?? []).some((split) => (split.type || "Uncategorized") === state.receiptFilterType)));
    const allReceipts = data.receipts.filter((receipt) => receipt.tripId === trip.id);
    const total = allReceipts.reduce((sum, receipt) => sum + (receipt.totalMinor ?? 0), 0);
    const pending = allReceipts.filter((receipt) => receipt.totalMinor == null).length;
    app.innerHTML = `${renderHeader(`${escapeHtml(trip.name)} · Receipts`, `${back}<button class="button button-primary" data-action="new-receipt">Add receipt</button>`)}<section class="page-section"><div class="section-heading"><h1>Receipts</h1><button class="text-button" data-action="toggle-pending-receipts">${state.pendingReceipts ? "Show all" : "Pending only"}</button></div><div class="metric-row receipt-metrics"><article><span>Receipt spend</span><strong>${formatMoney(total, trip.currency)}</strong></article><button class="metric-card" data-action="toggle-pending-receipts"><span>Pending receipts</span><strong>${pending}</strong></button></div>${receipts.length ? receipts.map((receipt) => `<article class="receipt-row">${(receipt.photoPaths ?? (receipt.photoPath ? [receipt.photoPath] : [])).filter(Boolean).map((path) => `<img class="receipt-photo" data-photo="${escapeHtml(path)}" data-view-photo="${escapeHtml(path)}" alt="Receipt">`).join("")}<span>${receipt.totalMinor == null ? "Pending total" : formatMoney(receipt.totalMinor, trip.currency)}<small>${(receipt.purchaseIds ?? []).length} linked purchases</small></span><small>${new Date(receipt.createdAt).toLocaleDateString()}</small><button class="text-button" data-edit-receipt="${receipt.id}">Edit</button><button class="delete-button" data-delete-receipt="${receipt.id}">Delete</button></article>`).join("") : '<p class="muted">No receipts match this view.</p>'}</section>`;
  } else if (page === "stores") {
    const stores = data.stores.filter((store) => store.tripId === trip.id && store.status !== "archived");
    app.innerHTML = `${renderHeader(`${escapeHtml(trip.name)} · Stores`, `${back}<button class="button button-primary" data-action="new-store">Add store</button>`)}<section class="page-section"><h1>Stores</h1>${stores.length ? stores.map((store) => `<article class="management-row"><span><strong>${escapeHtml(store.name)}</strong><small>${escapeHtml(store.notes ?? "")}</small></span><button class="text-button" data-edit-store="${store.id}">Edit</button><button class="delete-button" data-delete-store="${store.id}">Delete</button></article>`).join("") : '<p class="muted">No stores saved for this trip.</p>'}</section>`;
  } else if (page === "tags") {
    const tags = data.tags.filter((tag) => tag.tripId === trip.id && tag.status !== "archived");
    app.innerHTML = `${renderHeader(`${escapeHtml(trip.name)} · Tags`, `${back}<button class="button button-primary" data-action="new-tag">Add tag</button>`)}<section class="page-section"><h1>Tags</h1>${tags.length ? tags.map((tag) => `<article class="management-row"><span><strong>${escapeHtml(tag.name)}</strong><small>${escapeHtml(tag.kind)}${tag.parentId ? " · child tag" : ""}</small></span><button class="text-button" data-edit-tag="${tag.id}">Edit</button><button class="delete-button" data-delete-tag="${tag.id}">Delete</button></article>`).join("") : '<p class="muted">No tags saved for this trip.</p>'}</section>`;
  } else {
    const types = data.purchaseTypes.filter((type) => type.tripId === trip.id && type.status !== "archived");
    app.innerHTML = `${renderHeader(`${escapeHtml(trip.name)} · Purchase types`, `${back}<button class="button button-primary" data-action="new-purchase-type">Add type</button>`)}<section class="page-section"><h1>Purchase types</h1>${types.length ? types.map((type) => `<article class="management-row"><span><strong>${escapeHtml(type.name)}</strong></span><button class="text-button" data-edit-purchase-type="${type.id}">Edit</button><button class="delete-button" data-delete-purchase-type="${type.id}">Delete</button></article>`).join("") : '<p class="muted">No purchase types saved for this trip.</p>'}</section>`;
  }
  app.insertAdjacentHTML("beforeend", floatingAdd({ receipts: "new-receipt", stores: "new-store", tags: "new-tag", "purchase-types": "new-purchase-type" }[page], `Add ${page === "purchase-types" ? "purchase type" : page.slice(0, -1)}`));
  removeRedundantMenuActions();
  decoratePhotos();
}

function renderTrips(data) {
  const visibleTrips = data.trips.filter((trip) => (state.showArchived ? trip.status === "archived" : trip.status !== "archived") && trip.name.toLowerCase().includes(state.tripSearch.toLowerCase())).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    app.innerHTML = `${renderHeader("Trips", `${folderButton()}${backupButtons()}<button class="button button-primary" data-action="new-trip">New trip</button>`)}
    <section class="hero"><p class="eyebrow">Offline vacation shopping</p><h1>Keep the good finds, lose the paper trail.</h1><p>Trips, shopping quantities, and receipts stay in your chosen Riceball folder.</p>${fileStore.hasFolder() ? '<p class="storage-ready">Folder connected. Data saves to <code>riceball.json</code>.</p>' : '<p class="storage-warning">Choose a folder before creating data so it can be saved outside browser storage.</p>'}</section>
    <section class="section-heading"><h2>${state.showArchived ? "Archived trips" : "Active trips"}</h2><button class="text-button" data-action="toggle-archived-trips">${state.showArchived ? "Show active trips" : "Show archived trips"}</button></section><section class="controls trip-controls"><input data-trip-search type="search" value="${escapeHtml(state.tripSearch)}" placeholder="Search trips" aria-label="Search trips"></section><section class="trip-list">${visibleTrips.length ? visibleTrips.map((trip) => `<article class="trip-card"><button class="trip-card-open" data-open-trip="${trip.id}"><span class="trip-card-arrow">↗</span><span class="trip-card-name">${escapeHtml(trip.name)}</span><span>${escapeHtml(trip.currency)}</span></button>${state.showArchived ? `<button class="text-button" data-restore-trip="${trip.id}">Restore</button><button class="delete-button" data-delete-trip="${trip.id}">Delete permanently</button>` : ""}</article>`).join("") : '<div class="empty-state"><span class="empty-mark">△</span><h2>No matching trips.</h2><p>Try a different search or create a new trip.</p><button class="button button-primary" data-action="new-trip">Create trip</button></div>'}</section>`;
  app.insertAdjacentHTML("beforeend", floatingAdd("new-trip", "Add trip"));
  removeRedundantMenuActions();
}

function renderTrip(data, trip) {
  if (state.subpage !== "overview") { renderSubpage(data, trip, state.subpage); return; }
  const allTripItems = data.items.filter((item) => item.tripId === trip.id);
  const tripItems = allTripItems.filter((item) => state.showArchived ? item.status === "archived" : item.status !== "archived");
  const tripStores = data.stores.filter((store) => store.tripId === trip.id && store.status !== "archived");
  const tripTags = data.tags.filter((tag) => tag.tripId === trip.id && tag.status !== "archived");
  const tripPurchaseTypes = data.purchaseTypes.filter((type) => type.tripId === trip.id && type.status !== "archived");
  const tripDrafts = data.drafts.filter((draft) => draft.tripId === trip.id && draft.status === "draft");
  const allTripReceipts = data.receipts.filter((receipt) => receipt.tripId === trip.id);
  const pending = allTripReceipts.filter((receipt) => receipt.totalMinor == null).length;
  const tripReceipts = allTripReceipts.filter((receipt) => (!state.pendingReceipts || receipt.totalMinor == null) && (!state.receiptFilterType || (state.receiptFilterType === "Uncategorized" ? (!(receipt.splits ?? []).length || receipt.totalMinor > (receipt.splits ?? []).reduce((sum, split) => sum + (split.amountMinor ?? 0), 0)) : (receipt.splits ?? []).some((split) => (split.type || "Uncategorized") === state.receiptFilterType))));
  const total = allTripReceipts.reduce((sum, receipt) => sum + (receipt.totalMinor ?? 0), 0);
  const splitTotals = allTripReceipts.reduce((groups, receipt) => {
    const splits = receipt.splits ?? [];
    if (!splits.length) { if (receipt.totalMinor != null) groups.Uncategorized = (groups.Uncategorized ?? 0) + receipt.totalMinor; return groups; }
    for (const split of splits) { const key = split.type || "Uncategorized"; groups[key] = (groups[key] ?? 0) + (split.amountMinor ?? 0); }
    const remainder = (receipt.totalMinor ?? 0) - splits.reduce((sum, split) => sum + (split.amountMinor ?? 0), 0);
    if (remainder > 0) groups.Uncategorized = (groups.Uncategorized ?? 0) + remainder;
    return groups;
  }, {});
  const splitSummary = Object.entries(splitTotals).sort((left, right) => right[1] - left[1]).slice(0, 3).map(([type, amount]) => `<button class="metric-link" data-receipt-filter="${escapeHtml(type)}">${escapeHtml(type)} ${formatMoney(amount, trip.currency)}</button>`).join("");
  const splitWarning = allTripReceipts.some((receipt) => receipt.totalMinor != null && (receipt.splits ?? []).length && receipt.splits.reduce((sum, split) => sum + (split.amountMinor ?? 0), 0) !== receipt.totalMinor);
  const selectedStore = tripStores.find((store) => store.id === state.storeId);
  const selectedTagIds = new Set();
  for (const tagId of [state.tagId, state.storeTypeTagId, state.categoryTagId]) if (tagId) for (const id of tagAndDescendants(tripTags, tagId)) selectedTagIds.add(id);
  for (const tagId of selectedStore?.tagIds ?? []) selectedTagIds.add(tagId);
  const filtered = tripItems
    .filter((item) => item.name.toLowerCase().includes(state.search.toLowerCase()))
    .filter((item) => !selectedTagIds.size || [...selectedTagIds].some((tagId) => (item.tagIds ?? []).includes(tagId)))
    .filter((item) => !state.unfulfilledOnly || !fulfillment(item, data.purchases).complete)
    .sort((left, right) => {
      const leftValue = state.sort === "name" ? left.name : state.sort === "remaining" ? fulfillment(left, data.purchases).remaining : left.updatedAt;
      const rightValue = state.sort === "name" ? right.name : state.sort === "remaining" ? fulfillment(right, data.purchases).remaining : right.updatedAt;
      const comparison = typeof leftValue === "number" ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue));
      return state.sortDirection === "asc" ? comparison : -comparison;
    });

  app.innerHTML = `${renderHeader(escapeHtml(trip.name), `${folderButton()}${backupButtons()}<button class="button" data-subpage="receipts">Receipts</button><button class="button" data-subpage="stores">Stores</button><button class="button" data-subpage="tags">Tags</button><button class="button" data-subpage="purchase-types">Purchase types</button><button class="button" data-action="edit-trip">Edit trip</button><button class="button" data-action="archive-trip">Archive trip</button>${tripDrafts.length ? `<button class="button" data-review-draft="${tripDrafts[0].id}">Review drafts (${tripDrafts.length})</button>` : ""}<button class="button button-primary" data-action="new-item">Add item</button>`)}
    <section class="trip-hero"><p class="eyebrow">${escapeHtml(trip.currency)} · ${tripItems.length} wanted items</p><h1>${escapeHtml(trip.name)}</h1>${state.receiptFilterType ? `<p class="filter-notice">Showing receipts for ${escapeHtml(state.receiptFilterType)} <button class="text-button" data-receipt-filter="__all__">Clear</button></p>` : ""}${splitWarning ? '<p class="storage-warning">One or more receipt split totals do not match the receipt total. Both values are retained.</p>' : ""}</section>
    <section class="controls"><input data-search type="search" value="${escapeHtml(state.search)}" placeholder="Search items"><select data-store-type-tag aria-label="Filter by store type"><option value="">All store types</option>${tripTags.filter((tag) => tag.kind === "store-type").map((tag) => `<option value="${tag.id}" ${state.storeTypeTagId === tag.id ? "selected" : ""}>${escapeHtml(tag.name)}</option>`).join("")}</select><select data-category-tag aria-label="Filter by category"><option value="">All categories</option>${tripTags.filter((tag) => tag.kind === "category").map((tag) => `<option value="${tag.id}" ${state.categoryTagId === tag.id ? "selected" : ""}>${escapeHtml(tag.name)}</option>`).join("")}</select><select data-store aria-label="Filter by saved store"><option value="">Any saved store</option>${tripStores.map((store) => `<option value="${store.id}" ${state.storeId === store.id ? "selected" : ""}>${escapeHtml(store.name)}</option>`).join("")}</select><label class="switch"><input data-unfulfilled type="checkbox" ${state.unfulfilledOnly ? "checked" : ""}><span>Unfulfilled</span></label><select data-sort aria-label="Sort items"><option value="activity" ${state.sort === "activity" ? "selected" : ""}>Recent activity</option><option value="name" ${state.sort === "name" ? "selected" : ""}>Name</option><option value="remaining" ${state.sort === "remaining" ? "selected" : ""}>Remaining quantity</option></select><button class="button" data-action="toggle-sort-direction">${state.sortDirection === "asc" ? "Ascending" : "Descending"}</button><select data-columns aria-label="Grid columns"><option value="1" ${state.columns === 1 ? "selected" : ""}>1 column</option><option value="2" ${state.columns === 2 ? "selected" : ""}>2 columns</option><option value="3" ${state.columns === 3 ? "selected" : ""}>3 columns</option></select></section>
    <section class="items-section"><div class="section-heading"><h2>${state.showArchived ? "Archived items" : "Shopping list"}</h2><span>${filtered.length} shown</span><button class="text-button" data-action="toggle-archived-items">${state.showArchived ? "Show active items" : "Show archived items"}</button></div><div class="item-grid columns-${state.columns}">${filtered.length ? filtered.map((item) => itemCard(item, data.purchases, data)).join("") : '<div class="empty-inline">No items match these filters.</div>'}</div></section>
    <section class="receipt-section"><div class="section-heading"><h2>${state.pendingReceipts ? "Pending receipts" : "Receipts"}</h2><button class="text-button" data-action="toggle-pending-receipts">${state.pendingReceipts ? "Show all receipts" : `Review pending (${pending})`}</button><button class="text-button" data-action="new-receipt">Add receipt</button></div>${tripReceipts.length ? tripReceipts.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map((receipt) => `<article class="receipt-row">${(receipt.photoPaths ?? (receipt.photoPath ? [receipt.photoPath] : [])).length ? `<div class="receipt-gallery">${(receipt.photoPaths ?? [receipt.photoPath]).filter(Boolean).map((path) => `<img class="receipt-photo" data-photo="${escapeHtml(path)}" data-view-photo="${escapeHtml(path)}" alt="Receipt">`).join("")}</div>` : ""}<span>${receipt.totalMinor == null ? "Pending total" : formatMoney(receipt.totalMinor, trip.currency)}<small>${(receipt.purchaseIds ?? []).length ? `${receipt.purchaseIds.length} linked purchases` : "No linked purchases"}</small></span><small>${new Date(receipt.createdAt).toLocaleDateString()}</small><button class="text-button" data-edit-receipt="${receipt.id}">Edit</button><button class="delete-button" data-delete-receipt="${receipt.id}">Delete</button></article>`).join("") : '<p class="muted">No receipts match this view.</p>'}</section>
    <section class="management-section"><div class="section-heading"><h2>Stores</h2><button class="text-button" data-action="new-store">Add store</button></div>${tripStores.length ? tripStores.map((store) => `<article class="management-row"><span><strong>${escapeHtml(store.name)}</strong><small>${escapeHtml(store.notes ?? "")}</small></span><button class="text-button" data-edit-store="${store.id}">Edit</button><button class="delete-button" data-delete-store="${store.id}">Delete</button></article>`).join("") : '<p class="muted">No stores saved for this trip.</p>'}</section>
    <section class="management-section"><div class="section-heading"><h2>Tags</h2><button class="text-button" data-action="new-tag">Add tag</button></div>${tripTags.length ? tripTags.map((tag) => `<article class="management-row"><span><strong>${escapeHtml(tag.name)}</strong><small>${escapeHtml(tag.kind)}</small></span><button class="text-button" data-edit-tag="${tag.id}">Edit</button><button class="delete-button" data-delete-tag="${tag.id}">Delete</button></article>`).join("") : '<p class="muted">No tags saved for this trip.</p>'}</section>
    <section class="management-section"><div class="section-heading"><h2>Purchase types</h2><button class="text-button" data-action="new-purchase-type">Add type</button></div>${tripPurchaseTypes.length ? tripPurchaseTypes.map((type) => `<article class="management-row"><span><strong>${escapeHtml(type.name)}</strong></span><button class="text-button" data-edit-purchase-type="${type.id}">Edit</button><button class="delete-button" data-delete-purchase-type="${type.id}">Delete</button></article>`).join("") : '<p class="muted">No purchase types saved for this trip.</p>'}</section>`;
  app.querySelector(".receipt-section")?.remove();
  app.querySelectorAll(".management-section").forEach((section) => section.remove());
  app.insertAdjacentHTML("beforeend", floatingAdd("new-item", "Add item"));
  removeRedundantMenuActions();
  const controls = app.querySelector(".controls");
  if (controls) { controls.classList.add("filter-panel"); compactFilterRows(controls); }
  const columnSelect = app.querySelector("[data-columns]");
  if (columnSelect) columnSelect.insertAdjacentHTML("beforeend", `<option value="4" ${state.columns === 4 ? "selected" : ""}>4 columns</option><option value="5" ${state.columns === 5 ? "selected" : ""}>5 columns</option>`);
  decoratePhotos();
}

function itemCard(item, purchases, data) {
  const progress = fulfillment(item, purchases);
  const percent = Math.min(100, Math.round((progress.bought / item.desiredQuantity) * 100));
  const history = purchases.filter((purchase) => purchase.itemId === item.id && !purchase.quick);
  const sightings = data.priceSightings.filter((sighting) => sighting.itemId === item.id);
  const lifecycle = state.showArchived ? `<button class="text-button" data-restore-item="${item.id}">Restore</button><button class="delete-button" data-delete-archived-item="${item.id}">Delete permanently</button>` : "";
  const photoPaths = item.photoPaths ?? (item.photoPath ? [item.photoPath] : []);
  const stepper = state.showArchived ? "" : `<div class="item-stepper"><button data-decrement="${item.id}" aria-label="Decrease ${escapeHtml(item.name)}">−</button><strong>${progress.bought}</strong><button data-increment="${item.id}" aria-label="Increase ${escapeHtml(item.name)}">+</button></div>`;
  const photoFrame = photoPaths.length ? `<div class="photo-frame"><div class="photo-gallery">${photoPaths.map((path) => `<img class="item-photo" data-photo="${escapeHtml(path)}" data-view-photo="${escapeHtml(path)}" alt="${escapeHtml(item.name)}">`).join("")}</div></div>` : `<div class="photo-frame"><div class="item-art"><span>${escapeHtml(item.name.slice(0, 1).toUpperCase())}</span></div></div>`;
  const statusText = `${progress.bought}/${item.desiredQuantity}${progress.bought > item.desiredQuantity ? ` · +${progress.bought - item.desiredQuantity}` : ""}`;
  return `<article class="item-card" data-long-press-item="${item.id}">${photoFrame}${stepper}<div class="item-content"><h3 title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h3><p class="item-status">${statusText}</p>${history.map((purchase) => `<div class="purchase-line"><span>${purchase.quantity} purchased${purchase.totalMinor == null ? "" : ` · ${formatMoney(purchase.totalMinor, data.trips.find((trip) => trip.id === item.tripId)?.currency ?? "USD")}`}</span><button class="text-button" data-edit-purchase="${purchase.id}">Edit</button><button class="delete-button" data-delete-purchase="${purchase.id}">Delete</button></div>`).join("")}${sightings.map((sighting) => `<div class="purchase-line"><span>Price ${formatMoney(sighting.packagePriceMinor, data.trips.find((trip) => trip.id === item.tripId)?.currency ?? "USD")} / ${sighting.packageQuantity} = ${formatMoney(sighting.comparableMinor, data.trips.find((trip) => trip.id === item.tripId)?.currency ?? "USD")} each</span><button class="text-button" data-edit-sighting="${sighting.id}">Edit</button><button class="delete-button" data-delete-sighting="${sighting.id}">Delete</button></div>`).join("")}${lifecycle}</div></article>`;
}

async function decoratePhotos() {
  await Promise.all([...app.querySelectorAll("[data-photo]")].map(async (image) => {
    try { image.src = await fileStore.photoUrl(image.dataset.photo); } catch { image.remove(); }
  }));
}

function openItemActions(itemId) {
  itemActionsDialog.innerHTML = `<div class="action-menu"><h2>Item actions</h2><button data-item-action="purchase" data-item-id="${itemId}">Add purchase detail</button><button data-item-action="sighting" data-item-id="${itemId}">Add price sighting</button><button data-item-action="edit" data-item-id="${itemId}">Edit item</button><button data-item-action="archive" data-item-id="${itemId}">Archive item</button><button data-item-action="cancel">Cancel</button></div>`;
  itemActionsDialog.showModal();
}

function openForm(kind, item = null) {
  const forms = {
    trip: `<form method="dialog" data-form="trip" data-trip-id="${item?.id ?? ""}"><h2>${item ? "Edit trip" : "New trip"}</h2><label>Trip name<input name="name" required autofocus placeholder="Tokyo spring" value="${escapeHtml(item?.name ?? "")}"></label><label>Currency<input name="currency" required value="${escapeHtml(item?.currency ?? "USD")}" maxlength="3" autocapitalize="characters"></label><menu><button type="button" data-action="cancel-dialog">Cancel</button><button class="button button-primary" type="submit">${item ? "Save trip" : "Create trip"}</button></menu></form>`,
    item: `<form method="dialog" data-form="item" data-item-id="${item?.id ?? ""}"><h2>${item ? "Edit item" : "Add wanted item"}</h2><label>Name<input name="name" autofocus placeholder="Optional name" value="${escapeHtml(item?.name ?? "")}"></label><label>Notes <span class="optional">optional</span><textarea name="notes" rows="3">${escapeHtml(item?.notes ?? "")}</textarea></label><label>Desired quantity<input name="quantity" type="number" min="1" value="${item?.desiredQuantity ?? 10}" required></label><label>Tag IDs <span class="optional">optional, comma-separated</span><input name="tagIds" value="${escapeHtml((item?.tagIds ?? []).join(", "))}" placeholder="Paste tag IDs"></label><label>Photos <span class="optional">select from gallery; camera may be available in the picker</span><input name="photo" type="file" accept="image/*" multiple></label><menu><button type="button" data-action="cancel-dialog">Cancel</button><button class="button button-primary" type="submit">${item ? "Save item" : "Add item"}</button></menu></form>`,
    receipt: `<form method="dialog" data-form="receipt" data-receipt-id="${item?.id ?? ""}"><h2>${item ? "Edit receipt" : "Add receipt"}</h2><label>Total <span class="optional">optional</span><input name="total" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${item?.totalMinor == null ? "" : item.totalMinor / 100}"></label><label>Store <span class="optional">optional</span><input name="store" value="${escapeHtml(item?.store ?? "")}"></label><label>Date <span class="optional">optional</span><input name="date" type="date" value="${item?.date ?? new Date().toISOString().slice(0, 10)}"></label><label>Notes <span class="optional">optional</span><input name="notes" value="${escapeHtml(item?.notes ?? "")}"></label><label>Splits <span class="optional">optional, type:amount comma-separated</span><input name="splits" value="${escapeHtml((item?.splits ?? []).map((split) => `${split.type}:${(split.amountMinor ?? 0) / 100}`).join(", "))}" placeholder="Food:20, Gifts:15"></label><label>Purchase IDs <span class="optional">optional, comma-separated</span><input name="purchaseIds" value="${escapeHtml((item?.purchaseIds ?? []).join(", "))}" placeholder="Paste purchase IDs"></label><label>Photos <span class="optional">select from gallery; camera may be available in the picker</span><input name="photo" type="file" accept="image/*" multiple></label><menu><button type="button" data-action="cancel-dialog">Cancel</button><button class="button button-primary" type="submit">Save receipt</button></menu></form>`,
    store: `<form method="dialog" data-form="store" data-store-id="${item?.id ?? ""}"><h2>${item ? "Edit store" : "Add store"}</h2><label>Name<input name="name" required autofocus value="${escapeHtml(item?.name ?? "")}" placeholder="Central Market"></label><label>Branch or notes<input name="notes" value="${escapeHtml(item?.notes ?? "")}"></label><label>Store-type tags<input name="tags" value="${escapeHtml((item?.tagIds ?? []).join(", "))}" placeholder="grocery, pharmacy"></label><menu><button type="button" data-action="cancel-dialog">Cancel</button><button class="button button-primary" type="submit">Save store</button></menu></form>`,
    tag: `<form method="dialog" data-form="tag" data-tag-id="${item?.id ?? ""}"><h2>${item ? "Edit tag" : "Add tag"}</h2><label>Name<input name="name" required autofocus value="${escapeHtml(item?.name ?? "")}" placeholder="Snacks"></label><label>Kind<select name="kind"><option value="store-type" ${item?.kind === "store-type" ? "selected" : ""}>Store type</option><option value="category" ${item?.kind === "category" ? "selected" : ""}>Category</option></select></label><label>Parent tag ID <span class="optional">optional</span><input name="parentId" value="${escapeHtml(item?.parentId ?? "")}"></label><menu><button type="button" data-action="cancel-dialog">Cancel</button><button class="button button-primary" type="submit">Save tag</button></menu></form>`,
    purchaseType: `<form method="dialog" data-form="purchaseType" data-purchase-type-id="${item?.id ?? ""}"><h2>${item ? "Edit purchase type" : "Add purchase type"}</h2><label>Name<input name="name" required autofocus value="${escapeHtml(item?.name ?? "")}" placeholder="Food"></label><menu><button type="button" data-action="cancel-dialog">Cancel</button><button class="button button-primary" type="submit">Save type</button></menu></form>`,
    draft: `<form method="dialog" data-form="draft" data-draft-id="${item?.id ?? ""}"><h2>Review photo draft</h2><p class="muted">Confirm this photo as an item. Remaining drafts stay queued.</p><div class="draft-photos">${(item?.photoPaths ?? [item?.photoPath]).filter(Boolean).map((path, index) => `<div class="draft-photo-row"><img class="draft-photo" data-draft-photo="${escapeHtml(path)}" alt="Draft photo ${index + 1}"><button type="button" data-move-photo-up="${index}" ${index === 0 ? "disabled" : ""}>Move up</button><button type="button" data-move-photo-down="${index}" ${index === (item?.photoPaths?.length ?? 1) - 1 ? "disabled" : ""}>Move down</button></div>`).join("")}</div><label>Name <span class="optional">optional</span><input name="name" autofocus placeholder="Optional name" value="${escapeHtml(item?.name ?? "")}"></label><label>Notes <span class="optional">optional</span><textarea name="notes" rows="3">${escapeHtml(item?.notes ?? "")}</textarea></label><label>Desired quantity<input name="quantity" type="number" min="1" value="${item?.desiredQuantity ?? 10}" required></label><label>Rotate primary photo<input name="rotation" type="number" min="0" max="270" step="90" value="0"></label><menu><button type="button" data-action="discard-draft">Discard</button><button type="button" data-action="merge-draft">Merge next photo</button><button type="button" data-action="cancel-dialog">Later</button><button class="button button-primary" type="submit">Confirm item</button></menu></form>`,
    purchase: `<form method="dialog" data-form="purchase" data-purchase-id="${item?.id ?? ""}" data-item-id="${item?.itemId ?? ""}"><h2>${item ? "Edit purchase" : "Add purchase"}</h2><label>Quantity<input name="quantity" type="number" min="1" required value="${item?.quantity ?? 1}"></label><label>Store<input name="store" value="${escapeHtml(item?.store ?? "")}" placeholder="Optional store"></label><label>Total paid <span class="optional">optional</span><input name="total" type="number" min="0" step="0.01" value="${item?.totalMinor == null ? "" : item.totalMinor / 100}"></label><label>Date<input name="date" type="date" value="${item?.date ?? new Date().toISOString().slice(0, 10)}"></label><label>Receipt ID <span class="optional">optional</span><input name="receiptId" value="${escapeHtml(item?.receiptId ?? "")}" placeholder="Paste receipt ID"></label><menu><button type="button" data-action="cancel-dialog">Cancel</button><button class="button button-primary" type="submit">Save purchase</button></menu></form>`,
    sighting: `<form method="dialog" data-form="sighting" data-sighting-id="${item?.id ?? ""}" data-item-id="${item?.itemId ?? item?.id ?? ""}"><h2>${item?.id ? "Edit price sighting" : "Price sighting"}</h2><label>Store<input name="store" value="${escapeHtml(item?.store ?? "")}" placeholder="Optional store"></label><label>Package price<input name="price" type="number" min="0" step="0.01" required value="${item?.packagePriceMinor == null ? "" : item.packagePriceMinor / 100}"></label><label>Package quantity<input name="quantity" type="number" min="1" step="1" required value="${item?.packageQuantity ?? 1}"></label><label>Date<input name="date" type="date" value="${item?.date ?? new Date().toISOString().slice(0, 10)}"></label><label>Notes<input name="notes" value="${escapeHtml(item?.notes ?? "")}"></label><menu><button type="button" data-action="cancel-dialog">Cancel</button><button class="button button-primary" type="submit">Save sighting</button></menu></form>`
  };
  dialog.innerHTML = forms[kind];
  dialog.showModal();
  if (kind === "item" || kind === "store") {
    fileStore.load().then((data) => {
      const field = dialog.querySelector(`[name="${kind === "item" ? "tagIds" : "tags"}"]`);
      if (!field) return;
      const selected = new Set((item?.[kind === "item" ? "tagIds" : "tagIds"] ?? []));
      const tags = data.tags.filter((tag) => tag.tripId === state.tripId && tag.status !== "archived" && tag.kind === "store-type");
      const options = tags.map((tag) => `<option value="${escapeHtml(tag.id)}" ${selected.has(tag.id) ? "selected" : ""}>${escapeHtml(tag.name)}</option>`).join("");
      field.outerHTML = `<select name="${kind === "item" ? "tagIds" : "tags"}" multiple size="${Math.min(5, Math.max(2, tags.length))}" aria-label="Store type tags">${options || "<option disabled>No store-type tags yet</option>"}</select>`;
      if (kind === "item") {
        const categoryTags = data.tags.filter((tag) => tag.tripId === state.tripId && tag.status !== "archived" && tag.kind === "category");
        const categorySelected = new Set(item?.tagIds ?? []);
        dialog.querySelector('[name="tagIds"]').insertAdjacentHTML("afterend", `<label>Item categories<select name="categoryTagIds" multiple size="${Math.min(5, Math.max(2, categoryTags.length))}" aria-label="Item categories">${categoryTags.map((tag) => `<option value="${escapeHtml(tag.id)}" ${categorySelected.has(tag.id) ? "selected" : ""}>${escapeHtml(tag.name)}</option>`).join("") || "<option disabled>No category tags yet</option>"}</select></label>`);
      }
    }).catch(reportError);
  }
  if (kind === "draft") {
    fileStore.load().then((data) => {
      const tags = data.tags.filter((tag) => tag.tripId === state.tripId && tag.status !== "archived" && ["store-type", "category"].includes(tag.kind));
      const selected = new Set(item?.tagIds ?? []);
      dialog.querySelector("menu").insertAdjacentHTML("beforebegin", `<label>Tags <span class="optional">optional</span><select name="tagIds" multiple size="${Math.min(6, Math.max(2, tags.length))}" aria-label="Draft tags">${tags.map((tag) => `<option value="${escapeHtml(tag.id)}" ${selected.has(tag.id) ? "selected" : ""}>${escapeHtml(tag.name)} (${escapeHtml(tag.kind)})</option>`).join("") || "<option disabled>No tags yet</option>"}</select></label>`);
    }).catch(reportError);
  }
  if (["receipt", "purchase", "sighting"].includes(kind)) {
    fileStore.load().then((data) => {
      const field = dialog.querySelector('[name="store"]');
      const stores = data.stores.filter((store) => store.tripId === state.tripId && store.status !== "archived");
      if (!field || !stores.length) return;
      const selected = item?.storeId ?? "";
      field.outerHTML = `<select name="storeId" aria-label="Saved store"><option value="">No saved store</option>${stores.map((store) => `<option value="${escapeHtml(store.id)}" ${selected === store.id ? "selected" : ""}>${escapeHtml(store.name)}${store.notes ? ` · ${escapeHtml(store.notes)}` : ""}</option>`).join("")}</select>`;
    }).catch(reportError);
  }
  if ((kind === "item" || kind === "receipt") && item) {
    const paths = item.photoPaths ?? (item.photoPath ? [item.photoPath] : []);
    if (paths.length) dialog.querySelector('[name="photo"]').insertAdjacentHTML("beforebegin", `<div class="editable-photos"><strong>Saved photos</strong>${paths.map((path, index) => `<span><img data-dialog-photo="${escapeHtml(path)}" alt="Saved photo ${index + 1}"><button type="button" data-remove-form-photo="${item.id}" data-photo-kind="${kind}" data-photo-index="${index}" ${paths.length === 1 ? "disabled title=\"At least one photo is required\"" : ""}>Remove</button></span>`).join("")}</div>`);
    for (const image of dialog.querySelectorAll("[data-dialog-photo]")) fileStore.photoUrl(image.dataset.dialogPhoto).then((url) => { image.src = url; }).catch(reportError);
  }
  for (const image of dialog.querySelectorAll("[data-photo], [data-draft-photo]")) fileStore.photoUrl(image.dataset.photo ?? image.dataset.draftPhoto).then((url) => { image.src = url; }).catch(reportError);
}

async function saveForm(form) {
  if (!fileStore.hasFolder()) throw new Error("Choose a Riceball folder before saving");
  const data = await load();
  const values = new FormData(form);
  const type = form.dataset.form;
  if (type === "trip") {
    const createdAt = timestamp();
    const tripId = form.dataset.tripId;
    const trip = tripId ? data.trips.find((candidate) => candidate.id === tripId) : { id: identifier(), status: "active", createdAt };
    if (!trip) throw new Error("The trip no longer exists");
    trip.name = values.get("name").trim();
    trip.currency = values.get("currency").trim().toUpperCase();
    trip.updatedAt = createdAt;
    if (!tripId) data.trips.push(trip);
    await fileStore.save(data);
    state.tripId = trip.id;
  }
  if (type === "item") {
    const createdAt = timestamp();
    const itemId = form.dataset.itemId;
    const item = itemId ? data.items.find((candidate) => candidate.id === itemId) : { id: identifier(), tripId: state.tripId, status: "active", createdAt };
    if (!item) throw new Error("The item no longer exists");
    item.name = values.get("name").trim() || "Untitled item";
    item.notes = values.get("notes").trim();
    item.desiredQuantity = Number(values.get("quantity"));
    item.tagIds = [...values.getAll("tagIds"), ...values.getAll("categoryTagIds")].flatMap((value) => String(value).split(",")).map((tag) => tag.trim()).filter(Boolean);
    if (!Number.isInteger(item.desiredQuantity) || item.desiredQuantity < 1) throw new Error("Desired quantity must be a positive whole number");
    if (item.tagIds.some((tagId) => !data.tags.some((tag) => tag.id === tagId && tag.tripId === state.tripId && tag.status !== "archived" && ["store-type", "category"].includes(tag.kind)))) throw new Error("One or more item tags are invalid");
    item.updatedAt = createdAt;
    const photos = values.getAll("photo").filter((photo) => photo?.size);
    if (!itemId && !photos.length) throw new Error("Select at least one photo for a new item");
    if (photos.length > 1 && !itemId) {
      const paths = await Promise.all(photos.map((photo, index) => fileStore.savePhoto(photo, `${item.id}-${index}`)));
      data.drafts.push(...paths.map((path) => ({ id: identifier(), tripId: state.tripId, status: "draft", name: "", notes: "", desiredQuantity: item.desiredQuantity, photoPath: path, photoPaths: [path], createdAt, updatedAt: createdAt })));
      await fileStore.save(data);
      dialog.close();
      render();
      return;
    }
    if (photos.length) {
      item.photoPaths = await Promise.all(photos.map((photo, index) => fileStore.savePhoto(photo, `${item.id}-${index}`)));
      item.photoPath = item.photoPaths[0];
    }
    if (!itemId) data.items.push(item);
    await fileStore.save(data);
  }
  if (type === "receipt") {
    const total = values.get("total").trim();
    const createdAt = timestamp();
    const receiptId = form.dataset.receiptId;
    const receipt = receiptId ? data.receipts.find((candidate) => candidate.id === receiptId) : { id: identifier(), tripId: state.tripId, createdAt };
    if (!receipt) throw new Error("The receipt no longer exists");
    receipt.totalMinor = total ? Math.round(Number(total) * 100) : null;
    receipt.storeId = values.get("storeId") || undefined;
    receipt.store = values.get("store")?.trim() ?? "";
    receipt.date = values.get("date");
    receipt.notes = values.get("notes").trim();
    receipt.purchaseIds = values.get("purchaseIds").split(",").map((id) => id.trim()).filter((id) => data.purchases.some((purchase) => purchase.id === id));
    for (const purchase of data.purchases) if (purchase.receiptId === receipt.id && !receipt.purchaseIds.includes(purchase.id)) delete purchase.receiptId;
    for (const purchaseId of receipt.purchaseIds) { const purchase = data.purchases.find((candidate) => candidate.id === purchaseId); if (purchase) purchase.receiptId = receipt.id; }
    receipt.splits = values.get("splits").split(",").map((entry) => { const [type, amount] = entry.split(":"); return { type: type?.trim() || "Uncategorized", amountMinor: Math.round(Number(amount) * 100) }; }).filter((split) => split.type && Number.isFinite(split.amountMinor));
    receipt.updatedAt = createdAt;
    const photos = values.getAll("photo").filter((photo) => photo?.size);
    if (!receiptId && !photos.length) throw new Error("Select a primary photo for a new receipt");
    if (photos.length) {
      receipt.photoPaths = await Promise.all(photos.map((photo, index) => fileStore.savePhoto(photo, `${receipt.id}-${index}`)));
      receipt.photoPath = receipt.photoPaths[0];
    }
    if (!receiptId) data.receipts.push(receipt);
    await fileStore.save(data);
  }
  if (type === "store") {
    const createdAt = timestamp();
    const storeId = form.dataset.storeId;
    const store = storeId ? data.stores.find((candidate) => candidate.id === storeId) : { id: identifier(), tripId: state.tripId, status: "active", createdAt };
    if (!store) throw new Error("The store no longer exists");
    store.name = values.get("name").trim();
    store.notes = values.get("notes").trim();
    store.tagIds = values.getAll("tags").flatMap((value) => String(value).split(",")).map((tag) => tag.trim()).filter(Boolean);
    if (store.tagIds.some((tagId) => !data.tags.some((tag) => tag.id === tagId && tag.tripId === state.tripId && tag.status !== "archived" && tag.kind === "store-type"))) throw new Error("One or more store-type tags are invalid");
    store.updatedAt = createdAt;
    if (!storeId) data.stores.push(store);
    await fileStore.save(data);
  }
  if (type === "tag") {
    const createdAt = timestamp();
    const tagId = form.dataset.tagId;
    const tag = tagId ? data.tags.find((candidate) => candidate.id === tagId) : { id: identifier(), tripId: state.tripId, status: "active", createdAt };
    if (!tag) throw new Error("The tag no longer exists");
    tag.name = values.get("name").trim();
    tag.kind = values.get("kind");
    tag.parentId = values.get("parentId").trim() || null;
    if (tag.parentId) {
      const parent = data.tags.find((candidate) => candidate.id === tag.parentId);
      if (!parent || parent.tripId !== state.tripId || parent.kind !== tag.kind || parent.id === tag.id) throw new Error("Parent tag must be another tag of the same kind in this trip");
      const seen = new Set([tag.id]);
      let cursor = parent;
      while (cursor) {
        if (seen.has(cursor.id)) throw new Error("Tag parent relationships cannot contain a cycle");
        seen.add(cursor.id);
        cursor = cursor.parentId ? data.tags.find((candidate) => candidate.id === cursor.parentId) : null;
      }
    }
    tag.updatedAt = createdAt;
    if (!tagId) data.tags.push(tag);
    await fileStore.save(data);
  }
  if (type === "purchaseType") {
    const createdAt = timestamp();
    const typeId = form.dataset.purchaseTypeId;
    const purchaseType = typeId ? data.purchaseTypes.find((candidate) => candidate.id === typeId) : { id: identifier(), tripId: state.tripId, status: "active", createdAt };
    if (!purchaseType) throw new Error("The purchase type no longer exists");
    purchaseType.name = values.get("name").trim();
    purchaseType.updatedAt = createdAt;
    if (!typeId) data.purchaseTypes.push(purchaseType);
    await fileStore.save(data);
  }
  if (type === "purchase") {
    const createdAt = timestamp();
    const purchaseId = form.dataset.purchaseId;
    const purchase = purchaseId ? data.purchases.find((candidate) => candidate.id === purchaseId) : { id: identifier(), itemId: form.dataset.itemId, quick: false, createdAt };
    if (!purchase) throw new Error("The purchase no longer exists");
    purchase.quantity = Number(values.get("quantity"));
    purchase.storeId = values.get("storeId") || undefined;
    purchase.store = values.get("store")?.trim() ?? "";
    const total = values.get("total").trim();
    purchase.totalMinor = total ? Math.round(Number(total) * 100) : null;
    purchase.date = values.get("date");
    const purchaseItem = data.items.find((candidate) => candidate.id === purchase.itemId);
    const receiptId = values.get("receiptId").trim();
    if (receiptId && !data.receipts.some((receipt) => receipt.id === receiptId && receipt.tripId === purchaseItem?.tripId)) throw new Error("Receipt link is invalid");
    for (const receipt of data.receipts) receipt.purchaseIds = (receipt.purchaseIds ?? []).filter((id) => id !== purchase.id);
    purchase.receiptId = receiptId || undefined;
    if (receiptId) {
      const receipt = data.receipts.find((candidate) => candidate.id === receiptId);
      receipt.purchaseIds = [...new Set([...(receipt.purchaseIds ?? []), purchase.id])];
    }
    purchase.updatedAt = createdAt;
    if (purchaseItem) purchaseItem.updatedAt = createdAt;
    if (!purchaseId) data.purchases.push(purchase);
    await fileStore.save(data);
  }
  if (type === "sighting") {
    const createdAt = timestamp();
    const price = Number(values.get("price"));
    const quantity = Number(values.get("quantity"));
    if (!(price >= 0) || !(quantity > 0)) throw new Error("Package price and quantity must be valid positive values");
    const sightingId = form.dataset.sightingId;
    const sighting = sightingId ? data.priceSightings.find((candidate) => candidate.id === sightingId) : { id: identifier(), itemId: form.dataset.itemId, createdAt };
    if (!sighting) throw new Error("The price sighting no longer exists");
    sighting.storeId = values.get("storeId") || undefined;
    sighting.store = values.get("store")?.trim() ?? "";
    sighting.packagePriceMinor = Math.round(price * 100);
    sighting.packageQuantity = quantity;
    sighting.comparableMinor = Math.round((price * 100) / quantity);
    sighting.date = values.get("date");
    sighting.notes = values.get("notes").trim();
    sighting.updatedAt = createdAt;
    if (!sightingId) data.priceSightings.push(sighting);
    const sightingItem = data.items.find((candidate) => candidate.id === form.dataset.itemId);
    if (sightingItem) sightingItem.updatedAt = createdAt;
    await fileStore.save(data);
  }
  if (type === "draft") {
    const draft = data.drafts.find((candidate) => candidate.id === form.dataset.draftId);
    if (!draft) throw new Error("The draft no longer exists");
    const createdAt = timestamp();
    const rotation = Number(values.get("rotation"));
    const draftPaths = draft.photoPaths ?? [draft.photoPath];
    const transformedPath = rotation ? await fileStore.transformPhoto(draftPaths[0], identifier(), rotation) : draftPaths[0];
    if (rotation && transformedPath) await fileStore.deletePhoto(draftPaths[0]).catch(() => null);
    const item = { id: identifier(), tripId: draft.tripId, name: values.get("name").trim() || "Untitled item", notes: values.get("notes").trim(), desiredQuantity: Number(values.get("quantity")), tagIds: values.getAll("tagIds"), status: "active", photoPath: transformedPath, photoPaths: [transformedPath, ...draftPaths.slice(1)], createdAt, updatedAt: createdAt, rotation };
    data.items.push(item);
    data.drafts.splice(data.drafts.indexOf(draft), 1);
    await fileStore.save(data);
  }
  dialog.close();
  render();
}

app.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action], [data-subpage], [data-receipt-filter], [data-remove-form-photo], [data-open-trip], [data-increment], [data-decrement], [data-delete-item], [data-edit-item], [data-edit-receipt], [data-delete-receipt], [data-edit-store], [data-delete-store], [data-edit-tag], [data-delete-tag], [data-new-purchase], [data-edit-purchase], [data-delete-purchase], [data-new-sighting], [data-edit-sighting], [data-delete-sighting], [data-edit-purchase-type], [data-delete-purchase-type], [data-review-draft], [data-move-photo-up], [data-move-photo-down], [data-restore-trip], [data-delete-trip], [data-restore-item], [data-delete-archived-item]");
  if (!target) return;
  if (target.dataset.action === "cycle-sort" && sortLongPressTriggered) { sortLongPressTriggered = false; return; }
  if (target.dataset.receiptFilter) { state.receiptFilterType = target.dataset.receiptFilter === "__all__" ? "" : target.dataset.receiptFilter; state.pendingReceipts = false; state.subpage = "receipts"; render(); return; }
  if (target.dataset.removeFormPhoto) {
    const data = await load();
    const collection = target.dataset.photoKind === "receipt" ? data.receipts : data.items;
    const record = collection.find((candidate) => candidate.id === target.dataset.removeFormPhoto);
    const paths = record?.photoPaths ?? (record?.photoPath ? [record.photoPath] : []);
    const index = Number(target.dataset.photoIndex);
    if (!record || paths.length <= 1 || !paths[index]) return;
    if (!window.confirm("Remove this saved photo?")) return;
    await fileStore.deletePhoto(paths[index]).catch(() => null);
    record.photoPaths = paths.filter((_, pathIndex) => pathIndex !== index);
    record.photoPath = record.photoPaths[0];
    record.updatedAt = timestamp();
    await fileStore.save(data);
    dialog.close();
    openForm(target.dataset.photoKind, record);
    return;
  }
  if (target.dataset.action === "choose-folder") {
    try {
      const data = fileStore.hasSavedFolder() ? await fileStore.reconnectFolder() : await fileStore.chooseFolder();
      state.columns = Number(data.preferences?.columns ?? state.columns);
      state.sort = data.preferences?.sort ?? state.sort;
      state.sortDirection = data.preferences?.sortDirection ?? state.sortDirection;
      state.tripId = data.trips.find((trip) => trip.status !== "archived")?.id ?? null;
      await fileStore.setLastTripId(state.tripId);
      render();
    } catch (error) { reportError(error); }
    return;
  }
  if (target.dataset.action === "export-data") {
    const blob = new Blob([fileStore.export()], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `riceball-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }
  if (target.dataset.action === "import-data") {
    if (!fileStore.hasFolder()) return reportError(new Error("Choose a Riceball folder before restoring a backup"));
    restoreInput.click();
    return;
  }
  if (target.dataset.action === "backup-folder") {
    try { await fileStore.backupToFolder(); window.alert("Riceball folder backup completed."); } catch (error) { reportError(error); }
    return;
  }
  if (target.dataset.openTrip) { state.tripId = target.dataset.openTrip; state.subpage = "overview"; state.showArchived = false; fileStore.setLastTripId(state.tripId).catch(reportError); render(); return; }
  if (target.dataset.action === "home") { state.tripId = null; state.subpage = "overview"; state.tripSearch = ""; state.showArchived = false; render(); return; }
  if (target.dataset.subpage) { state.subpage = target.dataset.subpage; state.pendingReceipts = false; render(); return; }
  if (target.dataset.action === "toggle-archived-trips") { state.showArchived = !state.showArchived; state.tripId = null; render(); return; }
  if (target.dataset.action === "toggle-archived-items") { state.showArchived = !state.showArchived; render(); return; }
  if (target.dataset.action === "toggle-pending-receipts") { state.pendingReceipts = !state.pendingReceipts; state.subpage = "receipts"; render(); return; }
  if (target.dataset.action === "toggle-sort-direction") { state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc"; load().then((data) => { data.preferences.sortDirection = state.sortDirection; return fileStore.save(data); }).then(render).catch(reportError); return; }
  if (target.dataset.action === "clear-filters") { state.search = ""; state.tagId = ""; state.storeTypeTagId = ""; state.categoryTagId = ""; state.storeId = ""; state.unfulfilledOnly = true; state.columns = 4; state.sort = "name"; state.sortDirection = "asc"; render(); return; }
  if (target.dataset.action === "toggle-unfulfilled") { state.unfulfilledOnly = !state.unfulfilledOnly; render(); return; }
  if (target.dataset.action === "cycle-columns") { state.columns = state.columns >= 5 ? 1 : state.columns + 1; render(); return; }
  if (target.dataset.action === "cycle-sort") { const options = [["name", "asc"], ["name", "desc"], ["activity", "asc"], ["activity", "desc"], ["remaining", "asc"], ["remaining", "desc"]]; const index = options.findIndex(([sort, direction]) => sort === state.sort && direction === state.sortDirection); [state.sort, state.sortDirection] = options[(index + 1) % options.length]; render(); return; }
  if (target.dataset.action === "new-trip") return openForm("trip");
  if (target.dataset.action === "edit-trip") {
    const data = await load();
    const trip = data.trips.find((candidate) => candidate.id === state.tripId);
    if (trip) openForm("trip", trip);
    return;
  }
  if (target.dataset.action === "archive-trip") {
    if (!window.confirm("Archive this trip?")) return;
    const data = await load();
    const trip = data.trips.find((candidate) => candidate.id === state.tripId);
    if (trip) { trip.status = "archived"; trip.updatedAt = timestamp(); await fileStore.save(data); state.tripId = null; render(); }
    return;
  }
  if (target.dataset.restoreTrip || target.dataset.deleteTrip) {
    const data = await load();
    const trip = data.trips.find((candidate) => candidate.id === (target.dataset.restoreTrip ?? target.dataset.deleteTrip));
    if (!trip) return;
    if (target.dataset.restoreTrip) trip.status = "active";
    else if (window.confirm("Permanently delete this trip and all related records?")) {
      const tripId = trip.id;
      const itemIds = new Set(data.items.filter((item) => item.tripId === tripId).map((item) => item.id));
      const photoPaths = data.items.filter((item) => item.tripId === tripId).flatMap((item) => item.photoPaths ?? (item.photoPath ? [item.photoPath] : []));
      photoPaths.push(...data.receipts.filter((receipt) => receipt.tripId === tripId).flatMap((receipt) => receipt.photoPaths ?? (receipt.photoPath ? [receipt.photoPath] : [])));
      await Promise.all(photoPaths.map((path) => fileStore.deletePhoto(path).catch(() => null)));
      data.trips.splice(data.trips.indexOf(trip), 1);
      data.items = data.items.filter((item) => item.tripId !== tripId);
      data.purchases = data.purchases.filter((purchase) => !itemIds.has(purchase.itemId));
      data.priceSightings = data.priceSightings.filter((sighting) => !itemIds.has(sighting.itemId));
      data.receipts = data.receipts.filter((receipt) => receipt.tripId !== tripId);
      data.stores = data.stores.filter((store) => store.tripId !== tripId);
      data.tags = data.tags.filter((tag) => tag.tripId !== tripId);
    }
    trip.updatedAt = timestamp();
    await fileStore.save(data);
    render();
    return;
  }
  if (target.dataset.action === "new-item") {
    const data = await load();
    const draft = data.drafts.find((candidate) => candidate.tripId === state.tripId && candidate.status === "draft");
    if (draft && window.confirm("Resume the next photo draft? Choose Cancel to start a new import.")) openForm("draft", draft);
    else openForm("item");
    return;
  }
  if (target.dataset.action === "new-receipt") return openForm("receipt");
  if (target.dataset.action === "new-store") return openForm("store");
  if (target.dataset.action === "new-tag") return openForm("tag");
  if (target.dataset.action === "new-purchase-type") return openForm("purchaseType");
  if (target.dataset.reviewDraft) {
    const data = await load();
    const draft = data.drafts.find((candidate) => candidate.id === target.dataset.reviewDraft);
    if (draft) openForm("draft", draft);
    return;
  }
  if (target.dataset.action === "discard-draft") {
    const form = target.closest("form");
    const data = await load();
    const draft = data.drafts.find((candidate) => candidate.id === form.dataset.draftId);
    if (draft) { await Promise.all((draft.photoPaths ?? [draft.photoPath]).filter(Boolean).map((path) => fileStore.deletePhoto(path).catch(() => null))); data.drafts.splice(data.drafts.indexOf(draft), 1); await fileStore.save(data); }
    dialog.close();
    render();
    return;
  }
  if (target.dataset.action === "merge-draft") {
    const form = target.closest("form");
    const data = await load();
    const current = data.drafts.find((candidate) => candidate.id === form.dataset.draftId);
    const next = data.drafts.find((candidate) => candidate.tripId === current?.tripId && candidate.id !== current.id && candidate.status === "draft");
    if (!current || !next) return reportError(new Error("There is no other queued draft to merge"));
    current.photoPaths = [...(current.photoPaths ?? [current.photoPath]), ...(next.photoPaths ?? [next.photoPath])];
    current.updatedAt = timestamp();
    data.drafts.splice(data.drafts.indexOf(next), 1);
    await fileStore.save(data);
    dialog.close();
    openForm("draft", current);
    return;
  }
  if (target.dataset.movePhotoUp || target.dataset.movePhotoDown) {
    const form = target.closest("form");
    const data = await load();
    const draft = data.drafts.find((candidate) => candidate.id === form.dataset.draftId);
    const index = Number(target.dataset.movePhotoUp ?? target.dataset.movePhotoDown);
    const nextIndex = target.dataset.movePhotoUp ? index - 1 : index + 1;
    if (!draft || nextIndex < 0 || nextIndex >= draft.photoPaths.length) return;
    [draft.photoPaths[index], draft.photoPaths[nextIndex]] = [draft.photoPaths[nextIndex], draft.photoPaths[index]];
    draft.photoPath = draft.photoPaths[0];
    draft.updatedAt = timestamp();
    await fileStore.save(data);
    dialog.close();
    openForm("draft", draft);
    return;
  }
  if (target.dataset.newPurchase || target.dataset.editPurchase || target.dataset.deletePurchase) {
    const data = await load();
    const purchaseId = target.dataset.editPurchase ?? target.dataset.deletePurchase;
    const purchase = purchaseId ? data.purchases.find((candidate) => candidate.id === purchaseId) : { itemId: target.dataset.newPurchase };
    if (!purchase) return;
    if (target.dataset.newPurchase || target.dataset.editPurchase) openForm("purchase", purchase);
    else if (window.confirm("Delete this purchase?")) { data.purchases.splice(data.purchases.indexOf(purchase), 1); for (const receipt of data.receipts) receipt.purchaseIds = (receipt.purchaseIds ?? []).filter((id) => id !== purchase.id); await fileStore.save(data); render(); }
    return;
  }
  if (target.dataset.newSighting || target.dataset.editSighting || target.dataset.deleteSighting) {
    const data = await load();
    const sightingId = target.dataset.editSighting ?? target.dataset.deleteSighting;
    const sighting = sightingId ? data.priceSightings.find((candidate) => candidate.id === sightingId) : { itemId: target.dataset.newSighting };
    if (!sighting) return;
    if (target.dataset.newSighting || target.dataset.editSighting) openForm("sighting", sighting);
    else if (window.confirm("Delete this price sighting?")) { data.priceSightings.splice(data.priceSightings.indexOf(sighting), 1); const item = data.items.find((candidate) => candidate.id === sighting.itemId); if (item) item.updatedAt = timestamp(); await fileStore.save(data); render(); }
    return;
  }
  if (target.dataset.deleteItem) {
    if (!window.confirm("Delete this item from the shopping list?")) return;
    const data = await load();
    const item = data.items.find((candidate) => candidate.id === target.dataset.deleteItem);
    if (!item) return;
    item.status = "archived";
    item.updatedAt = timestamp();
    const removedPurchaseIds = new Set(data.purchases.filter((purchase) => purchase.itemId === item.id).map((purchase) => purchase.id));
    data.purchases = data.purchases.filter((purchase) => !removedPurchaseIds.has(purchase.id));
    for (const receipt of data.receipts) receipt.purchaseIds = (receipt.purchaseIds ?? []).filter((id) => !removedPurchaseIds.has(id));
    await fileStore.save(data);
    render();
    return;
  }
  if (target.dataset.restoreItem || target.dataset.deleteArchivedItem) {
    const data = await load();
    const item = data.items.find((candidate) => candidate.id === (target.dataset.restoreItem ?? target.dataset.deleteArchivedItem));
    if (!item) return;
    if (target.dataset.restoreItem) item.status = "active";
    else if (window.confirm("Permanently delete this archived item and its purchases?")) {
      await Promise.all((item.photoPaths ?? (item.photoPath ? [item.photoPath] : [])).map((path) => fileStore.deletePhoto(path).catch(() => null)));
      data.items.splice(data.items.indexOf(item), 1);
      const removedPurchaseIds = new Set(data.purchases.filter((purchase) => purchase.itemId === item.id).map((purchase) => purchase.id));
      data.purchases = data.purchases.filter((purchase) => !removedPurchaseIds.has(purchase.id));
      for (const receipt of data.receipts) receipt.purchaseIds = (receipt.purchaseIds ?? []).filter((id) => !removedPurchaseIds.has(id));
      data.priceSightings = data.priceSightings.filter((sighting) => sighting.itemId !== item.id);
    }
    item.updatedAt = timestamp();
    await fileStore.save(data);
    render();
    return;
  }
  if (target.dataset.editReceipt || target.dataset.deleteReceipt) {
    const data = await load();
    const receiptId = target.dataset.editReceipt ?? target.dataset.deleteReceipt;
    const receipt = data.receipts.find((candidate) => candidate.id === receiptId);
    if (!receipt) return;
    if (target.dataset.editReceipt) openForm("receipt", receipt);
    else if (window.confirm("Delete this receipt?")) { data.receipts.splice(data.receipts.indexOf(receipt), 1); for (const purchase of data.purchases) if (purchase.receiptId === receipt.id) delete purchase.receiptId; await fileStore.save(data); render(); }
    return;
  }
  if (target.dataset.editStore || target.dataset.deleteStore || target.dataset.editTag || target.dataset.deleteTag) {
    const data = await load();
    const collection = target.dataset.editStore || target.dataset.deleteStore ? data.stores : data.tags;
    const id = target.dataset.editStore ?? target.dataset.deleteStore ?? target.dataset.editTag ?? target.dataset.deleteTag;
    const record = collection.find((candidate) => candidate.id === id);
    if (!record) return;
    if (target.dataset.editStore) openForm("store", record);
    else if (target.dataset.editTag) openForm("tag", record);
    else if (window.confirm("Delete this record?")) {
      if (target.dataset.deleteTag) {
        const replacementId = window.prompt("Optional replacement parent tag ID for its children:", record.parentId ?? "")?.trim() || null;
        if (replacementId) {
          const replacement = data.tags.find((candidate) => candidate.id === replacementId && candidate.status !== "archived");
          if (!replacement || replacement.tripId !== record.tripId || replacement.kind !== record.kind || replacement.id === record.id) return reportError(new Error("Replacement parent must be an active tag of the same kind in this trip"));
        }
        for (const child of data.tags) if (child.parentId === record.id) { child.parentId = replacementId; child.updatedAt = timestamp(); }
        for (const item of data.items) item.tagIds = (item.tagIds ?? []).filter((tagId) => tagId !== record.id);
        for (const store of data.stores) store.tagIds = (store.tagIds ?? []).filter((tagId) => tagId !== record.id);
      }
      record.status = "archived";
      record.updatedAt = timestamp();
      await fileStore.save(data);
      render();
    }
    return;
  }
  if (target.dataset.editPurchaseType || target.dataset.deletePurchaseType) {
    const data = await load();
    const type = data.purchaseTypes.find((candidate) => candidate.id === (target.dataset.editPurchaseType ?? target.dataset.deletePurchaseType));
    if (!type) return;
    if (target.dataset.editPurchaseType) openForm("purchaseType", type);
    else if (window.confirm("Delete this purchase type?")) { type.status = "archived"; type.updatedAt = timestamp(); await fileStore.save(data); render(); }
    return;
  }
  if (target.dataset.editItem) {
    const data = await load();
    const item = data.items.find((candidate) => candidate.id === target.dataset.editItem);
    if (item) openForm("item", item);
    return;
  }
  const itemId = target.dataset.increment ?? target.dataset.decrement;
  if (itemId) {
    try {
      const data = await load();
      const delta = target.dataset.increment ? 1 : -1;
      const existing = data.purchases.find((purchase) => purchase.itemId === itemId && purchase.quick === true);
      if (existing && existing.quantity + delta > 0) existing.quantity += delta;
      else if (existing) data.purchases.splice(data.purchases.indexOf(existing), 1);
      else if (delta > 0) data.purchases.push({ id: identifier(), itemId, quantity: 1, quick: true, createdAt: timestamp(), updatedAt: timestamp() });
      const item = data.items.find((candidate) => candidate.id === itemId);
      if (item) item.updatedAt = timestamp();
      await fileStore.save(data);
      render();
    } catch (error) { reportError(error); }
  }
});
document.addEventListener("toggle", (event) => {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement) || !details.matches(".top-actions") || !details.open) return;
  const menu = details.querySelector(".top-action-list");
  const trigger = details.querySelector("summary");
  if (!menu || !trigger) return;
  const triggerBox = trigger.getBoundingClientRect();
  menu.style.top = `${Math.min(triggerBox.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
  menu.style.left = `${Math.max(8, Math.min(triggerBox.left, window.innerWidth - menu.offsetWidth - 8))}px`;
}, true);
document.addEventListener("click", (event) => {
  if (!event.target.closest(".top-actions")) document.querySelectorAll(".top-actions[open]").forEach((menu) => menu.removeAttribute("open"));
  if (itemActionsDialog.open && event.target === itemActionsDialog) itemActionsDialog.close();
  if (sortMenuDialog.open && event.target === sortMenuDialog) sortMenuDialog.close();
}, true);

let searchTimer;
let longPressTimer;
let sortLongPressTimer;
let sortLongPressTriggered = false;
app.addEventListener("pointerdown", (event) => {
  const sortButton = event.target.closest('[data-action="cycle-sort"]');
  if (sortButton) { sortLongPressTimer = window.setTimeout(() => { sortLongPressTriggered = true; openSortMenu(); }, 550); return; }
  const card = event.target.closest("[data-long-press-item]");
  if (!card || event.target.closest("button, input, select, textarea, a")) return;
  longPressTimer = window.setTimeout(() => openItemActions(card.dataset.longPressItem), 550);
});
for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) app.addEventListener(eventName, () => { window.clearTimeout(longPressTimer); window.clearTimeout(sortLongPressTimer); });
app.addEventListener("contextmenu", (event) => {
  const card = event.target.closest("[data-long-press-item]");
  if (!card || event.target.closest("button, input, select, textarea, a")) return;
  event.preventDefault();
  openItemActions(card.dataset.longPressItem);
});
app.addEventListener("click", async (event) => {
  const image = event.target.closest("[data-view-photo]");
  if (!image) return;
  try {
    const url = await fileStore.photoUrl(image.dataset.viewPhoto);
    photoViewerDialog.innerHTML = `<button class="photo-viewer-close" type="button" data-close-photo-viewer aria-label="Close photo viewer">×</button><img src="${url}" alt="${image.alt}">`;
    photoViewerDialog.showModal();
  } catch (error) { reportError(error); }
});
photoViewerDialog.addEventListener("click", (event) => { if (event.target.closest("[data-close-photo-viewer]") || event.target === photoViewerDialog) photoViewerDialog.close(); });
itemActionsDialog.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-item-action]");
  if (!target) return;
  const action = target.dataset.itemAction;
  const itemId = target.dataset.itemId;
  itemActionsDialog.close();
  if (action === "cancel") return;
  const data = await load();
  const item = data.items.find((candidate) => candidate.id === itemId);
  if (!item) return;
  if (action === "edit") return openForm("item", item);
  if (action === "purchase") return openForm("purchase", { itemId });
  if (action === "sighting") return openForm("sighting", { itemId });
  if (action === "archive" && window.confirm("Archive this item?")) { item.status = "archived"; item.updatedAt = timestamp(); const removedPurchaseIds = new Set(data.purchases.filter((purchase) => purchase.itemId === item.id).map((purchase) => purchase.id)); data.purchases = data.purchases.filter((purchase) => !removedPurchaseIds.has(purchase.id)); for (const receipt of data.receipts) receipt.purchaseIds = (receipt.purchaseIds ?? []).filter((id) => !removedPurchaseIds.has(id)); await fileStore.save(data); render(); }
});
errorOverlay.addEventListener("click", (event) => {
  if (!event.target.closest("[data-close-errors]")) return;
  errorOverlay.dataset.closed = "true";
  renderErrors();
});
app.addEventListener("input", (event) => {
  if (event.target.matches("[data-trip-search]")) { state.tripSearch = event.target.value; render(); return; }
  if (!event.target.matches("[data-search]")) return;
  state.search = event.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    try {
      const data = await load();
      render();
    } catch (error) { reportError(error); }
  }, 250);
});
app.addEventListener("change", (event) => {
  if (event.target.matches("[data-unfulfilled]")) state.unfulfilledOnly = event.target.checked;
  if (event.target.matches("[data-tag]")) state.tagId = event.target.value;
  if (event.target.matches("[data-store-type-tag]")) state.storeTypeTagId = event.target.value;
  if (event.target.matches("[data-category-tag]")) state.categoryTagId = event.target.value;
  if (event.target.matches("[data-store]")) state.storeId = event.target.value;
  if (event.target.matches("[data-sort]")) [state.sort, state.sortDirection] = event.target.value.split("-");
  if (event.target.matches("[data-columns]")) state.columns = Number(event.target.value);
  load().then(async (data) => { data.preferences.columns = state.columns; data.preferences.sort = state.sort; data.preferences.sortDirection = state.sortDirection; return fileStore.save(data); }).then(render).catch(reportError);
});
dialog.addEventListener("submit", (event) => { event.preventDefault(); saveForm(event.target).catch(reportError); });
dialog.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="cancel-dialog"]')) dialog.close();
});
sortMenuDialog.addEventListener("submit", (event) => {
  event.preventDefault();
  [state.sort, state.sortDirection] = new FormData(event.target).get("sort").split("-");
  sortMenuDialog.close();
  render();
});
sortMenuDialog.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="cancel-dialog"]')) sortMenuDialog.close();
});
restoreInput.addEventListener("change", async () => {
  const file = restoreInput.files?.[0];
  if (!file) return;
  try {
    if (!window.confirm("Replace the selected Riceball folder data with this backup?")) return;
    await fileStore.import(await file.text());
    await render();
  } catch (error) { reportError(error); }
  restoreInput.value = "";
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { finalizeQuickPurchases().then(() => fileStore.flush()).catch(reportError); } });
window.addEventListener("pagehide", () => { fileStore.flush().catch(reportError); });
fileStore.restoreFolder().catch(reportError).finally(() => render().catch(reportError));
