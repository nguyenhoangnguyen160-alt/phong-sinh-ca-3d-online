#!/usr/bin/env python3
"""Tạo public/index.html (client online) từ file thế giới 3D đơn người chơi bằng các bản vá chính xác."""
import re, sys, os
src = sys.argv[1] if len(sys.argv) > 1 else '../phong-sinh-the-gioi-3d.html'
s = open(src, encoding='utf-8').read()

def sub(old, new, n=1):
    global s
    assert s.count(old) == n, ('không khớp %d lần: ' % s.count(old)) + old[:70]
    s = s.replace(old, new)

# ---- CSS + HTML ----
sub('</style>', '''#auth{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,25,20,.35)}#auth[hidden]{display:none}
.ac{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:22px;width:100%;max-width:360px;max-height:92%;overflow:auto}
.ac input{width:100%;font:inherit;padding:10px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--ink);margin:4px 0 10px}
.tabs{display:flex;gap:6px;margin-bottom:12px}.tabs button[aria-pressed=true]{background:var(--btn);color:var(--btnt)}
.sw{display:flex;gap:8px;margin:6px 0 12px}.sw button{width:36px;height:36px;border-radius:50%;padding:0}.sw button[aria-pressed=true]{outline:3px solid var(--btn)}
.er{color:#b3261e;min-height:1.4em;font-size:13px}
@media (prefers-color-scheme:dark){.er{color:#ffb4a9}}
</style>''')
sub('<button id="invBtn">Hành trang</button></div>', '<button id="invBtn">Hành trang</button><button id="lbBtn">Xếp hạng</button></div>')
sub('<section id="inv" class="pnl" hidden></section>', '<section id="inv" class="pnl" hidden></section><section id="lb" class="pnl" hidden></section><div id="auth"></div>')
sub('<title>Phóng Sinh Tích Công Đức: Thế giới 3D</title>', '<title>Phóng Sinh Online</title>')

# ---- Dữ liệu: bỏ localStorage, dùng bản sao trạng thái từ máy chủ ----
a = s.index('/* ===== Dữ liệu'); b = s.index('/* ===== Khởi tạo 3D ===== */')
s = s[:a] + '''/* ===== Trạng thái (bản sao từ máy chủ; máy chủ là nguồn sự thật) ===== */
let S={balance:0,units:[],releases:[],merit:0,low:0};
try{S.low=localStorage.getItem('pscd_low')?1:0}catch(e){}
const save=()=>{try{localStorage.setItem('pscd_low',S.low?1:'')}catch(e){}};
const owned=()=>S.units.filter(u=>u.state==='owned'),merit=()=>S.merit;
''' + s[b:]

# ---- Nhân vật: vật liệu áo/mũ đổi được màu ----
sub('const g=new THREE.Group(),body=new THREE.Group();body.position.y=.7;g.add(body);', 'const sm=mt(shirt),hm=mt(hatC),g=new THREE.Group(),body=new THREE.Group();body.position.y=.7;g.add(body);')
sub('mt(c));o.position.set(x,y,z);par.add(o)', '(c&&c.isMaterial?c:mt(c)));o.position.set(x,y,z);par.add(o)')
sub('bx(.5,.7,.3,shirt,0,.35,0,body)', 'bx(.5,.7,.3,sm,0,.35,0,body)')
sub('limb(-.33,.68,body,.14,.6,shirt)', 'limb(-.33,.68,body,.14,.6,sm)')
sub('limb(.33,.68,body,.14,.6,shirt)', 'limb(.33,.68,body,.14,.6,sm)')
sub('ConeGeometry(.4,.2,16),mt(hatC))', 'ConeGeometry(.4,.2,16),hm)')
sub('const o={g,body,armL:', 'const o={sm,hm,g,body,armL:')

# ---- Trạng thái ban đầu và điều khiển ----
sub("let phase='free',zone=null,rel=null,", "let phase='lobby',zone=null,rel=null,")
sub("addEventListener('keydown',e=>{", "addEventListener('keydown',e=>{if(phase==='lobby'||/INPUT/.test(document.activeElement.tagName))return;")
sub('const toggleInv=()=>{const i=$(\'#inv\');', 'const toggleInv=()=>{$(\'#lb\').hidden=true;const i=$(\'#inv\');')
sub("else if('buy' in b.dataset){if(buy(selKind,selQty)){toast('Bạn đã mua cá thành công');sellerT=1.2;hud()}}", "else if('buy' in b.dataset){net.send({t:'buy',kind:selKind,qty:selQty});return}")
sub("else if('top' in b.dataset){S.balance+=50;save();hud()}", "else if('top' in b.dataset){net.send({t:'topup'});return}")
sub('Nhận thêm 50 điểm demo', 'Nhận 50 điểm demo (24 giờ/lần)')

# ---- Phóng sinh: máy chủ cấp lượt và xác nhận ----
sub("rel={t:0,u:u.id,kind:u.kind,spawned:false,landed:false,fx:pl.g.position.x,fz:pl.g.position.z,fh:heading};",
    "$('#lb').hidden=true;rel={t:0,u:null,rid:null,kind:u.kind,spawned:false,landed:false,fx:pl.g.position.x,fz:pl.g.position.z,fh:heading};net.send({t:'release'});")
a = s.index('function landed(f){'); b = s.index('function renderShop(){')
s = s[:a] + '''let lastSplash=new THREE.Vector3();
function landed(f){if(rel)rel.landed=true;lastSplash.copy(f.g.position);net.send({t:'landed',rid:f.uid})}
function plusFloat(){const v=lastSplash.clone().project(camera),d=document.createElement('div');d.className='plus';d.textContent='+1 công đức';d.style.left=((v.x+1)/2*innerWidth)+'px';d.style.top=((1-v.y)/2*innerHeight)+'px';document.body.appendChild(d);setTimeout(()=>d.remove(),1800)}
''' + s[b:]
sub("rel.t+=dt;const k=clamp(rel.t/.7,0,1)", "rel.t+=dt;if(!rel.rid&&rel.t>8){phase='free';rel=null;toast('Máy chủ không phản hồi');return requestAnimationFrame(frame)}const k=clamp(rel.t/.7,0,1)")
sub('if(!rel.spawned&&rel.t>=1.3){', 'if(!rel.spawned&&rel.t>=1.3&&rel.rid){')
sub('uid:rel.u,', 'uid:rel.rid,')

# ---- Gửi vị trí, người chơi khác ----
sub(' /* hoạt họa nhân vật */', ''' if(phase==='lobby'){yaw+=dt*.15;spd=0}
 if(me&&phase!=='lobby'&&t-lastSend>.1){lastSend=t;net.send({t:'pos',x:+P.x.toFixed(2),z:+P.z.toFixed(2),h:+heading.toFixed(2),s:phase==='releasing'?'rel':'idle',c:carrying?1:0})}
 /* hoạt họa nhân vật */''')
sub(' /* camera thứ ba */', ''' remotes.forEach(r=>{
  const g=r.g,dx=r.tx-g.position.x,dz=r.tz-g.position.z,k=Math.min(1,dt*10),mv=Math.hypot(dx,dz)*k/Math.max(dt,.001);
  g.position.x+=dx*k;g.position.z+=dz*k;r.hd=ang(r.hd,r.th,Math.min(1,dt*10));g.rotation.y=r.hd;
  r.ws+=(Math.min(1,mv/3)-r.ws)*Math.min(1,dt*8);const sw=Math.sin(t*9+r.ph)*r.ws,rl=r.s==='rel';
  r.bend+=((rl?.55:0)-r.bend)*Math.min(1,dt*6);r.body.rotation.x=r.bend;g.position.y=Math.abs(sw)*.05;
  r.legL.rotation.x=sw*.7;r.legR.rotation.x=-sw*.7;
  const arm=rl?-1.5:r.c?-1.05:0;r.armL.rotation.x=arm||-sw*.6;r.armR.rotation.x=arm||sw*.6;
 });
 /* camera thứ ba */''')

# ---- Mạng, đăng nhập, tạo nhân vật, bảng xếp hạng ----
net_code = r'''
const SHIRTS=[0x6b8f71,0xb5523b,0x3f6f9a,0xc99a2e,0x8a5a8a,0x4a4a4a],HATS=[0xe5cf98,0xd8c27a,0xb99a5b,0xf0e6c8];
let me=null,lastSend=0,bye=false,look=[0,0],plLabel=null;const remotes=new Map(),A=$('#auth');
const esc=s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const net={ws:null,send(o){if(this.ws&&this.ws.readyState===1)this.ws.send(JSON.stringify(o))}};
function nameSprite(txt){const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');x.font='600 30px "Be Vietnam Pro",sans-serif';x.textAlign='center';const w=Math.min(250,x.measureText(txt).width+24);x.fillStyle='rgba(20,35,30,.65)';x.fillRect(128-w/2,8,w,44);x.fillStyle='#fff';x.fillText(txt,128,42,240);const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false,transparent:true}));s.scale.set(1.8,.45,1);s.position.y=2.45;s.renderOrder=9;return s}
const applyLook=(h,a)=>{h.sm.color.setHex(SHIRTS[a[0]]);h.hm.color.setHex(HATS[a[1]])};
function applyInv(m){S.balance=m.bal;S.units=m.units;S.merit=m.merit;S.releases=m.rel;hud();if(!$('#shop').hidden)renderShop();if(!$('#inv').hidden)renderInv()}
function addRemote(p){const h=human(SHIRTS[p.a[0]],HATS[p.a[1]]);applyLook(h,p.a);h.g.position.set(p.x,0,p.z);h.g.add(nameSprite(p.n));Object.assign(h,{tx:p.x,tz:p.z,th:p.h,hd:p.h,s:'idle',c:0,ws:0,bend:0,ph:R()*6});remotes.set(p.i,h)}
function clearRemotes(){remotes.forEach(r=>scene.remove(r.g));remotes.clear()}
function connect(){
 const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');net.ws=ws;
 ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(x){return}onMsg(m)};
 ws.onclose=()=>{if(bye)return;me=null;phase='lobby';rel=null;clearRemotes();closeShop();A.hidden=false;A.innerHTML='<div class="ac"><p>Mất kết nối. Đang thử kết nối lại…</p></div>';setTimeout(bootAuth,2000)};
}
function onMsg(m){
 switch(m.t){
  case 'init':
   me={id:m.id,name:m.name};look=m.look;applyLook(pl,m.look);if(plLabel)pl.g.remove(plLabel);plLabel=nameSprite(m.name);pl.g.add(plLabel);
   pl.g.position.set(m.x,0,m.z);heading=PI;yaw=0;pitch=.35;dist=6;camP.set(m.x,3,m.z+6);applyInv(m);phase='free';A.hidden=true;
   toast('Đi đến quầy cá bên trái để mua cá. Dùng W A S D, kéo chuột để xoay camera');break;
  case 'players':{
   const seen=new Set();
   m.p.forEach(p=>{if(me&&p.i===me.id)return;seen.add(p.i);const r=remotes.get(p.i);if(!r)addRemote(p);else{r.tx=p.x;r.tz=p.z;r.th=p.h;r.s=p.s;r.c=p.c}});
   remotes.forEach((r,i)=>{if(!seen.has(i)){scene.remove(r.g);remotes.delete(i)}});break}
  case 'inv':applyInv(m);if(m.ok==='buy'){toast('Bạn đã mua cá thành công');sellerT=1.2}break;
  case 'rel_ok':if(rel){rel.rid=m.rid;rel.kind=m.kind}break;
  case 'done':applyInv(m);plusFloat();toast('Phóng sinh thành công — +1 Công Đức');break;
  case 'splash':{
   const f=makeFish(m.k);Object.assign(f,{h:PI,sc:.62,sp:1.3+R()*.4,turn:0,tt:0,age:0,state:'swim'});f.g.position.set(m.x,-.35,m.z);f.g.scale.setScalar(.62);scene.add(f.g);fishes.push(f);splash(m.x,m.z);
   const rl=fishes.filter(x=>!x.amb);if(rl.length>14){scene.remove(rl[0].g);fishes.splice(fishes.indexOf(rl[0]),1)}
   toast(m.n+' vừa phóng sinh một con cá');break}
  case 'snap':pl.g.position.x=m.x;pl.g.position.z=m.z;break;
  case 'lb':renderLb(m);break;
  case 'err':toast(m.m);if(rel&&!rel.rid){phase='free';rel=null}break;
 }
}
let lbd=null;
function renderLb(m){
 lbd=m;if($('#lb').hidden)return;
 $('#lb').innerHTML=`<h2>Thế giới</h2><p><b>Đang trực tuyến: ${m.online.length} người</b></p><p class="note">${m.online.map(esc).join(', ')}</p><p><b>Bảng xếp hạng công đức</b></p>${m.top.length?`<ul>${m.top.map((r,i)=>`<li><span>${i+1}. ${esc(r.n)}</span><b>${r.m}</b></li>`).join('')}</ul>`:'<p class="note">Chưa có ai phóng sinh.</p>'}<p><b>Vừa phóng sinh</b></p>${m.ev.length?`<ul>${m.ev.map(e=>`<li><span>${esc(e.n)}<small>${KINDS[e.k]?KINDS[e.k].name:''}</small></span><b>+1</b></li>`).join('')}</ul>`:'<p class="note">Chưa có sự kiện.</p>'}<div class="row"><button data-x>Đóng</button><button data-out>Đăng xuất</button></div>`;
}
$('#lbBtn').onclick=()=>{$('#inv').hidden=true;const l=$('#lb');l.hidden=!l.hidden;if(!l.hidden&&lbd)renderLb(lbd)};
$('#lb').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if('x' in b.dataset)$('#lb').hidden=true;if('out' in b.dataset){bye=true;fetch('/api/logout',{method:'POST'}).then(()=>location.reload())}});
/* đăng nhập, đăng ký, tạo nhân vật */
let av='login',aerr='';
async function api(p,b){try{const r=await fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});const j=await r.json().catch(()=>({}));return Object.assign({ok:r.ok},j)}catch(e){return{ok:false,err:'Không kết nối được máy chủ'}}}
function showAuth(){
 A.hidden=false;
 if(av==='char'){applyLook(pl,look);A.innerHTML=`<form class="ac" id="af"><h2>Tạo nhân vật</h2><label>Tên nhân vật (3 đến 20 ký tự)<input id="nm" maxlength="20" autocomplete="off" required></label><p>Áo</p><div class="sw">${SHIRTS.map((c,i)=>`<button type="button" data-sh="${i}" aria-label="Áo ${i+1}" aria-pressed="${look[0]===i}" style="background:#${c.toString(16).padStart(6,'0')}"></button>`).join('')}</div><p>Nón</p><div class="sw">${HATS.map((c,i)=>`<button type="button" data-ht="${i}" aria-label="Nón ${i+1}" aria-pressed="${look[1]===i}" style="background:#${c.toString(16).padStart(6,'0')}"></button>`).join('')}</div><div class="er" role="alert">${esc(aerr)}</div><button class="pri" type="submit">Vào thế giới</button></form>`;return}
 A.innerHTML=`<form class="ac" id="af"><h2>Phóng Sinh Online</h2><div class="tabs"><button type="button" data-v="login" aria-pressed="${av==='login'}">Đăng nhập</button><button type="button" data-v="register" aria-pressed="${av==='register'}">Đăng ký</button></div><label>Email<input id="em" type="email" autocomplete="email" required></label><label>Mật khẩu<input id="pw" type="password" minlength="8" maxlength="72" autocomplete="${av==='login'?'current-password':'new-password'}" required></label><div class="er" role="alert">${esc(aerr)}</div><button class="pri" type="submit">${av==='login'?'Đăng nhập':'Tạo tài khoản'}</button><p class="note">Bản demo: giá minh họa, không thanh toán thật.</p></form>`;
}
A.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.v){av=b.dataset.v;aerr='';showAuth()}
 if(b.dataset.sh!==undefined||b.dataset.ht!==undefined){const nm=$('#nm').value;if(b.dataset.sh!==undefined)look[0]=+b.dataset.sh;else look[1]=+b.dataset.ht;showAuth();$('#nm').value=nm}});
A.addEventListener('submit',async e=>{
 e.preventDefault();const btn=A.querySelector('.pri');btn.disabled=true;aerr='';
 if(av==='char'){const r=await api('/api/character',{name:$('#nm').value,shirt:look[0],hat:look[1]});if(r.ok){A.innerHTML='<div class="ac"><p>Đang vào thế giới…</p></div>';return connect()}aerr=r.err||'Có lỗi xảy ra';const nm=$('#nm').value;showAuth();$('#nm').value=nm;return}
 const r=await api('/api/'+av,{email:$('#em').value,password:$('#pw').value});
 if(r.ok){if(r.hasChar){A.innerHTML='<div class="ac"><p>Đang vào thế giới…</p></div>';return connect()}av='char';showAuth();return}
 aerr=r.err||'Có lỗi xảy ra';showAuth();
});
async function bootAuth(){
 phase='lobby';dist=3.8;pitch=.2;
 const r=await api('/api/me');
 if(r.ok&&r.hasChar){A.hidden=false;A.innerHTML='<div class="ac"><p>Đang vào thế giới…</p></div>';return connect()}
 av=r.ok?'char':'login';showAuth();
}
hud();frame();bootAuth();
}'''
a = s.index("hud();frame();\nsetTimeout(()=>toast('Đi đến quầy cá bên trái")
b = s.rindex('}\n</script>')
s = s[:a] + net_code.lstrip('\n') + '\n' + s[b+1:]

os.makedirs('public', exist_ok=True)
open('public/index.html', 'w', encoding='utf-8').write(s)
print('OK', len(s), 'bytes')
