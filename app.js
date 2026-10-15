const DB_NAME = "signal-desk";
const STORE_NAME = "vault";
const RECORD_KEY = "primary";
const ENVELOPE_VERSION = 1;
const PBKDF2_ITERATIONS = 600000;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const state = {
  envelope: null,
  key: null,
  vault: null,
  selectedId: null,
  query: "",
  passwordVisible: false,
  revealTimer: null,
  lockTimer: null,
  toastTimer: null,
  lastActivity: Date.now(),
  sync: { authenticated: false, email: "", revision: 0, remote: null, busy: false, queue: Promise.resolve() }
};

const els = {
  gate: $("#gate"), app: $("#app"), gateForm: $("#gate-form"), master: $("#master-password"),
  masterConfirm: $("#confirm-master-password"), masterConfirmLabel: $("#confirm-master-label"),
  masterLabel: $("#master-label"), gateHelp: $("#gate-help"), gateError: $("#gate-error"), gateSubmit: $("#gate-submit"),
  search: $("#search"), clearSearch: $("#clear-search"), results: $("#results"), count: $("#result-count"),
  context: $("#result-context"), empty: $("#empty-state"), workspace: $(".workspace"), detailEmpty: $("#detail-empty"),
  detailContent: $("#detail-content"), detailTitle: $("#detail-title"), detailDomain: $("#detail-domain"),
  detailMonogram: $("#detail-monogram"), detailUsername: $("#detail-username"), detailPassword: $("#detail-password"),
  detailUrl: $("#detail-url"), detailTags: $("#detail-tags"), detailNotes: $("#detail-notes"), detailUpdated: $("#detail-updated"),
  entryDialog: $("#entry-dialog"), entryForm: $("#entry-form"), settingsDialog: $("#settings-dialog"), syncDialog: $("#sync-dialog"),
  syncAuthForm: $("#sync-auth-form"), syncControls: $("#sync-controls"), syncConflict: $("#sync-conflict"), backupFile: $("#backup-file"),
  toast: $("#toast")
};

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomBytes(length = 16) {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function deriveKey(password, salt, iterations = PBKDF2_ITERATIONS) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptVault(vault, key, salt, iterations = PBKDF2_ITERATIONS) {
  const iv = randomBytes(12);
  const plaintext = encoder.encode(JSON.stringify(vault));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    version: ENVELOPE_VERSION,
    kdf: { name: "PBKDF2-SHA256", iterations, salt: bytesToBase64(salt) },
    cipher: { name: "AES-256-GCM", iv: bytesToBase64(iv) },
    payload: bytesToBase64(new Uint8Array(encrypted)),
    updatedAt: new Date().toISOString()
  };
}

async function decryptEnvelope(envelope, password) {
  if (!envelope || envelope.version !== ENVELOPE_VERSION) throw new Error("This vault version is not supported.");
  if (envelope.kdf?.name !== "PBKDF2-SHA256" || envelope.cipher?.name !== "AES-256-GCM") throw new Error("This backup uses unsupported encryption settings.");
  if (!Number.isSafeInteger(envelope.kdf.iterations) || envelope.kdf.iterations < 100000 || envelope.kdf.iterations > 2000000) throw new Error("This backup has unsafe key-derivation settings.");
  const salt = base64ToBytes(envelope.kdf.salt);
  const iv = base64ToBytes(envelope.cipher.iv);
  if (salt.byteLength < 16 || salt.byteLength > 64 || iv.byteLength !== 12) throw new Error("This backup has invalid encryption parameters.");
  if (typeof envelope.payload !== "string" || envelope.payload.length > 28 * 1024 * 1024) throw new Error("This backup payload is invalid.");
  const key = await deriveKey(password, salt, envelope.kdf.iterations);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    base64ToBytes(envelope.payload)
  );
  const vault = JSON.parse(decoder.decode(decrypted));
  if (!vault || !Array.isArray(vault.entries)) throw new Error("Vault data is invalid.");
  return { key, vault };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(RECORD_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function dbPut(value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, RECORD_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

function blankVault() {
  return { entries: [], settings: { autoLockMinutes: 5 }, createdAt: new Date().toISOString() };
}

async function persistVault() {
  if (!state.key || !state.vault || !state.envelope) throw new Error("Vault is locked.");
  const salt = base64ToBytes(state.envelope.kdf.salt);
  const next = await encryptVault(state.vault, state.key, salt, state.envelope.kdf.iterations);
  await dbPut(next);
  state.envelope = next;
  queueCloudUpload(next);
}

class ApiError extends Error {
  constructor(message, status, data = {}) { super(message); this.status = status; this.data = data; }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  let data = {};
  try { data = await response.json(); } catch { /* Empty or non-JSON response. */ }
  if (!response.ok) throw new ApiError(data.error || "The sync service could not complete that request.", response.status, data);
  return data;
}

function setSyncState(kind, title, detail) {
  $("#sync-state-title").textContent = title;
  $("#sync-state-detail").textContent = detail;
  $(".sync-state").dataset.state = kind;
  $("#sync-status-button").dataset.state = kind;
  $("#sync-mark-text").innerHTML = kind === "synced" ? "Encrypted sync<br>Up to date" : kind === "error" ? "Sync attention<br>Local copy is safe" : "Local only<br>Encrypted on this device";
}

function renderSyncAccount() {
  els.syncAuthForm.hidden = state.sync.authenticated;
  els.syncControls.hidden = !state.sync.authenticated;
  $("#sync-account-email").textContent = state.sync.email;
}

function setSyncBusy(busy) {
  state.sync.busy = busy;
  ["#sync-login", "#sync-signup", "#sync-now", "#sync-signout", "#use-cloud-copy", "#keep-browser-copy"].forEach((selector) => {
    const element = $(selector);
    if (element) element.disabled = busy;
  });
}

function showSyncMessage(message) {
  const element = $("#sync-auth-message");
  element.textContent = message;
  element.hidden = !message;
}

function sameEnvelope(first, second) {
  return Boolean(first && second && first.version === second.version && first.payload === second.payload && first.kdf?.salt === second.kdf?.salt && first.cipher?.iv === second.cipher?.iv);
}

async function fetchRemoteVault() {
  return apiRequest("/api/vault", { method: "GET" });
}

async function uploadEnvelope(envelope, expectedRevision = state.sync.revision) {
  const result = await apiRequest("/api/vault", { method: "PUT", body: JSON.stringify({ envelope, expectedRevision }) });
  state.sync.revision = result.revision;
  state.sync.remote = null;
  els.syncConflict.hidden = true;
  $("#sync-last-update").textContent = `Encrypted copy synchronized ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.updatedAt))}.`;
  setSyncState("synced", "Encrypted copy synchronized", "This browser and your cloud copy match.");
  return result;
}

function queueCloudUpload(envelope) {
  if (!state.sync.authenticated) return;
  state.sync.queue = state.sync.queue.then(async () => {
    try { await uploadEnvelope(envelope); }
    catch (error) {
      if (error.status === 409) {
        try {
          state.sync.remote = (await fetchRemoteVault()).vault;
          els.syncConflict.hidden = false;
          setSyncState("error", "Sync choice required", "Another browser saved a different encrypted copy.");
        } catch {
          setSyncState("error", "Could not compare encrypted copies", "Your changes are safe in this browser. Use Sync now to retry.");
        }
      } else if (error.status === 401) {
        state.sync.authenticated = false;
        renderSyncAccount();
        setSyncState("error", "Sync session expired", "Sign in again. Your local encrypted copy is safe.");
      } else {
        setSyncState("error", "Could not reach encrypted sync", "Your changes are safe in this browser. Use Sync now to retry.");
      }
    }
  }).catch(() => setSyncState("error", "Could not reach encrypted sync", "Your changes are safe in this browser. Use Sync now to retry."));
}

async function useRemoteVault(remote) {
  if (!remote?.envelope) throw new Error("No encrypted cloud vault is available.");
  await dbPut(remote.envelope);
  state.envelope = remote.envelope;
  state.sync.revision = remote.revision;
  state.sync.remote = null;
  els.syncConflict.hidden = true;
  clearSensitiveState();
  els.app.hidden = true;
  els.gate.hidden = false;
  configureGate();
  setSyncState("synced", "Encrypted cloud copy downloaded", "Enter its master password to unlock it on this browser.");
  els.syncDialog.close();
  els.master.focus();
}

async function reconcileSync({ prefer = "ask" } = {}) {
  const response = await fetchRemoteVault();
  const remote = response.vault;
  if (!remote && state.envelope) return uploadEnvelope(state.envelope, 0);
  if (remote && !state.envelope) return useRemoteVault(remote);
  if (!remote && !state.envelope) {
    setSyncState("synced", "Sync account connected", "Create a vault here and its encrypted copy will synchronize.");
    return;
  }
  if (sameEnvelope(remote.envelope, state.envelope)) {
    state.sync.revision = remote.revision;
    els.syncConflict.hidden = true;
    setSyncState("synced", "Encrypted copy synchronized", "This browser and your cloud copy match.");
    return;
  }
  state.sync.remote = remote;
  if (prefer === "cloud") return useRemoteVault(remote);
  if (prefer === "browser") return uploadEnvelope(state.envelope, remote.revision);
  els.syncConflict.hidden = false;
  setSyncState("error", "Two encrypted copies differ", "Choose the cloud copy or this browser's copy below.");
}

async function checkSyncSession() {
  try {
    const session = await apiRequest("/api/auth", { method: "GET" });
    state.sync.authenticated = session.authenticated;
    state.sync.email = session.email || "";
    renderSyncAccount();
    if (session.authenticated) await reconcileSync();
    else setSyncState("local", "Local encrypted vault", "Sign in to make the encrypted copy available in another browser.");
  } catch {
    setSyncState("local", "Local encrypted vault", "Cloud sync is unavailable here. The local vault still works.");
  }
}

async function authenticateSync(action) {
  showSyncMessage(""); setSyncBusy(true);
  try {
    const result = await apiRequest("/api/auth", {
      method: "POST",
      body: JSON.stringify({ action, email: $("#sync-email").value.trim(), password: $("#sync-password").value })
    });
    if (!result.authenticated) {
      showSyncMessage(result.message || "Check your email, then return here to sign in.");
      setSyncState("local", "Confirm your sync account", "Use the verification message sent to your email address.");
      return;
    }
    state.sync.authenticated = true;
    state.sync.email = result.email;
    $("#sync-password").value = "";
    renderSyncAccount();
    await reconcileSync();
  } catch (error) {
    showSyncMessage(error.message);
    setSyncState("error", "Could not sign in", "Check the details below and try again.");
  } finally { setSyncBusy(false); }
}

function safeUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function domainFrom(value) {
  try { return new URL(safeUrl(value)).hostname.replace(/^www\./, ""); } catch { return value || "No website"; }
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").toLocaleLowerCase().trim();
}

function rankEntry(entry, query) {
  if (!query) return entry.favorite ? 1 : 2;
  const q = normalize(query);
  const service = normalize(entry.service);
  const domain = normalize(domainFrom(entry.url));
  const username = normalize(entry.username);
  const tags = normalize((entry.tags || []).join(" "));
  if (service === q) return 0;
  if (service.startsWith(q)) return 1;
  if (service.includes(q)) return 2;
  if (domain.includes(q)) return 3;
  if (username.includes(q)) return 4;
  if (tags.includes(q)) return 5;
  return Infinity;
}

function filteredEntries() {
  return [...state.vault.entries]
    .map((entry) => ({ entry, rank: rankEntry(entry, state.query) }))
    .filter(({ rank }) => Number.isFinite(rank))
    .sort((a, b) => a.rank - b.rank || a.entry.service.localeCompare(b.entry.service))
    .map(({ entry }) => entry);
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "•";
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function render() {
  if (!state.vault) return;
  const entries = filteredEntries();
  els.results.replaceChildren();
  els.empty.hidden = state.vault.entries.length > 0 || Boolean(state.query);
  els.results.hidden = entries.length === 0;
  els.count.textContent = `${entries.length} ${entries.length === 1 ? "account" : "accounts"}`;
  els.context.textContent = state.query ? `Matches “${state.query}”` : "Ready";
  els.clearSearch.hidden = !state.query;

  if (state.query && entries.length === 0) {
    els.empty.hidden = false;
    els.empty.querySelector(".empty-state__title").textContent = "No signal found.";
    els.empty.querySelector("p:nth-child(2)").textContent = "Try a service name, website, email address, or tag.";
    els.empty.querySelector("button").hidden = true;
  } else if (state.vault.entries.length === 0) {
    els.empty.querySelector(".empty-state__title").textContent = "No accounts connected yet.";
    els.empty.querySelector("p:nth-child(2)").textContent = "Add your first login, then search by service, domain, email, or tag.";
    els.empty.querySelector("button").hidden = false;
  }

  entries.forEach((entry) => {
    const li = document.createElement("li");
    li.className = "result-item";
    li.dataset.active = String(entry.id === state.selectedId);
    const button = document.createElement("button");
    button.className = "result-button";
    button.type = "button";
    button.setAttribute("aria-label", `Open ${entry.service} for ${entry.username}`);
    if (entry.id === state.selectedId) button.setAttribute("aria-current", "true");
    const service = document.createElement("span");
    service.className = "result-service";
    const monogram = document.createElement("span");
    monogram.className = "monogram";
    monogram.textContent = initials(entry.service);
    const label = document.createElement("span");
    const strong = document.createElement("strong"); strong.textContent = entry.service;
    const small = document.createElement("small"); small.textContent = domainFrom(entry.url);
    label.append(strong, small); service.append(monogram, label);
    const username = document.createElement("span"); username.className = "result-username"; username.textContent = entry.username;
    const date = document.createElement("span"); date.className = "result-date"; date.textContent = formatDate(entry.updatedAt);
    button.append(service, username, date);
    button.addEventListener("click", () => selectEntry(entry.id));
    li.append(button); els.results.append(li);
  });

  const selected = state.vault.entries.find((entry) => entry.id === state.selectedId);
  const activeIndex = entries.findIndex((entry) => entry.id === state.selectedId);
  els.workspace.style.setProperty("--route-top", `${Math.max(0, activeIndex) * 96 + 115}px`);
  renderDetail(selected);
}

function renderDetail(entry) {
  els.detailEmpty.hidden = Boolean(entry);
  els.detailContent.hidden = !entry;
  if (!entry) return;
  els.detailTitle.textContent = entry.service;
  els.detailDomain.textContent = domainFrom(entry.url);
  els.detailMonogram.textContent = initials(entry.service);
  els.detailUsername.textContent = entry.username;
  els.detailPassword.textContent = state.passwordVisible ? entry.password : "•".repeat(Math.max(10, Math.min(entry.password.length, 20)));
  const url = safeUrl(entry.url);
  els.detailUrl.textContent = url ? domainFrom(url) : "Not provided";
  els.detailUrl.href = url || "#";
  els.detailTags.textContent = entry.tags?.length ? entry.tags.join(", ") : "None";
  els.detailNotes.textContent = entry.notes || "None";
  els.detailUpdated.textContent = formatDate(entry.updatedAt);
  $("#reveal-password").setAttribute("aria-label", state.passwordVisible ? "Hide password" : "Reveal password");
}

function selectEntry(id) {
  state.selectedId = id;
  state.passwordVisible = false;
  clearTimeout(state.revealTimer);
  els.workspace.dataset.mobileDetail = "true";
  render();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.dataset.visible = "true";
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => els.toast.dataset.visible = "false", 2600);
}

function resetActivity() {
  if (!state.vault) return;
  state.lastActivity = Date.now();
  clearTimeout(state.lockTimer);
  const minutes = Number(state.vault.settings.autoLockMinutes || 5);
  state.lockTimer = setTimeout(() => lockVault("Vault locked after inactivity."), minutes * 60 * 1000);
}

function clearSensitiveState() {
  state.key = null;
  state.vault = null;
  state.selectedId = null;
  state.query = "";
  state.passwordVisible = false;
  clearTimeout(state.revealTimer);
  clearTimeout(state.lockTimer);
  els.search.value = "";
  els.results.replaceChildren();
  els.detailPassword.textContent = "";
  els.detailUsername.textContent = "";
}

function lockVault(message = "Vault locked.") {
  clearSensitiveState();
  els.app.hidden = true;
  els.gate.hidden = false;
  els.master.value = "";
  els.master.focus();
  configureGate();
  showToast(message);
}

function configureGate() {
  const exists = Boolean(state.envelope);
  els.masterLabel.textContent = exists ? "Master password" : "Create master password";
  els.gateSubmit.textContent = exists ? "Unlock vault" : "Create vault";
  els.gateHelp.textContent = exists ? "Your encrypted vault will be decrypted only in this browser session." : "Use at least 12 characters. This password cannot be recovered.";
  els.master.autocomplete = exists ? "current-password" : "new-password";
  els.masterConfirm.hidden = exists;
  els.masterConfirmLabel.hidden = exists;
  els.masterConfirm.required = !exists;
}

async function handleGateSubmit(event) {
  event.preventDefault();
  els.gateError.hidden = true;
  const password = els.master.value;
  if (password.length < 12) return showGateError("Use at least 12 characters.");
  if (!state.envelope && password !== els.masterConfirm.value) return showGateError("The two master passwords do not match.");
  els.gateSubmit.disabled = true;
  els.gateSubmit.textContent = state.envelope ? "Unlocking…" : "Creating…";
  try {
    if (state.envelope) {
      const unlocked = await decryptEnvelope(state.envelope, password);
      state.key = unlocked.key;
      state.vault = unlocked.vault;
    } else {
      const salt = randomBytes(16);
      state.key = await deriveKey(password, salt);
      state.vault = blankVault();
      state.envelope = await encryptVault(state.vault, state.key, salt);
      await dbPut(state.envelope);
      queueCloudUpload(state.envelope);
    }
    els.master.value = "";
    els.masterConfirm.value = "";
    els.gate.hidden = true;
    els.app.hidden = false;
    $("#auto-lock-minutes").value = String(state.vault.settings.autoLockMinutes || 5);
    render(); resetActivity(); els.search.focus();
  } catch (error) {
    console.warn("Vault operation failed without exposing encrypted contents.");
    showGateError(error.name === "OperationError" ? "That password could not unlock this vault." : error.message);
  } finally {
    els.gateSubmit.disabled = false;
    configureGate();
  }
}

function showGateError(message) {
  els.gateError.textContent = message;
  els.gateError.hidden = false;
}

function openEntryDialog(entry = null) {
  $("#entry-dialog-title").textContent = entry ? "Edit account" : "Add account";
  $("#entry-id").value = entry?.id || "";
  $("#entry-service").value = entry?.service || "";
  $("#entry-url").value = entry?.url || "";
  $("#entry-username").value = entry?.username || "";
  $("#entry-password").value = entry?.password || "";
  $("#entry-tags").value = entry?.tags?.join(", ") || "";
  $("#entry-notes").value = entry?.notes || "";
  $("#entry-error").hidden = true;
  els.entryDialog.showModal();
  $("#entry-service").focus();
}

async function saveEntry(event) {
  event.preventDefault();
  const id = $("#entry-id").value || crypto.randomUUID();
  const service = $("#entry-service").value.trim();
  const username = $("#entry-username").value.trim();
  const password = $("#entry-password").value;
  if (!service || !username || !password) {
    $("#entry-error").textContent = "Service, username, and password are required.";
    $("#entry-error").hidden = false;
    return;
  }
  const previous = state.vault.entries.find((entry) => entry.id === id);
  const now = new Date().toISOString();
  const entry = {
    id, service, username, password,
    url: safeUrl($("#entry-url").value.trim()),
    tags: $("#entry-tags").value.split(",").map((tag) => tag.trim()).filter(Boolean),
    notes: $("#entry-notes").value.trim(),
    favorite: previous?.favorite || false,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
  const index = state.vault.entries.findIndex((item) => item.id === id);
  if (index >= 0) state.vault.entries[index] = entry; else state.vault.entries.push(entry);
  await persistVault();
  state.selectedId = id;
  els.entryDialog.close();
  render();
  showToast(index >= 0 ? "Account updated." : "Account added.");
}

function generatePassword(length = 24) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+";
  const bytes = randomBytes(length * 2);
  let result = "";
  for (const byte of bytes) {
    if (byte < 256 - (256 % alphabet.length)) result += alphabet[byte % alphabet.length];
    if (result.length === length) break;
  }
  return result.length === length ? result : generatePassword(length);
}

async function copySelected(field) {
  const entry = state.vault.entries.find((item) => item.id === state.selectedId);
  if (!entry) return;
  try {
    await navigator.clipboard.writeText(entry[field]);
    showToast(`${field === "password" ? "Password" : "Username"} copied. Clipboard will be cleared when supported.`);
    setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText();
        if (current === entry[field]) await navigator.clipboard.writeText("");
      } catch { /* Clipboard reads may be unavailable. */ }
    }, 30000);
  } catch { showToast("Clipboard access was blocked by the browser."); }
}

async function deleteSelected() {
  const entry = state.vault.entries.find((item) => item.id === state.selectedId);
  if (!entry || !confirm(`Delete ${entry.service}? This cannot be undone.`)) return;
  state.vault.entries = state.vault.entries.filter((item) => item.id !== entry.id);
  state.selectedId = null;
  await persistVault();
  render(); showToast("Account deleted.");
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state.envelope, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `signal-desk-${new Date().toISOString().slice(0, 10)}.signaldesk`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Encrypted backup exported.");
}

async function importBackup(file) {
  if (!file || file.size > 20 * 1024 * 1024) throw new Error("Choose a backup smaller than 20 MB.");
  const parsed = JSON.parse(await file.text());
  if (parsed.version !== ENVELOPE_VERSION || !parsed.kdf?.salt || !parsed.cipher?.iv || !parsed.payload) throw new Error("This is not a valid Signal Desk backup.");
  const password = prompt("Enter the master password for this backup. It will be verified locally before anything is replaced.");
  if (!password) throw new Error("Backup restore cancelled.");
  await decryptEnvelope(parsed, password);
  if (state.envelope && !confirm("The backup is valid. Replace the vault stored in this browser?")) throw new Error("Backup restore cancelled.");
  await dbPut(parsed);
  state.envelope = parsed;
  clearSensitiveState();
  els.settingsDialog.close();
  els.app.hidden = true;
  els.gate.hidden = false;
  configureGate();
  showToast("Backup loaded. Enter its master password to unlock.");
}

function bindEvents() {
  els.gateForm.addEventListener("submit", handleGateSubmit);
  $("#toggle-master").addEventListener("click", () => {
    const visible = els.master.type === "text";
    els.master.type = visible ? "password" : "text";
    $("#toggle-master").setAttribute("aria-label", visible ? "Show master password" : "Hide master password");
  });
  els.search.addEventListener("input", () => { state.query = els.search.value; render(); });
  els.clearSearch.addEventListener("click", () => { els.search.value = ""; state.query = ""; render(); els.search.focus(); });
  ["#add-entry", "#add-entry-secondary", "#empty-add"].forEach((selector) => $(selector).addEventListener("click", () => openEntryDialog()));
  $("#lock-vault").addEventListener("click", () => lockVault());
  els.entryForm.addEventListener("submit", saveEntry);
  $("#generate-password").addEventListener("click", () => { const input = $("#entry-password"); input.value = generatePassword(); input.type = "text"; input.focus(); input.select(); });
  $("#edit-entry").addEventListener("click", () => openEntryDialog(state.vault.entries.find((item) => item.id === state.selectedId)));
  $("#delete-entry").addEventListener("click", deleteSelected);
  $("#reveal-password").addEventListener("click", () => {
    state.passwordVisible = !state.passwordVisible; clearTimeout(state.revealTimer); renderDetail(state.vault.entries.find((item) => item.id === state.selectedId));
    if (state.passwordVisible) state.revealTimer = setTimeout(() => { state.passwordVisible = false; renderDetail(state.vault.entries.find((item) => item.id === state.selectedId)); }, 15000);
  });
  $$(".copy-control").forEach((button) => button.addEventListener("click", () => copySelected(button.dataset.copy)));
  $("#open-site").addEventListener("click", () => { const entry = state.vault.entries.find((item) => item.id === state.selectedId); const url = safeUrl(entry?.url); if (url) window.open(url, "_blank", "noopener"); });
  $("#back-results").addEventListener("click", () => { els.workspace.dataset.mobileDetail = "false"; });
  $("#settings-button").addEventListener("click", () => els.settingsDialog.showModal());
  ["#sync-at-gate", "#sync-status-button", "#open-sync-settings"].forEach((selector) => $(selector).addEventListener("click", () => {
    els.settingsDialog.close();
    renderSyncAccount();
    els.syncDialog.showModal();
    (state.sync.authenticated ? $("#sync-now") : $("#sync-email")).focus();
  }));
  $("#close-sync").addEventListener("click", () => els.syncDialog.close());
  els.syncAuthForm.addEventListener("submit", (event) => { event.preventDefault(); authenticateSync("login"); });
  $("#sync-signup").addEventListener("click", () => authenticateSync("signup"));
  $("#sync-now").addEventListener("click", async () => {
    setSyncBusy(true);
    try { await reconcileSync(); showToast("Encrypted sync checked."); }
    catch (error) { setSyncState("error", "Could not synchronize", "Your local encrypted copy is safe. Try again when online."); showToast(error.message); }
    finally { setSyncBusy(false); }
  });
  $("#sync-signout").addEventListener("click", async () => {
    setSyncBusy(true);
    try { await apiRequest("/api/auth", { method: "POST", body: JSON.stringify({ action: "logout" }) }); }
    catch { /* Clear the local session view even if the network is unavailable. */ }
    state.sync = { authenticated: false, email: "", revision: 0, remote: null, busy: false, queue: Promise.resolve() };
    els.syncConflict.hidden = true; renderSyncAccount();
    setSyncState("local", "Signed out of encrypted sync", "The encrypted local copy remains on this browser.");
  });
  $("#use-cloud-copy").addEventListener("click", async () => {
    setSyncBusy(true); try { await reconcileSync({ prefer: "cloud" }); } catch (error) { showToast(error.message); } finally { setSyncBusy(false); }
  });
  $("#keep-browser-copy").addEventListener("click", async () => {
    setSyncBusy(true); try { await reconcileSync({ prefer: "browser" }); showToast("This browser's encrypted copy is now current."); } catch (error) { showToast(error.message); } finally { setSyncBusy(false); }
  });
  $("#cancel-conflict").addEventListener("click", () => els.syncDialog.close());
  $("#auto-lock-minutes").addEventListener("change", async (event) => { state.vault.settings.autoLockMinutes = Number(event.target.value); await persistVault(); resetActivity(); showToast("Auto-lock updated."); });
  $("#export-backup").addEventListener("click", exportBackup);
  ["#import-backup", "#import-at-gate"].forEach((selector) => $(selector).addEventListener("click", () => els.backupFile.click()));
  els.backupFile.addEventListener("change", async () => { try { await importBackup(els.backupFile.files[0]); } catch (error) { showToast(error.message); } finally { els.backupFile.value = ""; } });
  document.addEventListener("keydown", (event) => {
    if (!state.vault) return;
    if ((event.key === "/" || (event.ctrlKey && event.key.toLowerCase() === "k")) && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) { event.preventDefault(); els.search.focus(); }
    if (event.key === "Escape" && document.activeElement === els.search && state.query) { els.search.value = ""; state.query = ""; render(); }
  });
  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => document.addEventListener(eventName, resetActivity, { passive: true }));
  document.addEventListener("visibilitychange", () => { if (document.hidden && state.passwordVisible) { state.passwordVisible = false; renderDetail(state.vault?.entries.find((item) => item.id === state.selectedId)); } });
}

async function init() {
  if (!window.crypto?.subtle || !window.indexedDB) {
    showGateError("This browser does not provide the encryption and local-storage features Signal Desk requires.");
    els.gateSubmit.disabled = true;
    return;
  }
  state.envelope = await dbGet();
  configureGate(); bindEvents(); renderSyncAccount(); els.master.focus();
  checkSyncSession();
}

init().catch(() => showGateError("Signal Desk could not open its local database."));
