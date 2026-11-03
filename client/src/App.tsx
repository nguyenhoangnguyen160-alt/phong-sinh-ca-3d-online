import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sky, Text } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { io, Socket } from "socket.io-client";

type Player = { id: string; name: string; x: number; z: number; rotation: number; action: string };
type State = { balance: number; fish: number; merit: number };
type Notice = { text: string; kind?: "error" | "success" };
// Production: dùng cùng origin để Socket.IO và React chạy trên một Render Web Service.
// Dev: có thể cấu hình VITE_SERVER_URL trong client/.env.
const SERVER = import.meta.env.VITE_SERVER_URL?.trim() || (import.meta.env.DEV ? "http://localhost:3001" : window.location.origin);
const ACK_TIMEOUT = 9000;

type Ack = { ok: boolean; error?: string; message?: string; player?: Player; balance?: number; fish?: number; merit?: number };


function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return <group position={position} scale={scale}>
    <mesh position={[0, 1, 0]} castShadow><cylinderGeometry args={[0.12, 0.2, 2, 7]} /><meshStandardMaterial color="#755239" /></mesh>
    {[[-0.35, 2, 0], [0.25, 2.3, 0.1], [0, 2.65, -0.15]].map((p, i) =>
      <mesh key={i} position={p as [number, number, number]} castShadow>
        <icosahedronGeometry args={[0.8 - i * 0.08, 1]} />
        <meshStandardMaterial color={i % 2 ? "#3c7951" : "#568b55"} roughness={1} />
      </mesh>)}
  </group>;
}
function Fish({ position = [0, 0, 0] as [number, number, number] }) {
  const tail = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (tail.current) tail.current.rotation.y = Math.sin(clock.elapsedTime * 7) * 0.35; });
  return <group position={position} rotation={[0, 0, -0.1]}>
    <mesh castShadow><sphereGeometry args={[0.34, 20, 14]} /><meshStandardMaterial color="#f18b32" roughness={0.34} /></mesh>
    <mesh position={[0.29, 0.02, 0]} rotation={[0, 0, -0.2]}><coneGeometry args={[0.22, 0.36, 5]} /><meshStandardMaterial color="#e46d25" /></mesh>
    <mesh ref={tail} position={[-0.36, 0, 0]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[0.18, 0.32, 5]} /><meshStandardMaterial color="#f7a64e" /></mesh>
    <mesh position={[0.19, 0.12, 0.28]}><sphereGeometry args={[0.045, 8, 8]} /><meshBasicMaterial color="#171717" /></mesh>
    <mesh position={[0.19, 0.12, -0.28]}><sphereGeometry args={[0.045, 8, 8]} /><meshBasicMaterial color="#171717" /></mesh>
  </group>;
}
function Person({ player, local = false }: { player: Player; local?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    const target = new THREE.Vector3(player.x, 0, player.z);
    ref.current.position.lerp(target, local ? 0.8 : 0.18);
    ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, player.rotation, 0.18);
  });
  return <group ref={ref} position={[player.x, 0, player.z]}>
    <mesh position={[0, 0.82, 0]} castShadow><capsuleGeometry args={[0.28, 0.62, 4, 8]} /><meshStandardMaterial color={local ? "#2d6d65" : "#4c7295"} /></mesh>
    <mesh position={[0, 1.42, 0]} castShadow><sphereGeometry args={[0.22, 16, 12]} /><meshStandardMaterial color="#d9a47f" /></mesh>
    <mesh position={[0, 1.58, 0]}><sphereGeometry args={[0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#3a2b20" /></mesh>
    <Text position={[0, 1.9, 0]} fontSize={0.22} color="#173c35" outlineWidth={0.012} outlineColor="#ffffff" anchorX="center">{player.name}</Text>
  </group>;
}
function World({ socket, joined, name, notice }: { socket: Socket; joined: boolean; name: string; notice: (n: Notice) => void }) {
  const { camera } = useThree();
  const [pos, setPos] = useState({ x: 0, z: 3, rotation: 0 });
  const [others, setOthers] = useState<Record<string, Player>>({});
  const keys = useRef<Set<string>>(new Set());
  const moveTimer = useRef(0);
  const [fishOnHand] = useState(false);
  const [releaseAnim] = useState(false);
  const localPlayer: Player = { id: socket.id || "local", name, ...pos, action: keys.current.size ? "walk" : "idle" };

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest("input, textarea, select")) return; if (["w","a","s","d","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) { e.preventDefault(); keys.current.add(e.key.toLowerCase()); } };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const virtual = (e: Event) => {
      const { key, pressed } = (e as CustomEvent<{key: string; pressed: boolean}>).detail;
      if (pressed) keys.current.add(key); else keys.current.delete(key);
    };
    const clear = () => keys.current.clear();
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    window.addEventListener("phongsinh:move", virtual); window.addEventListener("blur", clear);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("phongsinh:move", virtual); window.removeEventListener("blur", clear); };
  }, []);
  useEffect(() => {
    const init = (list: Player[]) => setOthers(Object.fromEntries(list.map(p => [p.id, p])));
    const add = (p: Player) => setOthers(old => ({ ...old, [p.id]: p }));
    const moved = (p: Player) => setOthers(old => old[p.id] ? ({ ...old, [p.id]: p }) : old);
    const left = (id: string) => setOthers(old => { const n = { ...old }; delete n[id]; return n; });
    socket.on("world:init", init); socket.on("player:joined", add); socket.on("player:moved", moved); socket.on("player:left", left);
    return () => { socket.off("world:init", init); socket.off("player:joined", add); socket.off("player:moved", moved); socket.off("player:left", left); };
  }, [socket]);
  useFrame((_, delta) => {
    if (joined && keys.current.size) {
      let dx = 0, dz = 0;
      if (keys.current.has("w") || keys.current.has("arrowup")) dz -= 1;
      if (keys.current.has("s") || keys.current.has("arrowdown")) dz += 1;
      if (keys.current.has("a") || keys.current.has("arrowleft")) dx -= 1;
      if (keys.current.has("d") || keys.current.has("arrowright")) dx += 1;
      const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
      setPos(p => {
        const next = { x: THREE.MathUtils.clamp(p.x + dx * delta * 4, -17, 17), z: THREE.MathUtils.clamp(p.z + dz * delta * 4, -17, 17), rotation: Math.atan2(dx, dz) };
        moveTimer.current += delta;
        if (moveTimer.current > 0.07) { socket.emit("player:move", { ...next, action: "walk" }); moveTimer.current = 0; }
        return next;
      });
    }
    const target = new THREE.Vector3(pos.x, 4.5, pos.z + 7.5);
    camera.position.lerp(target, 0.08);
    camera.lookAt(pos.x, 0.8, pos.z - 1);
  });
  useEffect(() => {
    const onRelease = (event: { playerId: string; playerName: string }) => {
      notice({ text: `${event.playerName} vừa phóng sinh cá!`, kind: "success" });
    };
    socket.on("fish:released", onRelease);
    return () => { socket.off("fish:released", onRelease); };
  }, [socket, notice]);

  const nearShop = Math.hypot(pos.x - 5, pos.z - 1) < 3.3;
  const nearRiver = pos.z < -5;



  return <>
    <color attach="background" args={["#c7e4ed"]} />
    <fog attach="fog" args={["#c7e4ed", 24, 55]} />
    <ambientLight intensity={1.25} />
    <directionalLight position={[5, 12, 7]} intensity={2.1} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
    <Sky distance={450000} sunPosition={[20, 35, 10]} turbidity={7} rayleigh={1.3} />
    <hemisphereLight args={["#e6f8ff", "#7f9864", 1.0]} />
    {/* Ground and river */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow><planeGeometry args={[42, 42]} /><meshStandardMaterial color="#87a96b" roughness={1} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, -11]} receiveShadow><planeGeometry args={[44, 12]} /><meshStandardMaterial color="#8b9c79" /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, -19]} receiveShadow><planeGeometry args={[60, 10]} /><meshStandardMaterial color="#468fbd" roughness={0.2} metalness={0.12} /></mesh>
    {Array.from({ length: 12 }, (_, i) => <Tree key={i} position={[-19 + i * 3.5, 0, i % 2 ? -7.5 : 5]} scale={0.8 + (i % 3) * 0.18} />)}
    {/* Shop */}
    <group position={[5, 0, 1]}>
      <mesh position={[0, 0.7, 0]} castShadow><boxGeometry args={[3.2, 1.4, 1.7]} /><meshStandardMaterial color="#a4774c" /></mesh>
      <mesh position={[0, 1.65, 0]} castShadow><boxGeometry args={[3.7, 0.18, 2.1]} /><meshStandardMaterial color="#70462d" /></mesh>
      <mesh position={[0, 1.98, 0]} rotation={[0, 0, 0.06]}><coneGeometry args={[2.15, 0.7, 4]} /><meshStandardMaterial color="#956b43" /></mesh>
      <Text position={[0, 2.45, 0.8]} fontSize={0.28} color="#4d3422" anchorX="center">QUẦY BÁN CÁ</Text>
      <mesh position={[0, 0.35, -1.05]}><boxGeometry args={[1.1, 0.6, 0.55]} /><meshStandardMaterial color="#69a9c2" transparent opacity={0.8} /></mesh>
      <Fish position={[0, 0.6, -1.05]} />
    </group>
    <Text position={[0, 0.05, -12.8]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.65} color="#ffffff" anchorX="center">KHU VỰC PHÓNG SINH</Text>
    {joined && <Person player={localPlayer} local />}
    {Object.values(others).filter(p => p.id !== socket.id).map(p => <Person key={p.id} player={p} />)}
    {fishOnHand && <group position={[pos.x + 0.45, 1.1, pos.z - 0.45]}><Fish /></group>}
    {releaseAnim && <mesh position={[pos.x, 0.2, -10]}><ringGeometry args={[0.3, 0.8, 32]} /><meshBasicMaterial color="#e4ffff" transparent opacity={0.7} side={THREE.DoubleSide} /></mesh>}
    {joined && <mesh position={[pos.x, 0.015, pos.z]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.48, 0.53, 32]} /><meshBasicMaterial color="#fff1b3" /></mesh>}
    {/* Simple in-world instructions */}
    {joined && nearShop && <Text position={[5, 3.1, 1]} fontSize={0.3} color="#ffffff" anchorX="center">Quầy hàng — bấm MUA CÁ</Text>}
    {joined && nearRiver && <Text position={[pos.x, 2.4, pos.z]} fontSize={0.25} color="#ffffff" anchorX="center">Bờ sông — bấm PHÓNG SINH</Text>}
  </>;
}

export default function App() {
  const socket = useMemo(() => io(SERVER, { autoConnect: true, reconnection: true, reconnectionAttempts: Infinity, timeout: 8000 }), []);
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [state, setState] = useState<State>({ balance: 100, fish: 0, merit: 0 });
  const [online, setOnline] = useState(0);
  const [connected, setConnected] = useState(socket.connected);
  const [connecting, setConnecting] = useState(false);
  const [joining, setJoining] = useState(false);
  useEffect(() => {
    const update = (s: State) => setState(s);
    const onConnect = () => { setConnected(true); setConnecting(false); };
    const onDisconnect = () => { setConnected(false); setJoined(false); setJoining(false); };
    const onError = () => { setConnected(false); setConnecting(false); };
    const count = (n: number) => setOnline(n);
    socket.on("player:state", update);
    socket.on("world:count", count);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onError);
    // React StrictMode có thể cleanup rồi mount lại effect trong dev.
    if (!socket.connected) socket.connect();
    return () => {
      socket.off("player:state", update); socket.off("world:count", count);
      socket.off("connect", onConnect); socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onError); socket.disconnect();
    };
  }, [socket]);
  const showNotice = useCallback((n: Notice) => { setNotice(n); window.setTimeout(() => setNotice(null), 4500); }, []);
  const join = () => {
    if (joining) return;
    if (name.trim().length < 2) return showNotice({ text: "Tên cần có ít nhất 2 ký tự.", kind: "error" });
    if (!socket.connected) {
      setConnecting(true); socket.connect();
      return showNotice({ text: "Máy chủ chưa kết nối. Đang thử lại, hãy nhấn Vào thế giới sau khi kết nối.", kind: "error" });
    }
    setJoining(true);
    socket.timeout(ACK_TIMEOUT).emit("player:join", { name: name.trim() }, (err: Error | null, r: Ack) => {
      setJoining(false);
      if (err) return showNotice({ text: "Máy chủ phản hồi quá lâu. Hãy thử lại.", kind: "error" });
      if (r?.ok) { setJoined(true); showNotice({ text: `Chào mừng ${name.trim()} đến Cồn Bình An!`, kind: "success" }); }
      else showNotice({ text: r?.error || "Không thể vào thế giới.", kind: "error" });
    });
  };
  const action = (event: "shop:buy" | "fish:release") => {
    if (!socket.connected) return showNotice({ text: "Đã mất kết nối. Hãy kiểm tra mạng.", kind: "error" });
    const payload = event === "fish:release" ? { releaseId: crypto.randomUUID() } : {};
    socket.timeout(ACK_TIMEOUT).emit(event, payload, (err: Error | null, r: Ack) => {
      if (err) return showNotice({ text: "Không nhận được phản hồi từ máy chủ. Hãy thử lại.", kind: "error" });
      if (r?.ok && r.balance !== undefined && r.fish !== undefined && r.merit !== undefined)
        setState({ balance: r.balance, fish: r.fish, merit: r.merit });
      showNotice({ text: r?.message || r?.error || "Thao tác không thành công.", kind: r?.ok ? "success" : "error" });
    });
  };
  const mobileKey = (key: string, pressed: boolean) => window.dispatchEvent(new CustomEvent("phongsinh:move", { detail: {key, pressed} }));
  return <main className="app">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">◉</span><div><strong>PHÓNG SINH</strong><small>Thế giới bình an bên sông</small></div></div>
      <div className="stats"><div><small>CÔNG ĐỨC</small><strong>{state.merit}</strong></div><div><small>CÁ ĐANG MANG</small><strong>{state.fish}</strong></div><div><small>NGƯỜI CHƠI</small><strong>{online}</strong></div></div>
    </header>
    <section className="game">
      <div className={`connection ${connected ? "is-online" : "is-offline"}`} role="status"><span className="connection-dot" />{connected ? "Máy chủ trực tuyến" : connecting ? "Đang kết nối..." : "Máy chủ ngoại tuyến"}</div>
      <Canvas shadows camera={{ position: [0, 5, 10], fov: 55 }} dpr={[1, 1.5]}>
        <Suspense fallback={null}><World socket={socket} joined={joined} name={name || "Khách"} notice={showNotice} /></Suspense>
      </Canvas>
      {!joined && <div className="join-card">
        <div className="eyebrow">CHÀO MỪNG BẠN</div><h1>Bình an bên dòng sông</h1>
        <p>Đặt tên nhân vật rồi bước vào thế giới phóng sinh 3D.</p>
        <label htmlFor="player-name">Tên nhân vật</label>
        <input id="player-name" value={name} maxLength={20} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Minh An" onKeyDown={e => e.key === "Enter" && join()} />
        <button onClick={join} disabled={name.trim().length < 2 || joining}>{joining ? "Đang vào thế giới..." : "Vào thế giới"}</button>
        <small className="hint">{connected ? "Sẵn sàng khám phá!" : "Nếu máy chủ miễn phí đang khởi động, hãy thử lại sau ít phút."} Tên chưa gắn tài khoản thật.</small>
      </div>}
      {joined && <div className="hud">
        <div className="money"><span>Ví demo</span><strong>{state.balance} xu</strong></div>
        <div className="controls"><span>W A S D · Di chuyển</span><span>Đi đến quầy hàng để mua cá</span></div>
        <div className="actions">
          <button onClick={() => action("shop:buy")}>🐟 Mua cá · 10 xu</button>
          <button className="release" onClick={() => action("fish:release")}>✨ Phóng sinh cá</button>
        </div>
        <p className="hint">Đi đến gần quầy cá ở phía bên phải để mua · Ra bờ sông phía trước để thả cá.</p>
        <div className="mobile-pad" aria-label="Điều khiển di chuyển">
          <div />
          <button aria-label="Tiến" onPointerDown={e => {e.preventDefault(); mobileKey("w", true);}} onPointerUp={() => mobileKey("w", false)} onPointerCancel={() => mobileKey("w", false)}>▲</button>
          <div />
          <button aria-label="Trái" onPointerDown={e => {e.preventDefault(); mobileKey("a", true);}} onPointerUp={() => mobileKey("a", false)} onPointerCancel={() => mobileKey("a", false)}>◀</button>
          <button aria-label="Lùi" onPointerDown={e => {e.preventDefault(); mobileKey("s", true);}} onPointerUp={() => mobileKey("s", false)} onPointerCancel={() => mobileKey("s", false)}>▼</button>
          <button aria-label="Phải" onPointerDown={e => {e.preventDefault(); mobileKey("d", true);}} onPointerUp={() => mobileKey("d", false)} onPointerCancel={() => mobileKey("d", false)}>▶</button>
        </div>
      </div>}
      {notice && <div className={`toast ${notice.kind || ""}`}>{notice.text}</div>}
      <div className="scene-label">CỒN BÌNH AN <span>•</span> KHU VỰC VEN SÔNG</div>
    </section>
    <footer><span>🌿 Một hành động nhỏ, một tấm lòng lành.</span><span>Phóng Sinh 3D · Bản 1.0</span></footer>
  </main>;
}
