/* ---------------------------
   WebSocket tracking (safe)
---------------------------- */
const WS_URL = "wss://real-estate-live-demo.onrender.com/ws";

let ws;
let wsOk = false;
let presenceTimer;

function connectWS(){
  const pill = document.getElementById("wsStatus");
  try {
    ws = new WebSocket(WS_URL);

    ws.addEventListener("open", () => {
      wsOk = true;
      pill.textContent = "Connected";
      pill.classList.add("is-ok");
      pill.classList.remove("is-bad");
      sendEvent("presence", { status: "online" });

      clearInterval(presenceTimer);
      presenceTimer = setInterval(() => {
        sendEvent("presence", { status: "online" });
      }, 15000);
    });

    ws.addEventListener("close", () => {
      wsOk = false;
      pill.textContent = "Disconnected";
      pill.classList.remove("is-ok");
      pill.classList.add("is-bad");
      clearInterval(presenceTimer);
      setTimeout(connectWS, 1500);
    });

    ws.addEventListener("error", () => {
      wsOk = false;
      pill.textContent = "WS Error";
      pill.classList.remove("is-ok");
      pill.classList.add("is-bad");
    });

    ws.addEventListener("message", () => {
      // no-op
    });

  } catch (e){
    wsOk = false;
    pill.textContent = "WS Unavailable";
    pill.classList.remove("is-ok");
    pill.classList.add("is-bad");
  }
}

function sendEvent(eventType, payload = {}){
  const msg = {
    type: "event",
    eventType,
    ts: new Date().toISOString(),
    page: getActiveStep(),
    ...payload
  };

  // Never block UI
  try{
    if (ws && ws.readyState === WebSocket.OPEN){
      ws.send(JSON.stringify(msg));
    }
  }catch(e){}
}

/* ---------------------------
   Wizard logic
---------------------------- */
const TOTAL_STEPS = 7;
const steps = Array.from(document.querySelectorAll(".step"));
const stepPill = document.getElementById("stepPill");
const progressBar = document.getElementById("progressBar");

const state = {
  consent: false,
  location: null,
  locationImage: null,
  budget: 5000000,
  bedrooms: null,
  propertyType: null,
  propertyTypeImage: null
};

function getActiveStep(){
  const active = document.querySelector(".step.is-active");
  return active ? Number(active.dataset.step) : 1;
}

function showStep(n){
  steps.forEach(s => s.classList.remove("is-active"));
  const target = steps.find(s => Number(s.dataset.step) === n);
  if (target) target.classList.add("is-active");

  stepPill.textContent = `Step ${n} of ${TOTAL_STEPS}`;
  progressBar.style.width = `${Math.round(((n - 1) / (TOTAL_STEPS - 1)) * 100)}%`;

  sendEvent("step_view", { step: n });
}

function nextStep(){
  const n = getActiveStep();
  if (n < TOTAL_STEPS) showStep(n + 1);
}

function prevStep(){
  const n = getActiveStep();
  if (n > 1) showStep(n - 1);
}

/* ---------------------------
   Consent
---------------------------- */
const consentCheck = document.getElementById("consentCheck");
const btnConsentContinue = document.getElementById("btnConsentContinue");

consentCheck.addEventListener("change", () => {
  state.consent = !!consentCheck.checked;
  btnConsentContinue.disabled = !state.consent;
  sendEvent("consent", { consent: state.consent });
});

btnConsentContinue.addEventListener("click", () => {
  if (!state.consent) return;
  nextStep();
});

/* ---------------------------
   Back / Next buttons
---------------------------- */
document.addEventListener("click", (e) => {
  const back = e.target.closest("[data-back]");
  const next = e.target.closest("[data-next]");

  if (back){
    prevStep();
    return;
  }
  if (next){
    nextStep();
    return;
  }
});

/* ---------------------------
   Auto-advance selections
   (Location, Bedrooms, Property Type)
---------------------------- */
function clearSelected(containerSelector, className){
  document.querySelectorAll(`${containerSelector} .${className}`).forEach(el => el.classList.remove("is-selected"));
}

document.addEventListener("click", (e) => {
  const tile = e.target.closest(".tile");
  const chip = e.target.closest(".chip");

  // Location & Property type tiles
  if (tile && tile.dataset.type){
    const type = tile.dataset.type;
    const value = tile.dataset.value;
    const image = tile.dataset.image || null;

    // Mark selected (visual)
    tile.parentElement.querySelectorAll(".tile").forEach(t => t.classList.remove("is-selected"));
    tile.classList.add("is-selected");

    if (type === "location"){
      state.location = value;
      state.locationImage = image;
      sendEvent("selection", { field: "location", value, imageUrl: image });
      // auto-advance
      setTimeout(nextStep, 150);
    }

    if (type === "propertyType"){
      state.propertyType = value;
      state.propertyTypeImage = image;
      sendEvent("selection", { field: "propertyType", value, imageUrl: image });
      // auto-advance
      setTimeout(nextStep, 150);
    }
  }

  // Bedrooms chips
  if (chip && chip.dataset.type === "bedrooms"){
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("is-selected"));
    chip.classList.add("is-selected");

    state.bedrooms = chip.dataset.value;
    sendEvent("selection", { field: "bedrooms", value: state.bedrooms });
    setTimeout(nextStep, 150);
  }
});

/* ---------------------------
   Budget
---------------------------- */
const budgetRange = document.getElementById("budgetRange");
const budgetValue = document.getElementById("budgetValue");
const budgetBadge = document.getElementById("budgetBadge");

function formatAED(n){
  return "AED " + Number(n).toLocaleString("en-US");
}
function budgetTier(n){
  if (n >= 15000000) return "Ultra";
  if (n >= 8000000) return "Premium";
  if (n >= 3000000) return "Prime";
  return "Entry";
}
function updateBudget(){
  const v = Number(budgetRange.value);
  state.budget = v;
  budgetValue.textContent = formatAED(v);
  budgetBadge.textContent = budgetTier(v);

  sendEvent("selection", { field: "budget", value: v });
}
budgetRange.addEventListener("input", updateBudget);
updateBudget();

/* ---------------------------
   Register
---------------------------- */
const btnRegister = document.getElementById("btnRegister");
const btnRestart = document.getElementById("btnRestart");

btnRegister.addEventListener("click", () => {
  const fullName = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim();

  sendEvent("register", {
    fullName,
    email,
    phone,
    selections: {
      location: state.location,
      locationImage: state.locationImage,
      budget: state.budget,
      bedrooms: state.bedrooms,
      propertyType: state.propertyType,
      propertyTypeImage: state.propertyTypeImage
    }
  });

  showStep(7);
});

btnRestart.addEventListener("click", () => {
  // reset minimal
  state.location = null;
  state.locationImage = null;
  state.bedrooms = null;
  state.propertyType = null;
  state.propertyTypeImage = null;

  // reset UI
  consentCheck.checked = false;
  btnConsentContinue.disabled = true;

  document.querySelectorAll(".tile").forEach(t => t.classList.remove("is-selected"));
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("is-selected"));

  showStep(1);
});

/* ---------------------------
   Boot
---------------------------- */
connectWS();
showStep(1);
