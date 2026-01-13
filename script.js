/* ---------------------------
   WebSocket tracking (safe)
---------------------------- */
const WS_URL = "wss://real-estate-live-demo.onrender.com/ws";

// Audience identity + upload endpoint
const AUDIENCE_SITE_URL = "https://real-estate-audience.onrender.com";
const UPLOAD_URL = "https://real-estate-live-demo.onrender.com/upload";

/* ============================================================
   STABLE IDENTITY - CRITICAL FIX
   ============================================================
   
   deviceId: Persists across browser sessions (localStorage)
             - Same user = same deviceId even after closing browser
             - Used as the PRIMARY key for visitor tracking
   
   sessionId: Persists within browser session (sessionStorage)
              - Same tab session = same sessionId
              - New tab or browser restart = new sessionId
              - Used to detect "returning visits" within same device
   
   BOTH are sent with every event so the Mission Control LWC
   can track visitors correctly and migrate from sessionId to deviceId.
   ============================================================ */

// DEVICE ID - persists forever in localStorage
let DEVICE_ID = localStorage.getItem("sobha_deviceId");
if (!DEVICE_ID) {
  DEVICE_ID = (window.crypto && crypto.randomUUID) 
    ? crypto.randomUUID() 
    : ("dev_" + Math.random().toString(16).slice(2) + Date.now());
  localStorage.setItem("sobha_deviceId", DEVICE_ID);
  console.log("[Identity] Created new deviceId:", DEVICE_ID);
} else {
  console.log("[Identity] Using existing deviceId:", DEVICE_ID);
}

// SESSION ID - persists for browser session in sessionStorage
let SESSION_ID = sessionStorage.getItem("sobha_sessionId");
if (!SESSION_ID) {
  SESSION_ID = (window.crypto && crypto.randomUUID) 
    ? crypto.randomUUID() 
    : ("sess_" + Math.random().toString(16).slice(2) + Date.now());
  sessionStorage.setItem("sobha_sessionId", SESSION_ID);
  console.log("[Identity] Created new sessionId:", SESSION_ID);
} else {
  console.log("[Identity] Using existing sessionId:", SESSION_ID);
}

let ws;
let presenceTimer;

function connectWS(){
  const pill = document.getElementById("wsStatus");
  try {
    ws = new WebSocket(WS_URL);

    ws.addEventListener("open", () => {
      if (pill){
        pill.textContent = "Connected";
        pill.classList.add("is-ok");
        pill.classList.remove("is-bad");
      }

      sendEvent("presence", { status: "online" });

      clearInterval(presenceTimer);
      presenceTimer = setInterval(() => {
        sendEvent("presence", { status: "online" });
      }, 15000);
    });

    ws.addEventListener("close", () => {
      if (pill){
        pill.textContent = "Offline";
        pill.classList.remove("is-ok");
        pill.classList.add("is-bad");
      }
      clearInterval(presenceTimer);
      setTimeout(connectWS, 1500);
    });

    ws.addEventListener("error", () => {
      if (pill){
        pill.textContent = "Offline";
        pill.classList.remove("is-ok");
        pill.classList.add("is-bad");
      }
    });

  } catch(e){
    if (pill){
      pill.textContent = "Offline";
      pill.classList.remove("is-ok");
      pill.classList.add("is-bad");
    }
  }
}

function getActiveStep(){
  const active = document.querySelector(".step.is-active");
  return active ? Number(active.getAttribute("data-step")) : 1;
}

/* ============================================================
   SEND EVENT - Now includes BOTH deviceId AND sessionId
   ============================================================ */
function sendEvent(eventType, payload = {}){
  const msg = {
    type: "event",
    eventType,
    ts: new Date().toISOString(),
    page: getActiveStep(),
    siteUrl: AUDIENCE_SITE_URL,
    deviceId: DEVICE_ID,      // CRITICAL: Always include deviceId
    sessionId: SESSION_ID,    // CRITICAL: Always include sessionId
    pageUrl: window.location.href,
    ...payload
  };

  try{
    if (ws && ws.readyState === WebSocket.OPEN){
      ws.send(JSON.stringify(msg));
      console.log("[WS] Sent:", eventType, msg);
    }
  }catch(e){
    console.error("[WS] Send error:", e);
  }
}

/* ============================================================
   Send disconnect event when user leaves the page
   ============================================================ */
window.addEventListener("beforeunload", () => {
  // Try to send disconnect event (may not always succeed)
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const msg = {
        type: "event",
        eventType: "disconnect",
        ts: new Date().toISOString(),
        deviceId: DEVICE_ID,
        sessionId: SESSION_ID,
        siteUrl: AUDIENCE_SITE_URL
      };
      ws.send(JSON.stringify(msg));
    }
  } catch(e) {
    // Ignore errors during unload
  }
});

/* ---------------------------
   Wizard core
---------------------------- */
const TOTAL_STEPS = 7;
const steps = Array.from(document.querySelectorAll(".step"));
const stepPill = document.getElementById("stepPill");

const state = {
  consent: false,
  location: null,
  locationImage: null,
  budget: null,        // string label for display + events
  budgetValue: null,   // numeric
  bedrooms: null,
  propertyType: null,
  propertyTypeImage: null
};

function updateStepPill(step){
  if (!stepPill) return;
  stepPill.textContent = `Step ${step} of ${TOTAL_STEPS}`;
}

function showStep(step){
  steps.forEach(s => s.classList.remove("is-active"));
  const next = document.querySelector(`.step[data-step="${step}"]`);
  if (next) next.classList.add("is-active");
  updateStepPill(step);
  sendEvent("step_view", { step });
}

function nextStep(){
  const current = getActiveStep();
  showStep(Math.min(TOTAL_STEPS, current + 1));
}

function prevStep(){
  const current = getActiveStep();
  showStep(Math.max(1, current - 1));
}

/* ---------------------------
   Global back handler
---------------------------- */
document.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.hasAttribute("data-back")) prevStep();
});

/* ---------------------------
   Step 1: Consent
---------------------------- */
const consentCheck = document.getElementById("consentCheck");
const btnConsentContinue = document.getElementById("btnConsentContinue");

if (consentCheck && btnConsentContinue){
  consentCheck.addEventListener("change", () => {
    state.consent = !!consentCheck.checked;
    btnConsentContinue.disabled = !state.consent;
    sendEvent("consent", { consent: state.consent });
  });

  btnConsentContinue.addEventListener("click", () => {
    if (!state.consent) return;
    nextStep(); // -> Step 2
  });
}

/* ---------------------------
   Step 2: Location (click-to-advance)
   FIXED: field is now "location" consistently
---------------------------- */
document.querySelectorAll('.tile[data-type="location"]').forEach(tile => {
  tile.addEventListener("click", () => {
    document.querySelectorAll('.tile[data-type="location"]').forEach(t => t.classList.remove("is-selected"));
    tile.classList.add("is-selected");

    state.location = tile.getAttribute("data-value") || null;
    state.locationImage = tile.getAttribute("data-image") || null;

    // Send selection event with correct field name for LWC
    sendEvent("selection", { 
      field: "location",  // LWC expects "location"
      value: state.location, 
      image: state.locationImage 
    });
    
    // Also send legacy event for backward compatibility
    sendEvent("select_location", { location: state.location, image: state.locationImage });

    nextStep(); // -> Step 3
  });
});

/* ---------------------------
   Step 3: Budget (NEXT BUTTON REQUIRED)
---------------------------- */
const budgetRange = document.getElementById("budgetRange");
const budgetValueEl = document.getElementById("budgetValue");
const budgetBadge = document.getElementById("budgetBadge");
const btnBudgetNext = document.getElementById("btnBudgetNext");

function formatAED(n){
  try {
    return "AED " + Number(n).toLocaleString("en-US");
  } catch {
    return "AED " + n;
  }
}

function calcBudgetLabel(v){
  const n = Number(v);

  if (n < 2000000) return "Starter";
  if (n < 6000000) return "Premium";
  if (n < 12000000) return "Elite";
  return "Ultra";
}

function updateBudgetFromSlider(){
  if (!budgetRange) return;

  const raw = Number(budgetRange.value);
  state.budgetValue = raw;
  state.budget = formatAED(raw);

  if (budgetValueEl) budgetValueEl.textContent = state.budget;

  const label = calcBudgetLabel(raw);
  if (budgetBadge) budgetBadge.textContent = label;

  // send selection event (but DO NOT advance)
  sendEvent("selection", { field: "budget", value: state.budget, numericValue: raw, tier: label });
  sendEvent("select_budget", { budget: state.budget, numericValue: raw, tier: label });
}

if (budgetRange){
  budgetRange.addEventListener("input", updateBudgetFromSlider);
  // also fire on change (some browsers)
  budgetRange.addEventListener("change", updateBudgetFromSlider);
  updateBudgetFromSlider();
}

if (btnBudgetNext){
  btnBudgetNext.addEventListener("click", () => {
    // ensure we have latest value before advancing
    updateBudgetFromSlider();
    nextStep(); // -> Step 4
  });
}

/* ---------------------------
   Step 4: Bedrooms (NEXT BUTTON REQUIRED)
---------------------------- */
const btnBedroomsNext = document.getElementById("btnBedroomsNext");

document.querySelectorAll('.chip[data-type="bedrooms"]').forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll('.chip[data-type="bedrooms"]').forEach(c => c.classList.remove("is-selected"));
    chip.classList.add("is-selected");

    state.bedrooms = chip.getAttribute("data-value") || null;

    sendEvent("selection", { field: "bedrooms", value: state.bedrooms });
    sendEvent("select_bedrooms", { bedrooms: state.bedrooms });

    // enable Next (but DO NOT advance)
    if (btnBedroomsNext) btnBedroomsNext.disabled = false;
  });
});

if (btnBedroomsNext){
  btnBedroomsNext.addEventListener("click", () => {
    if (!state.bedrooms) return;
    nextStep(); // -> Step 5
  });
}

/* ---------------------------
   Step 5: Property Type (click-to-advance)
   FIXED: field is now "type" consistently (LWC expects "type")
---------------------------- */
document.querySelectorAll('.tile[data-type="propertyType"]').forEach(tile => {
  tile.addEventListener("click", () => {
    document.querySelectorAll('.tile[data-type="propertyType"]').forEach(t => t.classList.remove("is-selected"));
    tile.classList.add("is-selected");

    state.propertyType = tile.getAttribute("data-value") || null;
    state.propertyTypeImage = tile.getAttribute("data-image") || null;

    // Send selection event with correct field name for LWC
    sendEvent("selection", { 
      field: "type",  // LWC expects "type" not "propertyType"
      value: state.propertyType, 
      image: state.propertyTypeImage 
    });
    
    // Also send legacy event for backward compatibility
    sendEvent("select_property_type", { propertyType: state.propertyType, image: state.propertyTypeImage });

    nextStep(); // -> Step 6
  });
});

/* ---------------------------
   Step 6: Register (photo upload optional)
---------------------------- */
const btnRegister = document.getElementById("btnRegister");
const fullNameEl = document.getElementById("fullName");
const emailEl = document.getElementById("email");
const phoneEl = document.getElementById("phone");

// Photo controls (Step 6 only)
const photoInput = document.getElementById("photoInput");
const photoPreview = document.getElementById("photoPreview");

let selectedPhotoFile = null;
let uploadedPhotoUrl = null;

function showPhotoPreview(file){
  if (!file || !photoPreview) return;
  const url = URL.createObjectURL(file);
  photoPreview.src = url;
  photoPreview.style.display = "block";
}

if (photoInput){
  photoInput.addEventListener("change", () => {
    selectedPhotoFile = photoInput.files && photoInput.files[0] ? photoInput.files[0] : null;
    uploadedPhotoUrl = null;

    if (selectedPhotoFile){
      showPhotoPreview(selectedPhotoFile);
      sendEvent("photo_selected", { fileName: selectedPhotoFile.name, fileSize: selectedPhotoFile.size });
    }
  });
}

async function uploadPhotoIfNeeded(){
  if (!selectedPhotoFile) return null;
  if (uploadedPhotoUrl) return uploadedPhotoUrl;

  const form = new FormData();
  form.append("photo", selectedPhotoFile);
  form.append("sessionId", SESSION_ID);
  form.append("deviceId", DEVICE_ID);

  const res = await fetch(UPLOAD_URL, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);

  const data = await res.json();
  if (!data || !data.photoUrl) throw new Error("Upload response missing photoUrl");

  uploadedPhotoUrl = data.photoUrl;
  return uploadedPhotoUrl;
}

/* ============================================================
   REGISTER EVENT - Parse name into firstName/lastName
   ============================================================ */
if (btnRegister){
  btnRegister.addEventListener("click", async () => {
    const fullName = fullNameEl ? fullNameEl.value.trim() : "";
    const email = emailEl ? emailEl.value.trim() : "";
    const phone = phoneEl ? phoneEl.value.trim() : "";

    // Parse fullName into firstName and lastName
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    btnRegister.disabled = true;
    const originalText = btnRegister.textContent;
    btnRegister.textContent = selectedPhotoFile ? "Uploading…" : "Submitting…";

    let photoUrl = null;
    try{
      photoUrl = await uploadPhotoIfNeeded();
    }catch(err){
      // never block the demo flow if upload fails
      sendEvent("photo_upload_error", { message: String(err && err.message ? err.message : err) });
      photoUrl = null;
    }finally{
      btnRegister.disabled = false;
      btnRegister.textContent = originalText;
    }

    // Send register event with parsed name fields for LWC
    sendEvent("register", {
      fullName,
      firstName,        // LWC expects firstName
      lastName,         // LWC expects lastName
      email,
      phone,
      photoUrl,
      photo: photoUrl,  // Alias for LWC compatibility
      selections: {
        location: state.location,
        locationImage: state.locationImage,
        budget: state.budget,
        budgetValue: state.budgetValue,
        bedrooms: state.bedrooms,
        propertyType: state.propertyType,
        propertyTypeImage: state.propertyTypeImage
      }
    });

    updateSummary();
    showStep(7);
  });
}

/* ---------------------------
   Step 7: Summary + Restart
---------------------------- */
const sumLocation = document.getElementById("sumLocation");
const sumBudget = document.getElementById("sumBudget");
const sumBedrooms = document.getElementById("sumBedrooms");
const sumType = document.getElementById("sumType");
const btnRestart = document.getElementById("btnRestart");

function updateSummary(){
  if (sumLocation) sumLocation.textContent = state.location || "—";
  if (sumBudget) sumBudget.textContent = state.budget || "—";
  if (sumBedrooms) sumBedrooms.textContent = state.bedrooms || "—";
  if (sumType) sumType.textContent = state.propertyType || "—";
}

if (btnRestart){
  btnRestart.addEventListener("click", () => {
    // reset state
    state.consent = false;
    state.location = null;
    state.locationImage = null;
    state.budget = null;
    state.budgetValue = null;
    state.bedrooms = null;
    state.propertyType = null;
    state.propertyTypeImage = null;

    // reset UI selections
    document.querySelectorAll(".tile").forEach(t => t.classList.remove("is-selected"));
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("is-selected"));

    // reset consent
    if (consentCheck) consentCheck.checked = false;
    if (btnConsentContinue) btnConsentContinue.disabled = true;

    // reset bedrooms next
    if (btnBedroomsNext) btnBedroomsNext.disabled = true;

    // reset budget slider UI (keep default value)
    if (budgetRange){
      // keep whatever is in HTML as default
      updateBudgetFromSlider();
    }

    // reset register fields
    if (fullNameEl) fullNameEl.value = "";
    if (emailEl) emailEl.value = "";
    if (phoneEl) phoneEl.value = "";

    // reset photo
    if (photoInput) photoInput.value = "";
    if (photoPreview){
      photoPreview.src = "";
      photoPreview.style.display = "none";
    }
    selectedPhotoFile = null;
    uploadedPhotoUrl = null;

    sendEvent("restart", {});
    showStep(1);
  });
}

/* ---------------------------
   Boot
---------------------------- */
connectWS();
showStep(1);

// Log identity info for debugging
console.log("[Identity] Device ID:", DEVICE_ID);
console.log("[Identity] Session ID:", SESSION_ID);
