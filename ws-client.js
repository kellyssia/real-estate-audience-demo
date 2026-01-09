// public/ws-client.js
(() => {
  // You can set this from index.html via window.__RELAY_WSS_URL__
  const RELAY_WSS_URL =
    window.__RELAY_WSS_URL__ || "wss://YOUR-RELAY-HOST.onrender.com";

  let ws = null;
  let reconnectTimer = null;
  let reconnectDelayMs = 1200; // simple backoff
  const maxReconnectDelayMs = 8000;

  function log(...args) {
    console.log("%c[WS]", "color:#7c3aed;font-weight:800;", ...args);
  }
  function warn(...args) {
    console.warn("%c[WS]", "color:#f59e0b;font-weight:800;", ...args);
  }
  function err(...args) {
    console.error("%c[WS]", "color:#ef4444;font-weight:800;", ...args);
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelayMs = Math.min(
        Math.floor(reconnectDelayMs * 1.35),
        maxReconnectDelayMs
      );
      connect();
    }, reconnectDelayMs);
    warn(`Reconnecting in ${reconnectDelayMs}ms...`);
  }

  function connect() {
    try {
      if (!RELAY_WSS_URL.startsWith("ws://") && !RELAY_WSS_URL.startsWith("wss://")) {
        err("Relay URL must start with ws:// or wss://. Current:", RELAY_WSS_URL);
        return;
      }

      log("Connecting to:", RELAY_WSS_URL);
      ws = new WebSocket(RELAY_WSS_URL);

      ws.addEventListener("open", () => {
        reconnectDelayMs = 1200; // reset backoff on success
        log("✅ Connected");

        // Send a hello so the relay logs something immediately
        safeSend({
          eventType: "client_hello",
          ts: new Date().toISOString(),
          page: window.location.href,
          userAgent: navigator.userAgent,
        });
      });

      ws.addEventListener("message", (evt) => {
        log("⬅️ Message:", evt.data);
      });

      ws.addEventListener("close", (evt) => {
        warn(`🔌 Closed (code=${evt.code}, reason=${evt.reason || "n/a"})`);
        scheduleReconnect();
      });

      ws.addEventListener("error", (evt) => {
        err("❌ Error:", evt);
        // let close handler trigger reconnect
      });
    } catch (e) {
      err("Failed to initialize WebSocket:", e);
      scheduleReconnect();
    }
  }

  function safeSend(payload) {
    const msg = JSON.stringify(payload);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      warn("Not connected (readyState=", ws ? ws.readyState : "NO_SOCKET", ") — cannot send:", payload);
      return false;
    }
    ws.send(msg);
    log("➡️ Sent:", payload);
    return true;
  }

  // Public API
  window.RealEstateWS = {
    connect,
    sendSelection: (payload) =>
      safeSend({ ...payload, ts: new Date().toISOString() }),
    status: () => ({
      url: RELAY_WSS_URL,
      readyState: ws ? ws.readyState : "NO_SOCKET",
    }),
  };

  window.addEventListener("DOMContentLoaded", () => {
    connect();
  });
})();
