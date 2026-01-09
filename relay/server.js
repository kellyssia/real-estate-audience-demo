// server.js
const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8787;

// Basic HTTP server (Render likes having something to hit)
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }

  // Simple landing page
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(
    "REAL ESTATE RELAY v2 is running.\n" +
      "Health: /health\n" +
      "WebSocket: ws(s)://<host>/ws\n"
  );
});

// WebSocket server in "noServer" mode so we control upgrades explicitly
const wss = new WebSocketServer({ noServer: true });

// Handle HTTP -> WebSocket upgrades
server.on("upgrade", (req, socket, head) => {
  const upgradeHeader = req.headers["upgrade"];
  const connectionHeader = req.headers["connection"];
  const origin = req.headers["origin"];

  console.log("⬆️  UPGRADE ATTEMPT", {
    url: req.url,
    upgrade: upgradeHeader,
    connection: connectionHeader,
    origin,
  });

  // Only accept upgrades on /ws
  if (req.url !== "/ws") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  // Only accept WebSocket upgrades
  if ((upgradeHeader || "").toLowerCase() !== "websocket") {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  // Complete the WS handshake
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws, req) => {
  const ip =
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";

  console.log("✅ WS CONNECTED", { ip });

  // Greet client (helps debugging)
  ws.send(
    JSON.stringify({
      type: "hello",
      ts: new Date().toISOString(),
      msg: "Connected to relay",
    })
  );

  ws.on("message", (data) => {
    const text = data.toString();
    console.log("📩 WS MESSAGE", text);

    // Broadcast to all connected clients (including sender)
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(text);
      }
    }
  });

  ws.on("close", (code, reason) => {
    console.log("👋 WS CLOSED", { code, reason: reason?.toString?.() });
  });

  ws.on("error", (err) => {
    console.log("💥 WS ERROR", err?.message || err);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Relay listening on port ${PORT}`);
});
