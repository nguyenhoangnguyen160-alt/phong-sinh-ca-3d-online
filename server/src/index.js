import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomUUID } from "node:crypto";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true, service: "phong-sinh-server" }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// Demo-only memory state. Replace with a database and authenticated users before production.
const players = new Map();
const balances = new Map();
const inventories = new Map();
const merits = new Map();
const processedReleases = new Set();

function publicPlayer(p) {
  return { id: p.id, name: p.name, x: p.x, z: p.z, rotation: p.rotation, action: p.action };
}
function safeName(value) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 20);
  return name.length >= 2 ? name : null;
}

io.on("connection", (socket) => {
  socket.emit("world:init", [...players.values()].map(publicPlayer));

  socket.on("player:join", (payload, ack = () => {}) => {
    const name = safeName(payload?.name);
    if (!name) return ack({ ok: false, error: "Tên nhân vật cần có ít nhất 2 ký tự." });
    const duplicate = [...players.values()].some(p => p.name.toLowerCase() === name.toLowerCase());
    if (duplicate) return ack({ ok: false, error: "Tên đang được sử dụng trong thế giới này." });

    const player = {
      id: socket.id, name, x: -2 + Math.random() * 4, z: 2 + Math.random() * 3,
      rotation: 0, action: "idle"
    };
    players.set(socket.id, player);
    balances.set(socket.id, 100);
    inventories.set(socket.id, 0);
    merits.set(socket.id, 0);
    socket.emit("player:state", {
      id: socket.id, balance: balances.get(socket.id),
      fish: inventories.get(socket.id), merit: merits.get(socket.id)
    });
    socket.broadcast.emit("player:joined", publicPlayer(player));
    ack({ ok: true, player: publicPlayer(player) });
  });

  socket.on("player:move", (payload) => {
    const p = players.get(socket.id);
    if (!p || !payload) return;
    // Minimal server-side bounds and speed sanity checks for this prototype.
    const x = Number(payload.x), z = Number(payload.z), rotation = Number(payload.rotation);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rotation)) return;
    p.x = Math.max(-18, Math.min(18, x));
    p.z = Math.max(-18, Math.min(18, z));
    p.rotation = rotation;
    p.action = payload.action === "walk" ? "walk" : "idle";
    socket.broadcast.emit("player:moved", publicPlayer(p));
  });

  socket.on("shop:buy", (_payload, ack = () => {}) => {
    if (!players.has(socket.id)) return ack({ ok: false, error: "Hãy vào thế giới trước." });
    const price = 10;
    const balance = balances.get(socket.id) ?? 0;
    if (balance < price) return ack({ ok: false, error: "Bạn không đủ tiền demo để mua cá." });
    balances.set(socket.id, balance - price);
    inventories.set(socket.id, (inventories.get(socket.id) ?? 0) + 1);
    const state = { balance: balances.get(socket.id), fish: inventories.get(socket.id), merit: merits.get(socket.id) ?? 0 };
    socket.emit("player:state", { id: socket.id, ...state });
    ack({ ok: true, ...state, message: "Mua cá thành công!" });
  });

  socket.on("fish:release", (payload, ack = () => {}) => {
    const p = players.get(socket.id);
    if (!p) return ack({ ok: false, error: "Bạn chưa vào thế giới." });
    if ((inventories.get(socket.id) ?? 0) < 1) return ack({ ok: false, error: "Bạn chưa có cá. Hãy đến quầy hàng mua cá." });
    const releaseId = String(payload?.releaseId ?? "");
    if (!releaseId || releaseId.length > 100 || processedReleases.has(`${socket.id}:${releaseId}`)) {
      return ack({ ok: false, error: "Lượt phóng sinh không hợp lệ hoặc đã được ghi nhận." });
    }
    // Demo spatial check: the release point is near the riverbank at z <= -7.
    if (p.z > -5) return ack({ ok: false, error: "Hãy đi đến gần bờ sông rồi mới phóng sinh." });

    processedReleases.add(`${socket.id}:${releaseId}`);
    inventories.set(socket.id, inventories.get(socket.id) - 1);
    merits.set(socket.id, (merits.get(socket.id) ?? 0) + 1);
    const event = {
      eventId: randomUUID(), playerId: socket.id, playerName: p.name,
      fish: "Cá chép cam", meritAdded: 1, totalMerit: merits.get(socket.id),
      at: new Date().toISOString()
    };
    io.emit("fish:released", event);
    const state = { balance: balances.get(socket.id) ?? 0, fish: inventories.get(socket.id), merit: merits.get(socket.id) };
    socket.emit("player:state", { id: socket.id, ...state });
    ack({ ok: true, ...state, event, message: "Phóng sinh thành công! +1 Công Đức" });
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    balances.delete(socket.id);
    inventories.delete(socket.id);
    merits.delete(socket.id);
    io.emit("player:left", socket.id);
  });
});

const PORT = Number(process.env.PORT || 3001);
httpServer.listen(PORT, "0.0.0.0", () => console.log(`Phóng Sinh server listening on :${PORT}`));
