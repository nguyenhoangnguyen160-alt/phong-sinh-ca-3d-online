'use strict';
// Kiểm thử giao thức thật: hai tài khoản độc lập, WebSocket thật, máy chủ thật (không kiểm thử phần 3D trên trình duyệt).
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const PORT = 3111, BASE = 'http://127.0.0.1:' + PORT, DATA = path.join(__dirname, 'test-data.json');
let ok = 0, bad = 0;
const T = (n, c) => { c ? ok++ : bad++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function post(p, b, ck) {
  const r = await fetch(BASE + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, ck ? { cookie: ck } : {}), body: JSON.stringify(b || {}) });
  const sc = r.headers.get('set-cookie');
  return { status: r.status, j: await r.json(), ck: sc ? sc.split(';')[0] : ck };
}
function wsConnect(ck) {
  return new Promise((res, rej) => {
    const rq = http.request({ port: PORT, host: '127.0.0.1', path: '/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), 'Sec-WebSocket-Version': '13', cookie: ck } });
    rq.on('upgrade', (r, sock, head) => {
      const c = { sock, msgs: [], buf: Buffer.alloc(0), x: 0, z: 0 };
      const feed = d => {
        c.buf = Buffer.concat([c.buf, d]);
        while (c.buf.length >= 2) {
          let l = c.buf[1] & 127, o = 2;
          if (l === 126) { if (c.buf.length < 4) break; l = c.buf.readUInt16BE(2); o = 4; }
          if (c.buf.length < o + l) break;
          c.msgs.push(JSON.parse(c.buf.subarray(o, o + l).toString())); c.buf = c.buf.subarray(o + l);
        }
      };
      sock.on('data', feed); if (head && head.length) feed(head);
      c.send = obj => {
        const p = Buffer.from(JSON.stringify(obj)), m = crypto.randomBytes(4), d = Buffer.from(p);
        const h = p.length < 126 ? Buffer.from([129, 128 | p.length]) : Buffer.from([129, 254, p.length >> 8, p.length & 255]);
        for (let i = 0; i < d.length; i++) d[i] ^= m[i & 3];
        sock.write(Buffer.concat([h, m, d]));
      };
      c.last = t => [...c.msgs].reverse().find(m => m.t === t);
      c.count = t => c.msgs.filter(m => m.t === t).length;
      c.clear = () => { c.msgs.length = 0; };
      c.close = () => sock.destroy();
      res(c);
    });
    rq.on('response', r => rej(new Error('ws bị từ chối: ' + r.statusCode)));
    rq.on('error', rej); rq.end();
  });
}
async function walk(c, to, speed = 3.8) {
  while (Math.hypot(to[0] - c.x, to[1] - c.z) > .05) {
    const d = Math.hypot(to[0] - c.x, to[1] - c.z), st = Math.min(d, speed * .1);
    c.x += (to[0] - c.x) / d * st; c.z += (to[1] - c.z) / d * st;
    c.send({ t: 'pos', x: +c.x.toFixed(2), z: +c.z.toFixed(2), h: 0, s: 'idle', c: 0 });
    await sleep(100);
  }
}
let srv;
function start() {
  return new Promise(res => {
    srv = spawn('node', ['server.js'], { cwd: __dirname, env: Object.assign({}, process.env, { PORT, DATA_FILE: DATA, AUTH_LIMIT: '500' }) });
    srv.stdout.on('data', d => { if (String(d).includes('đang chạy')) res(); });
    srv.stderr.on('data', d => process.stderr.write(d));
  });
}
const stop = () => new Promise(r => { srv.on('exit', r); srv.kill('SIGTERM'); });

(async () => {
  try { fs.unlinkSync(DATA); } catch (e) {}
  await start();

  // Đăng ký, tên nhân vật
  const A = await post('/api/register', { email: 'minh@example.com', password: 'matkhau123' });
  const B = await post('/api/register', { email: 'an@example.com', password: 'matkhau456' });
  T('đăng ký hai tài khoản', A.status === 200 && B.status === 200 && A.ck !== B.ck);
  T('từ chối email trùng', (await post('/api/register', { email: 'minh@example.com', password: 'matkhau123' })).status === 409);
  T('từ chối mật khẩu ngắn', (await post('/api/register', { email: 'x@example.com', password: '123' })).status === 400);
  T('từ chối tên giả quản trị', (await post('/api/character', { name: 'Admin_01', shirt: 0, hat: 0 }, A.ck)).status === 400);
  T('từ chối tên quá ngắn', (await post('/api/character', { name: 'Mi', shirt: 0, hat: 0 }, A.ck)).status === 400);
  T('tạo nhân vật Minh', (await post('/api/character', { name: 'Minh', shirt: 1, hat: 0 }, A.ck)).status === 200);
  T('tên trùng bị từ chối (không phân biệt hoa thường)', (await post('/api/character', { name: 'MINH', shirt: 0, hat: 0 }, B.ck)).status === 409);
  T('tạo nhân vật An', (await post('/api/character', { name: 'An', shirt: 2, hat: 1 }, B.ck)).status === 400); // 2 ký tự
  T('tạo nhân vật An (Bạn An)', (await post('/api/character', { name: 'Bạn An', shirt: 2, hat: 1 }, B.ck)).status === 200);
  T('đăng nhập sai mật khẩu bị từ chối', (await post('/api/login', { email: 'minh@example.com', password: 'saisaisai' })).status === 401);
  let refused = false; try { await wsConnect('sid=' + 'a'.repeat(64)); } catch (e) { refused = true; }
  T('WebSocket không có phiên hợp lệ bị từ chối', refused);

  // Hai người vào thế giới
  const a = await wsConnect(A.ck), b = await wsConnect(B.ck);
  await sleep(400);
  const ia = a.last('init'), ib = b.last('init');
  T('cả hai nhận init, số dư riêng 100', ia && ib && ia.bal === 100 && ib.bal === 100 && ia.name === 'Minh' && ib.name === 'Bạn An');
  a.x = ia.x; a.z = ia.z; b.x = ib.x; b.z = ib.z;
  await sleep(300);
  const pa = a.last('players'), pb = b.last('players');
  T('Minh nhìn thấy An', pa.p.some(p => p.n === 'Bạn An'));
  T('An nhìn thấy Minh', pb.p.some(p => p.n === 'Minh'));
  T('danh sách không lộ email', !JSON.stringify(a.msgs).includes('@'));

  // Minh di chuyển, An thấy
  const before = b.last('players').p.find(p => p.n === 'Minh');
  await walk(a, [a.x + 3, 12]);
  await sleep(300);
  const after = b.last('players').p.find(p => p.n === 'Minh');
  T('Minh di chuyển, An thấy vị trí đổi', Math.abs(after.x - before.x) > 2.5);

  // Gian lận: dịch chuyển tức thời bị kéo lại
  a.clear(); a.send({ t: 'pos', x: 0, z: -5, h: 0, s: 'idle', c: 0 }); await sleep(250);
  T('dịch chuyển tức thời bị snap', !!a.last('snap'));
  a.clear(); a.send({ t: 'pos', x: 40, z: 12, h: 0, s: 'idle', c: 0 }); await sleep(250);
  T('ra ngoài vùng đi được bị snap', !!a.last('snap'));
  // Gian lận: mua cá khi đứng xa quầy; tự cộng điểm
  a.clear(); a.send({ t: 'buy', kind: 'carp', qty: 1 }); await sleep(250);
  T('mua cá khi đứng xa quầy bị từ chối', !!a.last('err') && !a.last('inv'));
  a.clear(); a.send({ t: 'landed', rid: 'gia-mao' }); a.send({ t: 'merit', n: 999 }); await sleep(250);
  T('gửi xác nhận giả không được cộng điểm', !a.last('done'));

  // An đi đến quầy, mua cá
  await walk(b, [-9, 3]);
  b.clear(); b.send({ t: 'buy', kind: 'carp', qty: 2 }); await sleep(300);
  let inv = b.last('inv');
  T('An mua 2 chép cam: số dư 94, mang 2 cá', inv && inv.bal === 94 && inv.units.length === 2);
  b.clear(); b.send({ t: 'buy', kind: 'koi', qty: 10 }); await sleep(300);
  T('An mua 10 chép nhiều màu: số dư 44', b.last('inv') && b.last('inv').bal === 44);
  b.clear(); b.send({ t: 'buy', kind: 'koi', qty: 10 }); await sleep(300);
  T('không đủ số dư thì không mua được', !!b.last('err') && !b.last('inv'));
  b.clear(); b.send({ t: 'buy', kind: 'carp', qty: -5 }); b.send({ t: 'buy', kind: 'koi', qty: 1.5 }); b.send({ t: 'buy', kind: 'free', qty: 1 }); await sleep(300);
  T('số lượng/loại cá bất hợp lệ bị từ chối', b.count('err') === 3 && !b.last('inv'));
  b.clear(); b.send({ t: 'release' }); await sleep(250);
  T('thả cá khi đứng xa bến bị từ chối', !!b.last('err') && !b.last('rel_ok'));

  // An mang cá ra bến
  await walk(b, [6, -5]); await walk(b, [6, -9.5]);
  a.clear(); b.clear();
  b.send({ t: 'release' }); await sleep(250);
  const ro = b.last('rel_ok');
  T('máy chủ cấp lượt phóng sinh', !!ro);
  b.send({ t: 'release' }); await sleep(200);
  T('không thể mở hai lượt cùng lúc', !!b.last('err'));
  b.clear(); b.send({ t: 'landed', rid: ro.rid }); await sleep(250);
  T('xác nhận quá sớm bị từ chối, chưa cộng điểm', !!b.last('err') && !b.last('done'));
  await sleep(1800);
  b.clear(); a.clear();
  b.send({ t: 'landed', rid: ro.rid }); await sleep(400);
  const dn = b.last('done');
  T('An nhận đúng +1 công đức, còn 11 cá', dn && dn.merit === 1 && dn.units.length === 11);
  T('Minh nhìn thấy sự kiện phóng sinh (splash)', !!a.last('splash') && a.last('splash').n === 'Bạn An');
  T('Minh không bị cộng nhầm điểm', !a.last('done') && a.last('lb').top.every(t => t.n !== 'Minh'));
  b.clear(); b.send({ t: 'landed', rid: ro.rid }); b.send({ t: 'landed', rid: ro.rid }); await sleep(300);
  T('gửi lặp xác nhận không tạo điểm trùng', !b.last('done') && b.count('err') === 2);
  await sleep(3200);
  const lb = b.last('lb');
  T('bảng xếp hạng từ máy chủ: An 1 điểm', lb.top.length === 1 && lb.top[0].n === 'Bạn An' && lb.top[0].m === 1);
  T('danh sách online đủ 2 người', lb.online.length === 2);

  // Tải lại trang / khởi động lại máy chủ: dữ liệu còn nguyên
  b.close(); await sleep(300);
  const B2 = await post('/api/login', { email: 'an@example.com', password: 'matkhau456' });
  const b2 = await wsConnect(B2.ck); await sleep(300);
  let i2 = b2.last('init');
  T('đăng nhập lại: công đức, cá, số dư còn nguyên', i2.merit === 1 && i2.units.length === 11 && i2.bal === 44);
  b2.close(); a.close(); await sleep(300);
  await stop(); await start();
  const B3 = await post('/api/login', { email: 'an@example.com', password: 'matkhau456' });
  const b3 = await wsConnect(B3.ck); await sleep(300);
  i2 = b3.last('init');
  T('khởi động lại máy chủ: dữ liệu vẫn còn', i2.merit === 1 && i2.units.length === 11 && i2.bal === 44);
  const raw = fs.readFileSync(DATA, 'utf8');
  T('mật khẩu không lưu dạng rõ', !raw.includes('matkhau456') && !raw.includes('matkhau123'));
  b3.close(); await stop();
  try { fs.unlinkSync(DATA); } catch (e) {}
  console.log(`\nKết quả: ${ok} đạt, ${bad} lỗi`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); if (srv) srv.kill(); process.exit(1); });
