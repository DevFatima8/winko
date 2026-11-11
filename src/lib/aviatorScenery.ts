import * as THREE from "three";

const SEGMENT_LENGTH = 120;
const SEGMENTS = 7;
const WORLD_LENGTH = SEGMENT_LENGTH * SEGMENTS;
const SPEED = 36;
const FLIGHT_SPEED = 110;
const ACCELERATION = 0.6;
const noise = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};
const material = (color: number, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });
const transform = new THREE.Object3D();
const color = new THREE.Color();
type ScenicWorld = ReturnType<typeof createAviatorWorld>;
type View = { renderer: THREE.WebGLRenderer; world: ScenicWorld; width: number; height: number; dpr: number };
const views = new WeakMap<HTMLCanvasElement, View>();
const failed = new WeakSet<HTMLCanvasElement>();

function box(parent: THREE.Object3D, geometry: THREE.BufferGeometry, paint: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const mesh = new THREE.Mesh(geometry, paint);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function terrainTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Aviator terrain texture could not be created.");
  ctx.fillStyle = "#465a30";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = ["#637243", "#83915a", "#30462a", "#46572e"][i % 4];
    ctx.fillRect(noise(i) * 256, noise(i + 9000) * 256, 1, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 12);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function facadeTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Aviator building texture could not be created.");
  ctx.fillStyle = "#b5a18b";
  ctx.fillRect(0, 0, 128, 256);
  for (let floor = 0; floor < 8; floor++) {
    ctx.fillStyle = "#a0917d";
    ctx.fillRect(0, floor * 32 + 29, 128, 3);
    for (let col = 0; col < 4; col++) {
      const x = col * 32 + 8, y = floor * 32 + 4;
      ctx.fillStyle = "#e2d2b5";
      ctx.fillRect(x - 2, y - 2, 20, 23);
      ctx.fillStyle = noise(floor * 7 + col) > 0.6 ? "#f5c778" : "#243840";
      ctx.fillRect(x, y, 16, 19);
      ctx.fillStyle = "#72867f";
      ctx.fillRect(x + 2, y + 2, 4, 12);
      ctx.fillStyle = "#ded0b7";
      ctx.fillRect(x + 7, y, 1, 19);
      ctx.fillRect(x, y + 10, 16, 1);
      ctx.fillStyle = "#3c383580";
      ctx.fillRect(x - 2, y + 21, 21, 2);
      ctx.fillStyle = "#e1d2b7";
      ctx.fillRect(x - 3, y + 20, 23, 1);
    }
    for (let i = 0; i < 1000; i++) {
      ctx.fillStyle = i % 2 ? "#493c2920" : "#f6e3bf20";
      ctx.fillRect(noise(i + 3000) * 128, noise(i + 5000) * 256, 1, 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function foliageTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Aviator foliage texture could not be created.");
  ctx.fillStyle = "#829370";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1600; i++) {
    const x = noise(i * 3) * 128, y = noise(i * 3 + 1) * 128;
    ctx.fillStyle = ["#c5cc9a", "#5c7553", "#91a477", "#344d35"][i % 4];
    ctx.beginPath();
    ctx.ellipse(x, y, 1 + noise(i + 7) * 2.5, 0.7 + noise(i + 8), noise(i + 5) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function aircraft() {
  const plane = new THREE.Group();
  plane.name = "red-aircraft";
  const red = material(0xd7192d, 0.3);
  red.metalness = 0.35;
  const trim = material(0xf7d0a0, 0.5);
  const dark = material(0x182b32, 0.18);
  dark.metalness = 0.65;
  const metal = material(0xa59b83, 0.45);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), red);
  body.scale.set(0.95, 0.85, 5.5);
  plane.add(body);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(-0.5, -1.3);
  wingShape.lineTo(-6.7, -0.3);
  wingShape.lineTo(-7.1, 1.2);
  wingShape.lineTo(-0.6, 0.8);
  wingShape.lineTo(0.6, 0.8);
  wingShape.lineTo(7.1, 1.2);
  wingShape.lineTo(6.7, -0.3);
  wingShape.lineTo(0.5, -1.3);
  wingShape.closePath();
  const wing = new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape, { depth: 0.14, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.1, bevelThickness: 0.08 }), red);
  wing.rotation.x = Math.PI / 2;
  plane.add(wing);
  for (const side of [-1, 1]) {
    box(plane, cube, trim, side * 3.9, 0.18, 0.65, 4.4, 0.05, 0.11);
    box(plane, cube, trim, side * 5.7, 0.2, 0.15, 0.12, 0.05, 1.2);
    const tail = box(plane, cube, red, side * 1.35, 0.2, 4, 2.6, 0.15, 1.25);
    tail.rotation.y = side * 0.12;
  }
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), dark);
  canopy.position.set(0, 0.85, -0.8);
  canopy.scale.set(0.57, 0.62, 1.5);
  plane.add(canopy);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 6, 20), trim);
  frame.position.set(0, 1.05, -0.85);
  frame.scale.y = 2.3;
  frame.rotation.x = Math.PI / 2;
  plane.add(frame);
  box(plane, cube, red, 0, 0.8, 3.9, 0.13, 1.65, 1.8);
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.7, 20), metal);
  engine.rotation.x = Math.PI / 2;
  engine.position.z = -5.15;
  plane.add(engine);
  const propeller = new THREE.Group();
  propeller.position.z = -5.65;
  box(propeller, cube, metal, 0, 0, 0, 5, 0.12, 0.16);
  box(propeller, cube, metal, 0, 0, 0, 0.12, 5, 0.16);
  plane.add(propeller);
  for (const side of [-1, 1]) {
    const strut = box(plane, cube, metal, side * 0.9, -0.8, -1.4, 0.12, 1.1, 0.12);
    strut.rotation.z = side * -0.22;
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.22, 14), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.05, -1.3, -1.4);
    plane.add(wheel);
    box(plane, cube, trim, side * 6.5, 0.16, 0.3, 0.18, 0.1, 1.15);
  }
  plane.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });
  return { plane, propeller };
}

/** A persistent 3D world. Object identity/type never depends on the current round or phase. */
export function createAviatorWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7d9693);
  scene.fog = new THREE.Fog(0x7d9693, 220, 470);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.5, 650);
  camera.position.set(0, 72, 43);
  camera.lookAt(0, 3, -15);
  scene.add(new THREE.HemisphereLight(0xd5e7ef, 0x46542d, 1.8));
  const sun = new THREE.DirectionalLight(0xffe6ba, 2.4);
  sun.position.set(-65, 95, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 1, far: 250 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.12;
  scene.add(sun);

  const cube = new THREE.BoxGeometry(1, 1, 1);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: terrainTexture(), roughness: 1 });
  const roadMaterial = material(0x3c4242);
  const pavementMaterial = material(0xa49d85);
  const lineMaterial = material(0xe0d9b7);
  const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x376e76, roughness: 0.28, metalness: 0.35 });
  const trunkMaterial = material(0x60513a);
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: foliageTexture(), roughness: 0.95 });
  const facadeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: facadeTexture(), roughness: 0.9 });
  const roofMaterial = material(0xffffff);
  const rooftopMaterial = material(0x8f918b);
  const balconyMaterial = material(0xaaa08d);
  const glowMaterial = new THREE.MeshStandardMaterial({ color: 0xffd79a, emissive: 0xffa84f, emissiveIntensity: 1.8 });
  const cityPavingMaterial = material(0x837d6e);
  const trunkGeometry = new THREE.CylinderGeometry(0.25, 0.55, 1, 5);
  const crownGeometry = new THREE.SphereGeometry(1, 10, 7);
  const positions = crownGeometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const n = 1 + Math.sin(x * 23 + y * 17 + z * 31) * 0.1;
    positions.setXYZ(i, x * n, y * n, z * n);
  }
  const roofGeometry = new THREE.ConeGeometry(1, 1, 4);
  roofGeometry.rotateY(Math.PI / 4);
  const chunks: THREE.Group[] = [];

  for (let segment = 0; segment < SEGMENTS; segment++) {
    const chunk = new THREE.Group();
    chunk.name = `landscape-${segment}`;
    chunk.userData.segment = segment;
    const ground = box(chunk, cube, groundMaterial, 0, -0.8, -60, 230, 1, 120);
    ground.receiveShadow = true;
    const urban = segment % 3 !== 0;
    chunk.userData.district = urban ? "waterfront-city" : "woodland";
    if (urban) {
      for (const side of [-1, 1]) {
        const block = box(chunk, cube, cityPavingMaterial, side * 33, -0.24, -60, 49, 0.1, 120);
        block.receiveShadow = true;
      }
      for (const z of [-38, -76, -114]) {
        const crossStreet = box(chunk, cube, roadMaterial, 0, -0.15, z, 113, 0.1, 5);
        crossStreet.receiveShadow = true;
        for (const side of [-1, 1]) box(chunk, cube, pavementMaterial, 0, -0.07, z + side * 3, 113, 0.2, 0.7);
      }
    }
    const road = box(chunk, cube, roadMaterial, 0, -0.18, -60, 10, 0.15, 120);
    road.receiveShadow = true;
    for (const side of [-1, 1]) {
      box(chunk, cube, pavementMaterial, side * 5.6, -0.08, -60, 1.1, 0.25, 120);
      box(chunk, cube, lineMaterial, side * 4.3, -0.08, -60, 0.12, 0.02, 120);
    }
    for (let mark = 0; mark < 12; mark++) box(chunk, cube, lineMaterial, 0, -0.07, -mark * 10 - 3, 0.2, 0.02, 4);
    box(chunk, cube, waterMaterial, 66, -0.15, -60, 17, 0.1, 120);
    for (const x of [56.8, 75.2]) box(chunk, cube, pavementMaterial, x, -0.12, -60, 1.2, 0.25, 120);

    const treeCount = urban ? 90 : 130;
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeCount);
    const leaves = new THREE.InstancedMesh(crownGeometry, leafMaterial, treeCount * 7);
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    for (let index = 0; index < treeCount; index++) {
      const seed = segment * 1000 + index * 13;
      const side = index % 2 ? -1 : 1;
      const x = side * (index % 3 === 0 ? 9 + noise(seed) * 5 : urban ? 83 + noise(seed) * 26 : 17 + noise(seed) * 90);
      const z = -noise(seed + 2) * 120;
      const h = 5 + noise(seed + 3) * 5;
      // Keep the river and the village street free of trees.
      const treeX = x > 55 && x < 77 ? x + 26 : x;
      transform.position.set(treeX, h * 0.45, z);
      transform.scale.set(1, h * 0.9, 1);
      transform.rotation.set(0, 0, 0);
      transform.updateMatrix();
      trunks.setMatrixAt(index, transform.matrix);
      for (let crown = 0; crown < 7; crown++) {
        const angle = crown * 2.4 + seed;
        const radius = crown === 0 ? 0 : 2.1;
        transform.position.set(treeX + Math.cos(angle) * radius, h + (crown === 0 ? 1.1 : Math.sin(angle) * 0.8), z + Math.sin(angle) * radius);
        const size = 2.3 + noise(seed + crown + 10);
        transform.scale.set(size * 1.15, size * 0.8, size);
        transform.rotation.set(noise(seed + crown), angle, 0);
        transform.updateMatrix();
        leaves.setMatrixAt(index * 7 + crown, transform.matrix);
        leaves.setColorAt(index * 7 + crown, color.setHSL(0.23 + noise(seed + crown) * 0.055, 0.35 + noise(seed + 1) * 0.15, 0.32 + noise(seed + crown + 8) * 0.14));
      }
    }
    trunks.computeBoundingSphere();
    leaves.computeBoundingSphere();
    chunk.add(trunks, leaves);

    const buildingCount = urban ? 24 : 8;
    const buildings = new THREE.InstancedMesh(cube, facadeMaterial, buildingCount);
    const roofs = new THREE.InstancedMesh(roofGeometry, roofMaterial, buildingCount);
    const rooftopUnits = new THREE.InstancedMesh(cube, rooftopMaterial, buildingCount * 2);
    const balconies = new THREE.InstancedMesh(cube, balconyMaterial, buildingCount * 3);
    buildings.name = "city-buildings";
    roofs.name = "city-roofs";
    rooftopUnits.name = "rooftop-details";
    balconies.name = "facade-balconies";
    buildings.castShadow = buildings.receiveShadow = true;
    roofs.castShadow = true;
    for (let index = 0; index < buildingCount; index++) {
      const seed = segment * 400 + index * 31;
      const side = index % 2 ? -1 : 1;
      const block = urban ? Math.floor(index / 2) % 2 : 0;
      const x = side * (22 + block * 23 + noise(seed + 1) * 3);
      const z = -12 - Math.floor(index / (urban ? 4 : 2)) * (urban ? 19 : 29) + noise(seed + 3) * 4;
      const height = urban ? 10 + noise(seed + 5) * (block ? 25 : 15) : 5 + noise(seed + 5) * 5;
      const width = 10 + noise(seed + 2) * 5;
      const depth = 11 + noise(seed + 4) * 4;
      transform.position.set(x, height / 2, z);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(width, height, depth);
      transform.updateMatrix();
      buildings.setMatrixAt(index, transform.matrix);
      buildings.setColorAt(index, color.setHSL(0.05 + noise(seed + 9) * 0.1, 0.12 + noise(seed + 2) * 0.13, 0.53 + noise(seed) * 0.27));
      const pitched = !urban || index % 5 === 0;
      const roofHeight = pitched ? 3.8 : 0.3;
      transform.position.y = height + roofHeight / 2;
      transform.scale.set(width * 0.8, roofHeight, depth * 0.8);
      transform.updateMatrix();
      roofs.setMatrixAt(index, transform.matrix);
      roofs.setColorAt(index, color.set(pitched ? 0xb37857 : 0x6c777a));
      for (let unit = 0; unit < 2; unit++) {
        transform.position.set(x + (unit ? 1 : -1) * width * 0.23, height + roofHeight + 0.65, z + (unit ? -1.7 : 2));
        transform.scale.set(2.2, 1.3, 2.4);
        transform.updateMatrix();
        rooftopUnits.setMatrixAt(index * 2 + unit, transform.matrix);
      }
      for (let floor = 0; floor < 3; floor++) {
        transform.position.set(x, height * (floor + 1) / 4, z + depth / 2 + 0.7);
        transform.scale.set(width * 0.85, 0.35, 1.7);
        transform.updateMatrix();
        balconies.setMatrixAt(index * 3 + floor, transform.matrix);
      }
    }
    for (const mesh of [buildings, roofs, rooftopUnits, balconies]) mesh.computeBoundingSphere();
    chunk.add(buildings, roofs, rooftopUnits, balconies);
    if (urban) {
      // Waterfront landmarks break up the repeated street grid without changing existing objects.
      for (let tower = 0; tower < 3; tower++) {
        const x = 90 + tower % 2 * 15;
        const z = -20 - tower * 36;
        const height = 32 + noise(segment * 21 + tower) * 16;
        const body = box(chunk, cube, facadeMaterial, x, height / 2, z, 11, height, 15);
        body.castShadow = body.receiveShadow = true;
        for (let terrace = 0; terrace < 3; terrace++) {
          box(chunk, cube, balconyMaterial, x, height * (terrace + 1) / 4, z, 12.2, 0.5, 16.2);
        }
        box(chunk, cube, rooftopMaterial, x, height + 1, z, 7, 2, 10);
        box(chunk, cube, glowMaterial, x, height + 2.2, z, 7.2, 0.15, 10.2);
      }
    }

    // Warm promenade lamps and their water reflections stay anchored to the same segment.
    const lamps = new THREE.InstancedMesh(cube, glowMaterial, 24);
    const reflections = new THREE.InstancedMesh(cube, new THREE.MeshStandardMaterial({ color: 0x9d8e5e, emissive: 0xbd863b, emissiveIntensity: 0.35, roughness: 0.5 }), 12);
    for (let index = 0; index < 24; index++) {
      const x = index % 2 ? 55.7 : 76;
      const z = -5 - Math.floor(index / 2) * 10;
      box(chunk, cube, rooftopMaterial, x, 1.5, z, 0.15, 3, 0.15);
      transform.position.set(x, 3, z);
      transform.scale.set(0.8, 0.4, 0.8);
      transform.updateMatrix();
      lamps.setMatrixAt(index, transform.matrix);
      if (index % 2 === 0) {
        transform.position.set(59.5 + noise(index) * 4, -0.06, z);
        transform.scale.set(0.2 + noise(index + 1) * 0.5, 0.02, 3 + noise(index + 2) * 3);
        transform.updateMatrix();
        reflections.setMatrixAt(index / 2, transform.matrix);
      }
    }
    lamps.computeBoundingSphere();
    reflections.computeBoundingSphere();
    chunk.add(lamps, reflections);

    // A bridge stays attached to its own world segment rather than appearing on a timer.
    const bridge = box(chunk, cube, pavementMaterial, 39, 1, -100, 84, 1.5, 8);
    bridge.receiveShadow = true;
    for (const z of [-104, -96]) box(chunk, cube, lineMaterial, 39, 2.1, z, 84, 0.7, 0.4);
    chunks.push(chunk);
    scene.add(chunk);
  }
  const { plane, propeller } = aircraft();
  plane.position.set(0, 19, 10);
  scene.add(plane);
  const impact = new THREE.Group();
  impact.name = "aircraft-impact";
  const puffGeometry = new THREE.SphereGeometry(1, 10, 7);
  for (let index = 0; index < 16; index++) {
    const paint = new THREE.MeshStandardMaterial({
      color: index < 5 ? 0xffa821 : 0x34383b,
      emissive: index < 5 ? 0xff6500 : 0x000000,
      emissiveIntensity: index < 5 ? 2 : 0,
      transparent: true, opacity: 0, depthWrite: false,
    });
    impact.add(new THREE.Mesh(puffGeometry, paint));
  }
  impact.visible = false;
  scene.add(impact);
  const planePaints = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  plane.traverse(child => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) planePaints.set(child.material, child.material.color.clone());
  });
  return { scene, camera, chunks, plane, propeller, impact, planePaints, lastTime: null as number | null, distance: 0, clock: 0, motionClock: 0, speed: SPEED, phase: "waiting", crashElapsed: 0 };
}

export function advanceAviatorWorld(world: ScenicWorld, now: number, phase: string, _endedAt: number | null) {
  // A tab suspension/clock correction cannot teleport the terrain. Normal motion is time based.
  const delta = world.lastTime === null ? 0 : Math.max(0, Math.min(0.05, (now - world.lastTime) / 1000));
  world.lastTime = now;
  world.clock += delta;
  const targetSpeed = phase === "running" ? FLIGHT_SPEED : SPEED;
  const decay = Math.exp(-ACCELERATION * delta);
  // Integrate the easing curve so acceleration and travel agree at every refresh rate.
  const travel = targetSpeed * delta + (world.speed - targetSpeed) * (1 - decay) / ACCELERATION;
  world.speed = targetSpeed + (world.speed - targetSpeed) * decay;
  world.distance = (world.distance + travel) % WORLD_LENGTH;
  world.motionClock += travel / SPEED;
  for (let index = 0; index < world.chunks.length; index++) {
    // Recycle only behind the camera; all seven segments retain their original meshes.
    const z = ((world.distance - index * SEGMENT_LENGTH + WORLD_LENGTH) % WORLD_LENGTH) - 660;
    world.chunks[index].position.z = z;
  }
  world.propeller.rotation.z = world.motionClock * 85;
  const cameraSway = Math.sin(world.clock * 0.13);
  world.camera.position.x = cameraSway * 2.5;
  world.camera.lookAt(cameraSway * 2, 3, -15);
  // Start the fall on the visible crash frame, not an already-old server timestamp.
  world.crashElapsed = phase === "crashed" ? world.phase === "crashed" ? world.crashElapsed + delta : 0 : 0;
  world.phase = phase;
  const crash = Math.min(2.6, world.crashElapsed);
  const sway = Math.sin(world.motionClock * 1.05);
  world.plane.position.set(sway * 0.55 + crash * 0.8, 19 + Math.sin(world.motionClock * 1.8) * 0.25 - crash * 3 - crash * crash * 2.3, 10 - crash * 7);
  world.plane.rotation.set(-0.025 - crash * 0.65, sway * 0.025 + crash * 0.35, sway * -0.085 + crash * 2.4);
  world.plane.scale.setScalar(1.05 * Math.max(0.35, 1 - crash * 0.23));
  world.plane.visible = phase !== "crashed" || crash < 2.5;
  world.impact.visible = phase === "crashed" && crash < 2.6;
  world.impact.position.copy(world.plane.position);
  world.impact.children.forEach((child, index) => {
    if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
    const spread = Math.min(1.8, crash * 2.5);
    const angle = index * 2.4;
    child.position.set(Math.cos(angle) * spread, Math.sin(angle) * spread + crash * index * 0.2, Math.sin(index) * spread);
    child.scale.setScalar(index < 5 ? Math.max(0.01, 1.1 - crash * 0.7) : 0.35 + crash * 0.8);
    child.material.opacity = index < 5 ? Math.max(0, 1 - crash * 1.3) : Math.max(0, 0.6 - crash * 0.2);
  });
  // Like the reference, the falling plane turns into a dark grey silhouette.
  const scorch = Math.min(1, crash * 3);
  world.planePaints.forEach((base, paint) => paint.color.copy(base).lerp(CRASH_GREY, scorch));
}

const CRASH_GREY = new THREE.Color(0x4a4f52);

export function disposeAviatorWorld(world: ScenicWorld) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  world.scene.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    geometries.add(child.geometry);
    for (const paint of Array.isArray(child.material) ? child.material : [child.material]) {
      materials.add(paint);
      if (paint instanceof THREE.MeshStandardMaterial && paint.map) textures.add(paint.map);
    }
    if (child instanceof THREE.InstancedMesh) child.dispose();
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(paint => paint.dispose());
  textures.forEach(texture => texture.dispose());
  world.scene.traverse(child => { if (child instanceof THREE.DirectionalLight) child.shadow.dispose(); });
  world.scene.clear();
}

export function drawAviatorScenery(canvas: HTMLCanvasElement, width: number, height: number, dpr: number, phase: string, now: number, endedAt: number | null) {
  if (width < 1 || height < 1 || failed.has(canvas)) return;
  let view = views.get(canvas);
  if (!view) {
    const context = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
    if (!context) {
      failed.add(canvas);
      canvas.dispatchEvent(new ErrorEvent("aviator-render-error", { message: "3D graphics could not start. Enable hardware acceleration or open the game in an updated browser." }));
      return;
    }
    const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    view = { renderer, world: createAviatorWorld(), width: 0, height: 0, dpr: 0 };
    views.set(canvas, view);
  }
  const ratio = Math.min(dpr, 1.5);
  if (view.width !== width || view.height !== height || view.dpr !== ratio) {
    view.renderer.setPixelRatio(ratio);
    view.renderer.setSize(width, height, false);
    view.world.camera.aspect = width / height;
    view.world.camera.updateProjectionMatrix();
    Object.assign(view, { width, height, dpr: ratio });
  }
  advanceAviatorWorld(view.world, now, phase, endedAt);
  view.renderer.render(view.world.scene, view.world.camera);
}

export function disposeAviatorScenery(canvas: HTMLCanvasElement) {
  const view = views.get(canvas);
  if (view) {
    disposeAviatorWorld(view.world);
    view.renderer.dispose();
    views.delete(canvas);
  }
  failed.delete(canvas);
}
