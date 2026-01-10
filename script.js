/* ---------------------------
   WebSocket tracking (safe)
---------------------------- */
const WS_URL = "wss://real-estate-live-demo.onrender.com/ws";

// Audience identity + upload endpoint + session id
const AUDIENCE_SITE_URL = "https://real-estate-audience.onrender.com";
const UPLOAD_URL = "https://real-estate-live-demo.onrender.com/upload";
const SESSION_ID =
  (window.crypto && crypto.randomUUID) ? crypto.randomUUID() :
  ("sess_" + Math.random().toString(16).slice(2) + Date.now());

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

function sendEvent(eventType, payload = {}){
  const msg = {
    type: "event",
    eventType,
    ts: new Date().toISOString(),
    page: getActiveStep(),
    siteUrl: AUDIENCE_SITE_URL,
    sessionId: SESSION_ID,
    pageUrl: window.location.href,
    ...payload
  };

  try{
    if (ws && ws.readyState === WebSocket.OPEN){
      ws.send(JSON.stringify(msg));
    }
  }catch(e){}
}

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
---------------------------- */
document.querySelectorAll('.tile[data-type="location"]').forEach(tile => {
  tile.addEventListener("click", () => {
    document.querySelectorAll('.tile[data-type="location"]').forEach(t => t.classList.remove("is-selected"));
    tile.classList.add("is-selected");

    state.location = tile.getAttribute("data-value") || null;
    state.locationImage = tile.getAttribute("data-image") || null;

    // send both generic + specific (monitor compatibility)
    sendEvent("selection", { field: "location", value: state.location, image: state.locationImage });
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
---------------------------- */
document.querySelectorAll('.tile[data-type="propertyType"]').forEach(tile => {
  tile.addEventListener("click", () => {
    document.querySelectorAll('.tile[data-type="propertyType"]').forEach(t => t.classList.remove("is-selected"));
    tile.classList.add("is-selected");

    state.propertyType = tile.getAttribute("data-value") || null;
    state.propertyTypeImage = tile.getAttribute("data-image") || null;

    sendEvent("selection", { field: "propertyType", value: state.propertyType, image: state.propertyTypeImage });
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

  const res = await fetch(UPLOAD_URL, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);

  const data = await res.json();
  if (!data || !data.photoUrl) throw new Error("Upload response missing photoUrl");

  uploadedPhotoUrl = data.photoUrl;
  return uploadedPhotoUrl;
}

if (btnRegister){
  btnRegister.addEventListener("click", async () => {
    const fullName = fullNameEl ? fullNameEl.value.trim() : "";
    const email = emailEl ? emailEl.value.trim() : "";
    const phone = phoneEl ? phoneEl.value.trim() : "";

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

    sendEvent("register", {
      fullName,
      email,
      phone,
      photoUrl,
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
