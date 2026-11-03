'use strict';
// Máy chủ Phóng Sinh Online. Không cần cài package: chỉ dùng module có sẵn của Node 18+.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = +process.env.PORT || 3000;
const DB = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const SECURE = process.env.SECURE_COOKIE === '1';
const PRICE = { carp: 3, gold: 2, koi: 5 }, MAX_PLAYERS = 40, MIN_RELEASE_MS = 1800;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/* ---------- Lưu trữ (file JSON ghi nguyên tử; thay bằng PostgreSQL khi mở rộng) ---------- */
let db = { users: {}, sessions: {} };
try { db = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (e) {}
let tm = 0;
const persist = () => { if (!tm) tm = setTimeout(flush, 200); };
function flush() { clearTimeout(tm); tm = 0; const t = DB + '.tmp'; fs.writeFileSync(t, JSON.stringify(db)); fs.renameSync(t, DB); }
process.on('SIGINT', () => { flush(); process.exit(); });
process.on('SIGTERM', () => { flush(); process.exit(); });

/* ---------- Xác thực ---------- */
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
function mkSession(uid) {
  const tok = crypto.randomBytes(32).toString('hex');
  db.sessions[sha(tok)] = { uid, exp: Date.now() + 7 * 864e5 }; persist(); return tok;
}
const sidOf = req => { const m = /(?:^|; )sid=([a-f0-9]{64})/.exec(req.headers.cookie || ''); return m && m[1]; };
function userOf(req) {
  const t = sidOf(req); if (!t) return null;
  const s = db.sessions[sha(t)]; if (!s || s.exp < Date.now()) return null;
  return db.users[s.uid] || null;
}
const cookie = (v, age) => ({ 'Set-Cookie': `sid=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${SECURE ? '; Secure' : ''}` });
const hits = new Map();
function limited(ip) {
  const n = Date.now(), h = hits.get(ip) || { c: 0, t: n };
  if (n - h.t > 6e4) { h.c = 0; h.t = n; } h.c++; hits.set(ip, h);
  return h.c > (+process.env.AUTH_LIMIT || 12);
}
function cleanName(raw) {
  const n = String(raw || '').normalize('NFC').trim().replace(/\s+/g, ' ');
  if (n.length < 3 || n.length > 20 || !/^[\p{L}\p{N}_ ]+$/u.test(n)) return null;
  const key = n.toLowerCase().replace(/[\s_]+/g, '');
  if (/(admin|quantri|quảntrị|moderator|^mod|system|hethong|hệthống|support|anthropic|claude)/.test(key)) return null;
  return { name: n, key };
}

/* ---------- HTTP ---------- */
const HDR = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss:"
};
const json = (res, code, o, extra) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, HDR, extra)); res.end(JSON.stringify(o)); };
const body = req => new Promise(r => { let s = ''; req.on('data', d => { s += d; if (s.length > 2048) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch (e) { r({}); } }); });

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'GET' && url === '/health') return json(res, 200, { ok: true, service: 'phong-sinh-online' });
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, HDR));
    return res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
  }
  if (req.method !== 'POST' || !url.startsWith('/api/')) return json(res, 404, { err: 'Không tìm thấy' });
  if (limited(req.socket.remoteAddress)) return json(res, 429, { err: 'Thao tác quá nhanh, hãy thử lại sau ít phút' });
  const b = await body(req);

  if (url === '/api/register') {
    const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
    if (!EMAIL.test(email)) return json(res, 400, { err: 'Email không hợp lệ' });
    if (pw.length < 8 || pw.length > 72) return json(res, 400, { err: 'Mật khẩu từ 8 đến 72 ký tự' });
    if (Object.values(db.users).some(u => u.email === email)) return json(res, 409, { err: 'Email đã được đăng ký' });
    const salt = crypto.randomBytes(16).toString('hex');
    const u = { id: crypto.randomUUID(), email, salt, hash: hashPw(pw, salt), name: null, nameKey: null, look: [0, 0], balance: 100, units: [], ledger: [], lastTopup: 0, created: Date.now() };
    db.users[u.id] = u; persist();
    return json(res, 200, { ok: true, hasChar: false }, cookie(mkSession(u.id), 604800));
  }
  if (url === '/api/login') {
    const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
    const u = Object.values(db.users).find(x => x.email === email);
    const h = Buffer.from(hashPw(pw.slice(0, 72), u ? u.salt : 'x'.repeat(32)), 'hex');
    if (!u || !crypto.timingSafeEqual(h, Buffer.from(u.hash, 'hex'))) return json(res, 401, { err: 'Email hoặc mật khẩu không đúng' });
    return json(res, 200, { ok: true, hasChar: !!u.name }, cookie(mkSession(u.id), 604800));
  }
  const u = userOf(req);
  if (!u) return json(res, 401, { err: 'Chưa đăng nhập' });
  if (url === '/api/me') return json(res, 200, { ok: true, hasChar: !!u.name, name: u.name, look: u.look });
  if (url === '/api/character') {
    if (u.name) return json(res, 409, { err: 'Nhân vật đã được tạo' });
    const c = cleanName(b.name);
    if (!c) return json(res, 400, { err: 'Tên 3 đến 20 ký tự (chữ, số, khoảng trắng, gạch dưới) và không giả mạo quản trị' });
    const sh = b.shirt | 0, ht = b.hat | 0;
    if (sh < 0 || sh > 5 || ht < 0 || ht > 3) return json(res, 400, { err: 'Ngoại hình không hợp lệ' });
    if (Object.values(db.users).some(x => x.nameKey === c.key)) return json(res, 409, { err: 'Tên này đã có người dùng' });
    u.name = c.name; u.nameKey = c.key; u.look = [sh, ht]; persist();
    return json(res, 200, { ok: true });
  }
  if (url === '/api/logout') {
    delete db.sessions[sha(sidOf(req))]; persist();
    const c = players.get(u.id); if (c) closeC(c);
    return json(res, 200, { ok: true }, cookie('', 0));
  }
  json(res, 404, { err: 'Không tìm thấy' });
});

/* ---------- WebSocket tối giản (RFC 6455) ---------- */
const frame = (str, op = 1) => {
  const p = Buffer.from(str), l = p.length; let h;
  if (l < 126) h = Buffer.from([128 | op, l]); else { h = Buffer.alloc(4); h[0] = 128 | op; h[1] = 126; h.writeUInt16BE(l, 2); }
  return Buffer.concat([h, p]);
};
const players = new Map(); let seq = 0;
const events = [];
const out = (c, o) => { try { c.sock.write(frame(JSON.stringify(o))); } catch (e) {} };
const bcast = (o, except) => { const f = frame(JSON.stringify(o)); players.forEach(c => { if (c !== except) try { c.sock.write(f); } catch (e) {} }); };
function closeC(c) { try { c.sock.destroy(); } catch (e) {} if (players.get(c.u.id) === c) players.delete(c.u.id); }

server.on('upgrade', (req, sock, head) => {
  const u = userOf(req), o = req.headers.origin;
  let same = true; try { same = !o || new URL(o).host === req.headers.host; } catch (e) { same = false; }
  const key = req.headers['sec-websocket-key'];
  if (req.url !== '/ws' || !u || !u.name || !same || !key) { sock.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return sock.destroy(); }
  const acc = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`);
  join(u, sock, head);
});

const walkable = (x, z) => (z > -7.75 && z < 26.2 && Math.abs(x) < 25.2) || (Math.abs(x - 6) < 1 && z <= -7.75 && z > -12.7);
const owned = u => u.units.filter(x => x.state === 'owned');
const invMsg = u => ({ bal: u.balance, units: owned(u).map(x => ({ id: x.id, kind: x.kind, state: 'owned' })), merit: u.ledger.length, rel: u.ledger.slice(-20).map(l => ({ kind: l.kind, t: l.t, merit: 1 })) });
function lbMsg() {
  const top = Object.values(db.users).filter(x => x.name && x.ledger.length).sort((a, b) => b.ledger.length - a.ledger.length).slice(0, 10).map(x => ({ n: x.name, m: x.ledger.length }));
  return { t: 'lb', top, online: [...players.values()].map(c => c.u.name), ev: events.slice(-8).reverse() };
}

function join(u, sock, head) {
  const old = players.get(u.id); if (old) closeC(old);
  if (players.size >= MAX_PLAYERS) { sock.write(frame(JSON.stringify({ t: 'err', m: 'Thế giới đang đầy, hãy thử lại sau' }))); return sock.end(); }
  const c = { u, sock, buf: Buffer.alloc(0), pid: ++seq, x: Math.random() * 2 - 1, z: 12, h: Math.PI, s: 'idle', c: 0, lp: Date.now(), pend: null, mc: 0, mt: Date.now() };
  players.set(u.id, c);
  sock.on('data', d => { c.buf = Buffer.concat([c.buf, d]); parse(c); });
  if (head && head.length) { c.buf = Buffer.from(head); parse(c); }
  sock.on('close', () => { if (players.get(u.id) === c) players.delete(u.id); });
  sock.on('error', () => sock.destroy());
  out(c, Object.assign({ t: 'init', id: c.pid, name: u.name, look: u.look, x: c.x, z: c.z }, invMsg(u)));
  out(c, lbMsg());
}

function parse(c) {
  while (c.buf.length >= 2) {
    const b0 = c.buf[0], b1 = c.buf[1], op = b0 & 15, fin = b0 & 128;
    let len = b1 & 127, off = 2;
    if (!(b1 & 128)) return closeC(c);
    if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; } else if (len === 127) return closeC(c);
    if (len > 4096) return closeC(c);
    if (c.buf.length < off + 4 + len) return;
    const mask = c.buf.subarray(off, off + 4), data = Buffer.from(c.buf.subarray(off + 4, off + 4 + len));
    for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
    c.buf = c.buf.subarray(off + 4 + len);
    if (op === 8) return closeC(c);
    if (op === 9) { c.sock.write(frame(data.toString('latin1'), 10)); continue; }
    if (op === 10) continue;
    if (op !== 1 || !fin) return closeC(c);
    onMsg(c, data.toString('utf8'));
    if (!players.has(c.u.id)) return;
  }
}

const num = v => typeof v === 'number' && isFinite(v);
function onMsg(c, txt) {
  const now = Date.now();
  if (now - c.mt > 1000) { c.mt = now; c.mc = 0; }
  if (++c.mc > 60) return closeC(c); // chống spam
  let m; try { m = JSON.parse(txt); } catch (e) { return; }
  const u = c.u;
  switch (m.t) {
    case 'pos': {
      if (!num(m.x) || !num(m.z) || !num(m.h)) return;
      const dt = Math.min(1, Math.max(.02, (now - c.lp) / 1000)); c.lp = now;
      if (Math.hypot(m.x - c.x, m.z - c.z) > 7 * dt + .6 || !walkable(m.x, m.z)) return out(c, { t: 'snap', x: c.x, z: c.z });
      c.x = m.x; c.z = m.z; c.h = m.h; c.s = m.s === 'rel' ? 'rel' : 'idle'; c.c = m.c ? 1 : 0; break;
    }
    case 'buy': {
      if (Math.hypot(c.x + 9, c.z - 3) > 3.6) return out(c, { t: 'err', m: 'Bạn cần đứng gần quầy cá' });
      const price = PRICE[m.kind], q = m.qty;
      if (!price || !Number.isInteger(q) || q < 1 || q > 10) return out(c, { t: 'err', m: 'Yêu cầu mua không hợp lệ' });
      if (owned(u).length + q > 50) return out(c, { t: 'err', m: 'Bạn đang mang quá nhiều cá' });
      if (price * q > u.balance) return out(c, { t: 'err', m: 'Số dư không đủ' });
      u.balance -= price * q; const oid = crypto.randomUUID();
      for (let i = 0; i < q; i++) u.units.push({ id: oid + '-' + i, kind: m.kind, state: 'owned' });
      persist(); out(c, Object.assign({ t: 'inv', ok: 'buy' }, invMsg(u))); break;
    }
    case 'topup': {
      if (now - u.lastTopup < 864e5) return out(c, { t: 'err', m: 'Mỗi 24 giờ chỉ nhận 50 điểm demo một lần' });
      u.balance += 50; u.lastTopup = now; persist(); out(c, Object.assign({ t: 'inv' }, invMsg(u))); break;
    }
    case 'release': {
      if (Math.hypot(c.x - 6, c.z + 9.5) > 3.8) return out(c, { t: 'err', m: 'Bạn cần đứng gần bến phóng sinh' });
      if (c.pend && now - c.pend.t0 < 15000) return out(c, { t: 'err', m: 'Đang có một lượt phóng sinh' });
      const unit = owned(u)[0]; if (!unit) return out(c, { t: 'err', m: 'Bạn chưa có cá. Hãy đến quầy hàng để mua cá' });
      c.pend = { rid: crypto.randomUUID(), unitId: unit.id, kind: unit.kind, t0: now };
      out(c, { t: 'rel_ok', rid: c.pend.rid, kind: unit.kind }); break;
    }
    case 'landed': {
      const p = c.pend;
      if (!p || m.rid !== p.rid) return out(c, { t: 'err', m: 'Lượt phóng sinh không hợp lệ hoặc đã được ghi nhận' });
      if (now - p.t0 < MIN_RELEASE_MS) return out(c, { t: 'err', m: 'Xác nhận quá sớm' });
      c.pend = null;
      const unit = u.units.find(x => x.id === p.unitId);
      if (!unit || unit.state !== 'owned' || u.ledger.some(l => l.unitId === p.unitId)) return out(c, { t: 'err', m: 'Cá này đã được thả' });
      u.units = u.units.filter(x => x.id !== p.unitId);
      u.ledger.push({ id: p.rid, unitId: p.unitId, kind: p.kind, t: now }); // +1 công đức = một dòng sổ cái
      events.push({ n: u.name, k: p.kind, t: now }); if (events.length > 20) events.shift();
      persist();
      out(c, Object.assign({ t: 'done' }, invMsg(u)));
      bcast({ t: 'splash', x: c.x, z: Math.max(-20, c.z - 3.2), k: p.kind, n: u.name }, c);
      bcast(lbMsg()); break;
    }
  }
}

setInterval(() => {
  if (!players.size) return;
  const p = []; players.forEach(c => p.push({ i: c.pid, n: c.u.name, x: +c.x.toFixed(2), z: +c.z.toFixed(2), h: +c.h.toFixed(2), s: c.s, c: c.c, a: c.u.look }));
  bcast({ t: 'players', p, on: players.size });
}, 100);
setInterval(() => { if (players.size) bcast(lbMsg()); }, 3000);

server.listen(PORT, () => console.log('Phóng Sinh Online đang chạy tại http://localhost:' + PORT));
