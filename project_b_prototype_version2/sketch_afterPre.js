let img_background;
let img_cup;

let params = {
  gravity_x: 0,
  gravity_y: 0.02,
  attract_strength: 0.01,
  merge_dist: 3,
  min_radius: 8,
  max_radius: 12,
  damping: 0.99,
};

let cup_width = 80;
let cup_height = 200;
let cup_bottom_ratio = 0.62;
let rotation_speed = 0.03;
let emit_rate = 24;
let max_particles = 200;

const ORDER_TOLERANCE = 4;
const GRAVITY_REFRESH_MS = 30000;
const PULSE_INTERVAL = 300;
const PULSE_DURATION = 70;
const ENABLE_DEBUG_SKIP = true; // comment out or set to false to disable presentation skip
const ORDER_PANEL_WIDTH = 300;
const ORDER_PANEL_HEIGHT = 138;
const MATERIAL_SLOT_HEIGHT = 86;
const GEL_LAYOUT = [
  { x: 0.2, y: 0.32, r: 30 },
  { x: 0.8, y: 0.52, r: 30 }
];
const MATERIAL_SLOT_LAYOUTS = {
  1: [0.5],
  2: [0.38, 0.62],
  3: [0.28, 0.5, 0.72],
  4: [0.18, 0.4, 0.6, 0.82]
};

const MATERIAL_LIBRARY = {
  espresso: {
    label: "Espresso",
    particleColor: [145, 92, 58],
    emitterColor: [145, 92, 58]
  },
  water: {
    label: "Water",
    particleColor: [145, 210, 255],
    emitterColor: [145, 210, 255]
  },
  steamedMilk: {
    label: "Steamed Milk",
    particleColor: [248, 238, 224],
    emitterColor: [235, 228, 214]
  },
  milkFoam: {
    label: "Milk Foam",
    particleColor: [255, 255, 255],
    emitterColor: [245, 240, 232]
  }
};

const ORDER_RECIPES = [
  { key: "espresso", label: "Espresso", ingredients: { espresso: 10 } },
  { key: "americano", label: "Americano", ingredients: { espresso: 10, water: 30 } },
  { key: "macchiato", label: "Macchiato", ingredients: { espresso: 10, milkFoam: 10 } },
  { key: "flatWhite", label: "Flat White", ingredients: { espresso: 10, steamedMilk: 30 } },
  { key: "latte", label: "Latte", ingredients: { espresso: 10, steamedMilk: 40, milkFoam: 10 } }
];

const GRAVITY_MODES = [
  { key: "tutorial", label: "Stable Pour", pulseStrength: 0.06 },
  { key: "horizontalDrift", label: "Side Drift", pulseStrength: 0.06 },
  { key: "drift", label: "Full Drift", pulseStrength: 0.06 },
  { key: "pulse", label: "Pulse Field", pulseStrength: 0.085 }
];

let particles = [];
let boundaries = [];
let emitters = [];
let gels = [];
let cup;
let frameCount_emit = 0;
let cupStats = createEmptyCupStats();
let currentOrder = null;
let servedOrders = 0;
let levelFrame = 0;
let gameState = "orderPreview";
let activeGravityMode = null;
let nextGravityRefreshMs = 0;
let pulseFramesLeft = 0;
let pulseVector = null;
let pulseIndex = 0;

function preload() {
  img_background = loadImage('assets/space.png');
  img_cup = loadImage('assets/cup.png');
}

function createEmptyCupStats() {
  return {
    total: 0,
    espresso: 0,
    water: 0,
    steamedMilk: 0,
    milkFoam: 0,
    other: 0
  };
}

function makeOrder(recipeIndex) {
  let recipe = ORDER_RECIPES[recipeIndex];
  let totalTarget = 0;
  for (let kind in recipe.ingredients) {
    totalTarget += recipe.ingredients[kind];
  }

  return {
    recipeIndex: recipeIndex,
    label: recipe.label,
    ingredients: { ...recipe.ingredients },
    totalTarget,
    tolerance: ORDER_TOLERANCE
  };
}

function pickRandomRecipeIndex() {
  return floor(random(ORDER_RECIPES.length));
}

function pickRandomGravityMode() {
  return GRAVITY_MODES[floor(random(GRAVITY_MODES.length))];
}

function refreshGravityMode() {
  if (activeGravityMode && millis() < nextGravityRefreshMs) return;

  activeGravityMode = { ...pickRandomGravityMode() };
  nextGravityRefreshMs = millis() + GRAVITY_REFRESH_MS;
  levelFrame = 0;
  pulseFramesLeft = 0;
  pulseVector = null;
  pulseIndex = 0;
}

function getGravityRefreshSecondsLeft() {
  return max(0, ceil((nextGravityRefreshMs - millis()) / 1000));
}

function resetCupPosition() {
  cup_width = 80;
  cup_height = 200;
  cup = new Cup(width / 2, height * 0.72, cup_width, cup_height);
  cup.angle = 0;
  cup.idleRotation = 0.005;
}

function resetWorldState() {
  frameCount_emit = 0;

  particles = [];
  boundaries = [];
  emitters = [];
  gels = [];
  cupStats = createEmptyCupStats();

  resetCupPosition();
}

function setupEmittersForOrder() {
  let kinds = Object.keys(currentOrder.ingredients);
  let slots = MATERIAL_SLOT_LAYOUTS[kinds.length] || MATERIAL_SLOT_LAYOUTS[4];

  for (let i = 0; i < kinds.length; i++) {
    let kind = kinds[i];
    let material = MATERIAL_LIBRARY[kind];
    emitters.push(new Emitter({
      x: width * slots[i],
      y: MATERIAL_SLOT_HEIGHT,
      maxDrops: 9999,
      kind: kind,
      label: material.label,
      particleColor: material.particleColor,
      emitterColor: material.emitterColor
    }));
  }
}

function setupGels() {
  for (let i = 0; i < GEL_LAYOUT.length; i++) {
    let gelInfo = GEL_LAYOUT[i];
    gels.push(new SpillGel(width * gelInfo.x, height * gelInfo.y, gelInfo.r));
  }
}

function loadOrder(recipeIndex) {
  currentOrder = makeOrder(recipeIndex);
  emit_rate = 24;
  max_particles = max(180, currentOrder.totalTarget * 3);

  resetWorldState();
  setupEmittersForOrder();
  setupGels();
  gameState = "orderPreview";
}

function generateNextOrder() {
  loadOrder(pickRandomRecipeIndex());
}

function restartCurrentOrder() {
  if (!currentOrder) return;
  loadOrder(currentOrder.recipeIndex);
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  cup = new Cup(width / 2, height / 2, cup_width, cup_height);
  refreshGravityMode();
  generateNextOrder();
}

function draw() {
  background(0);
  imageMode(CENTER);
  image(img_background, width / 2, height / 2, width, height);
  if (!currentOrder) return;

  refreshGravityMode();
  if (gameState === "playing") {
    levelFrame++;
  }
  updateOrderGravity();
  updateEmission();

  let gravity = createVector(params.gravity_x, params.gravity_y);
  for (let p of particles) { p.applyForce(gravity); }

  // ====== 优化后的 O(N^2) 粒子交互循环 ======
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      let a = particles[i], b = particles[j];
      let dx = b.pos.x - a.pos.x;
      let dy = b.pos.y - a.pos.y;
      let dSq = dx * dx + dy * dy;
      let minDist = (a.r + b.r) * 0.85;

      if (dSq > minDist * minDist) {
        // 1. 吸引力逻辑 (距离较远时)
        let d = constrain(sqrt(dSq), 5, 300);
        let strength = (params.attract_strength * a.r * b.r) / (d * d);

        // 【优化】直接使用原始 x/y 数学计算，避免实例化 p5.Vector
        let fx = (dx / d) * strength;
        let fy = (dy / d) * strength;

        a.acc.x += fx;
        a.acc.y += fy;
        b.acc.x -= fx;
        b.acc.y -= fy;

      } else if (dSq > 0.0001) {
        // 2. 碰撞排斥逻辑 (重叠堆积时)
        let d = sqrt(dSq);
        let overlap = minDist - d;

        // 【优化】手动计算法线 (nx, ny)，杜绝 createVector().normalize()
        let nx = dx / d;
        let ny = dy / d;

        // 【优化】位置修正 (Position Correction)
        let cx = nx * overlap * 0.5;
        let cy = ny * overlap * 0.5;
        a.pos.x -= cx;
        a.pos.y -= cy;
        b.pos.x += cx;
        b.pos.y += cy;

        // 【优化】动量交换/速度碰撞 (Momentum Exchange)
        let rvx = b.vel.x - a.vel.x;
        let rvy = b.vel.y - a.vel.y;
        let velAlongNormal = rvx * nx + rvy * ny; // 点乘

        if (velAlongNormal < 0) {
          let restitution = 0.2;
          let impulseMag = -(1 + restitution) * velAlongNormal * 0.5;
          let ix = nx * impulseMag;
          let iy = ny * impulseMag;

          a.vel.x -= ix;
          a.vel.y -= iy;
          b.vel.x += ix;
          b.vel.y += iy;
        }
      }
    }
  }

  cup.setPos(mouseX, mouseY, particles);
  let currentMoveSpeed = 0;

  if (keyIsDown(65) || keyIsDown(37)) { // A or left arrow
    currentMoveSpeed = -rotation_speed;
    cup.idleRotation = -0.005;
  }
  else if (keyIsDown(68) || keyIsDown(39)) { // D or right arrow
    currentMoveSpeed = rotation_speed;
    cup.idleRotation = 0.005;
  }
  else {
    currentMoveSpeed = cup.idleRotation + map(noise(frameCount * 0.01), 0, 1, -0.05, 0.05);
  }

  cup.angle += currentMoveSpeed;

  cup.setPos(mouseX, mouseY, particles);
  cup.updateBoundaries();

  for (let p of particles) {
    p.update();
    p.edges();
  }

  particles = particles.filter((p) => !p.isOffscreen);

  for (let p of particles) {
    for (let b of boundaries) b.collide(p);
    for (let b of cup.walls) b.collide(p);
  }

  for (let g of gels) {
    g.update(particles);
  }

  cup.countCaught(particles);
  cupStats = getCupStats();
  checkOrderState();

  for (let p of particles) p.display();
  for (let b of boundaries) b.display();
  for (let e of emitters) e.display();
  cup.display();
  for (let g of gels) g.display();
  drawInfo();
}

function updateEmission() {
  if (gameState !== "playing") return;
  if (particles.length >= max_particles) return;

  frameCount_emit++;
  if (frameCount_emit % emit_rate !== 0) return;

  for (let e of emitters) {
    e.emit();
  }
}

function updateOrderGravity() {
  let gx = 0;
  let gy = 0.02;
  if (!activeGravityMode) return;

  if (activeGravityMode.key === "tutorial") {
    gx = 0;
    gy = 0.024;
  } else if (activeGravityMode.key === "horizontalDrift") {
    gx = 0.018 * sin(levelFrame * 0.012);
    gy = 0.024;
  } else {
    gx = 0.018 * sin(levelFrame * 0.012);
    gy = 0.006 + 0.016 * cos(levelFrame * 0.009);

    if (activeGravityMode.key === "pulse") {
      if (pulseFramesLeft <= 0 && levelFrame > 120 && levelFrame % PULSE_INTERVAL === 0) {
        startGravityPulse();
      }

      if (pulseFramesLeft > 0 && pulseVector) {
        gx = pulseVector.x;
        gy = pulseVector.y;
        pulseFramesLeft--;
      }
    }
  }

  params.gravity_x = gx;
  params.gravity_y = gy;
}

function startGravityPulse() {
  let pulseStrength = activeGravityMode ? activeGravityMode.pulseStrength || 0.06 : 0.06;
  const pulseDirections = [
    createVector(pulseStrength, 0),
    createVector(-pulseStrength, 0),
    createVector(0, pulseStrength),
    createVector(0, -pulseStrength)
  ];

  pulseVector = pulseDirections[pulseIndex % pulseDirections.length].copy();
  pulseIndex++;
  pulseFramesLeft = PULSE_DURATION;
}

function getCupStats() {
  let stats = createEmptyCupStats();

  for (let p of particles) {
    if (!p.inCup) continue;
    stats.total++;
    if (p.kind === "espresso") stats.espresso++;
    else if (p.kind === "water") stats.water++;
    else if (p.kind === "steamedMilk") stats.steamedMilk++;
    else if (p.kind === "milkFoam") stats.milkFoam++;
    else stats.other++;
  }

  return stats;
}

function isOrderComplete() {
  if (!currentOrder) return false;
  if (cupStats.total !== currentOrder.totalTarget) return false;

  for (let kind in currentOrder.ingredients) {
    let target = currentOrder.ingredients[kind];
    let actual = cupStats[kind] || 0;
    if (abs(actual - target) > currentOrder.tolerance) return false;
  }

  for (let kind of Object.keys(MATERIAL_LIBRARY)) {
    if (currentOrder.ingredients[kind]) continue;
    if ((cupStats[kind] || 0) > 0) return false;
  }

  return cupStats.other === 0;
}

function checkOrderState() {
  if (gameState === "playing" && isOrderComplete()) {
    gameState = "orderComplete";
    servedOrders++;
  }
}

function drawPanel(x, y, w, h) {
  push();
  noStroke();
  fill(0, 110);
  rect(x, y, w, h, 16);
  pop();
}

function drawOrderOverlay() {
  if (!currentOrder) return;

  let panelX = width / 2 - 220;
  let panelY = height * 0.11;
  let panelW = 440;
  let panelH = 124;

  drawPanel(panelX, panelY, panelW, panelH);

  fill(255);
  textAlign(CENTER, CENTER);

  if (gameState === "orderPreview") {
    textSize(28);
    text(currentOrder.label, width / 2, panelY + 34);
    textSize(16);
    text("Order ready", width / 2, panelY + 64);
    text("Click anywhere to begin brewing", width / 2, panelY + 92);
  } else if (gameState === "orderComplete") {
    textSize(28);
    text("Order complete", width / 2, panelY + 34);
    textSize(16);
    text(currentOrder.label + " served", width / 2, panelY + 64);
    text("Click anywhere for the next order", width / 2, panelY + 92);
  }
}

class Particle {
  constructor(x, y, r, kind, baseColor) {
    this.pos = createVector(x, y);
    this.vel = createVector(random(-1, 1), random(-1, 1));
    this.acc = createVector(0, 0);
    this.r = r;
    this.bright = map(r, params.min_radius, params.max_radius, 200, 255);
    this.col = 255;
    this.kind = kind || "default";
    this.baseColor = baseColor || [255, 255, 255];
    this.inCup = false;
    this.prevPos = null;
    this.isOffscreen = false;
    //
    this.rotFluct = random(-0.01, 0.01);
    this.sizeFluct = random(0.005, 0.015);
  }

  applyForce(force) { this.acc.add(force); }

  update() {
    this.prevPos = this.pos.copy();
    this.vel.add(this.acc);
    this.vel.mult(params.damping);
    this.pos.add(this.vel);
    this.acc.set(0, 0);
  }

  edges() {
    this.isOffscreen = (
      this.pos.x < -this.r ||
      this.pos.x > width + this.r ||
      this.pos.y < -this.r ||
      this.pos.y > height + this.r
    );
  }

  display() {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(frameCount * this.rotFluct);
    scale(sin(frameCount * this.sizeFluct) * 0.15 + 1);
    noStroke();
    const c = this.getDisplayColor();
    fill(c[0], c[1], c[2], this.bright * 0.5);
    stroke(c[0], c[1], c[2], this.bright);
    //ellipse(this.pos.x, this.pos.y, this.r * 2, this.r * 2);
    ellipse(0, 0, this.r * 2, this.r * 1.8);
    pop();
  }

  getDisplayColor() {
    if (this.kind === "espresso") return this.inCup ? [175, 120, 82] : this.baseColor;
    if (this.kind === "water") return this.inCup ? [110, 185, 255] : this.baseColor;
    if (this.kind === "steamedMilk") return this.inCup ? [255, 248, 232] : this.baseColor;
    if (this.kind === "milkFoam") return this.inCup ? [255, 252, 244] : this.baseColor;
    if (this.inCup) return [100, 180, 255];
    return this.baseColor;
  }
}

// I asked Gemini and Claude to help me figure out how to implement the cup boundaries 
// in a way that is more stable and less likely to cause tunneling issues, 
// especially when the cup is moving fast. 
// The key idea is to use continuous collision detection (CCD) 
// by checking if the particle's movement segment intersects with the boundary segment, 
// and if so, calculate the collision response based on the point of intersection rather than just the closest point. 
// This should help prevent particles from tunneling through the walls 
// when the cup is moved quickly.
class Boundary {
  constructor(x1, y1, x2, y2, fixedNormal) {
    this.a = createVector(x1, y1);
    this.b = createVector(x2, y2);
    this.fixedNormal = fixedNormal || null;
    this.precompute();
  }

  setPoints(x1, y1, x2, y2, fixedNormal) {
    this.a.set(x1, y1);
    this.b.set(x2, y2);
    if (fixedNormal) {
      this.fixedNormal = fixedNormal;
    }
    this.precompute();
  }

  precompute() {
    this.ab = p5.Vector.sub(this.b, this.a);
    this.len = this.ab.mag();
    if (this.len === 0) {
      this.dir = createVector(1, 0);
      this.norm = createVector(0, 1);
      return;
    }
    this.dir = this.ab.copy().normalize();
    this.norm = createVector(-this.dir.y, this.dir.x);
  }

  closest(pos) {
    let ap = p5.Vector.sub(pos, this.a);
    let t = constrain(ap.dot(this.dir) / this.len, 0, 1);
    let cl = p5.Vector.add(this.a, p5.Vector.mult(this.ab, t));
    return { closest: cl, t, dist: p5.Vector.dist(pos, cl) };
  }

  segmentsCross(p1, p2) {
    let r = p5.Vector.sub(p2, p1);
    let s = this.ab;
    let rxs = r.x * s.y - r.y * s.x;
    if (abs(rxs) < 0.0001) return false;
    let qp = p5.Vector.sub(this.a, p1);
    let t = (qp.x * s.y - qp.y * s.x) / rxs;
    let u = (qp.x * r.y - qp.y * r.x) / rxs;
    return (t >= 0 && t <= 1 && u >= 0 && u <= 1);
  }

  collide(p) {
    let { closest, t, dist } = this.closest(p.pos);
    let hit = (t > 0 && t < 1 && dist <= p.r);
    let isCCD = false;

    if (!hit && p.prevPos) {
      if (this.segmentsCross(p.prevPos, p.pos)) {
        hit = true;
        isCCD = true;
        let res = this.closest(p.prevPos);
        closest = res.closest;
        dist = res.dist;
      }
    }

    if (!hit) return;

    let n;
    if (this.fixedNormal) {
      // if the boundary has a fixed normal (like cup walls), use it directly, 
      // but flip if particle is on the "inside" side
      if (p.inCup) {
        n = this.fixedNormal.copy();
      } else {
        n = p5.Vector.mult(this.fixedNormal, -1);
      }
    } else {
      // otherwise calculate the normal from the closest point, 
      // and use previous position for better stability if CCD is involved
      let ref;
      if (isCCD) {
        ref = p.prevPos;
      } else {
        ref = p.pos;
      }
      let toP = p5.Vector.sub(ref, closest);
      if (toP.mag() > 0.001) {
        n = toP.normalize();
      } else {
        n = this.norm.copy();
      }
    }

    // only collide if moving towards the boundary
    if (p.vel.dot(n) >= 0) return;

    let vDotN = p.vel.dot(n);
    p.vel.sub(p5.Vector.mult(n, 2 * vDotN));
    p.vel.mult(0.6);

    // push particle out of collision
    p.pos = p5.Vector.add(closest, p5.Vector.mult(n, p.r + 0.5));
  }

  display() {
    stroke(255, 160);
    strokeWeight(2);
    line(this.a.x, this.a.y, this.b.x, this.b.y);
  }
}

class Cup {
  constructor(x, y, hw, h) {
    this.pos = createVector(x, y);
    this.topHW = hw;
    this.bottomHW = hw * cup_bottom_ratio;
    this.h = h;
    this.angle = 0;
    this.idleRotation = 0.005;
    // walls[0] = left, walls[1] = bottom, walls[2] = right
    this.walls = [
      new Boundary(0, 0, 0, 0),
      new Boundary(0, 0, 0, 0),
      new Boundary(0, 0, 0, 0)
    ];
    this.updateBoundaries();
  }

  setPos(x, y, particlesArray) {
    let target = createVector(x, y);
    let d = p5.Vector.dist(target, this.pos);
    let maxMove = 10;
    let newPos = this.pos.copy();
    if (d > maxMove) {
      newPos.add(p5.Vector.sub(target, this.pos).normalize().mult(maxMove));
    } else {
      newPos.set(x, y);
    }
    let delta = p5.Vector.sub(newPos, this.pos);
    if (delta.magSq() > 0.1 && particlesArray) {
      for (let p of particlesArray) {
        if (p.inCup) {
          p.pos.add(delta);
          p.vel.add(p5.Vector.mult(delta, 0.05));
        }
      }
    }
    this.pos = newPos;
  }

  _toWorld(lx, ly) {
    let ca = cos(this.angle), sa = sin(this.angle);
    return createVector(this.pos.x + lx * ca - ly * sa, this.pos.y + lx * sa + ly * ca);
  }

  // transfer a local direction vector (lx, ly) 
  // to world coordinates based on cup's angle
  _rotateDir(lx, ly) {
    let ca = cos(this.angle), sa = sin(this.angle);
    return createVector(lx * ca - ly * sa, lx * sa + ly * ca);
  }

  _halfWidthAtLocalY(ly) {
    let halfH = this.h / 2;
    let t = constrain((ly + halfH) / this.h, 0, 1);
    return lerp(this.topHW, this.bottomHW, t);
  }

  _localInwardNormal(ax, ay, bx, by) {
    let dx = bx - ax;
    let dy = by - ay;
    let normalA = createVector(-dy, dx);
    let normalB = createVector(dy, -dx);
    let mid = createVector((ax + bx) * 0.5, (ay + by) * 0.5);
    let toInside = createVector(-mid.x, -mid.y);
    let chosen = normalA.dot(toInside) > normalB.dot(toInside) ? normalA : normalB;
    return chosen.normalize();
  }

  updateBoundaries() {
    let halfH = this.h / 2;
    let topLeftLocal = createVector(-this.topHW, -halfH);
    let topRightLocal = createVector(this.topHW, -halfH);
    let bottomLeftLocal = createVector(-this.bottomHW, halfH);
    let bottomRightLocal = createVector(this.bottomHW, halfH);

    let tl = this._toWorld(topLeftLocal.x, topLeftLocal.y);
    let tr = this._toWorld(topRightLocal.x, topRightLocal.y);
    let bl = this._toWorld(bottomLeftLocal.x, bottomLeftLocal.y);
    let br = this._toWorld(bottomRightLocal.x, bottomRightLocal.y);

    let leftNormal = this._localInwardNormal(topLeftLocal.x, topLeftLocal.y, bottomLeftLocal.x, bottomLeftLocal.y);
    let bottomNormal = this._localInwardNormal(bottomLeftLocal.x, bottomLeftLocal.y, bottomRightLocal.x, bottomRightLocal.y);
    let rightNormal = this._localInwardNormal(topRightLocal.x, topRightLocal.y, bottomRightLocal.x, bottomRightLocal.y);

    this.walls[0].setPoints(tl.x, tl.y, bl.x, bl.y, this._rotateDir(leftNormal.x, leftNormal.y)); // left wall
    this.walls[1].setPoints(bl.x, bl.y, br.x, br.y, this._rotateDir(bottomNormal.x, bottomNormal.y)); // bottom wall
    this.walls[2].setPoints(tr.x, tr.y, br.x, br.y, this._rotateDir(rightNormal.x, rightNormal.y)); // right wall
  }

  countCaught(particles) {
    let count = 0;
    let halfH = this.h / 2;
    let ca = cos(-this.angle), sa = sin(-this.angle); // global to local
    let w_ca = cos(this.angle), w_sa = sin(this.angle); // local to global

    for (let p of particles) {
      // calculate relative position (lx, ly) in cup's local space
      // Lx = 0 inside the cup, ly = 0 at the cup opening, ly = this.h at the cup bottom
      // | lx |   |  cos(-θ)  -sin(-θ) |   | dx |
      // |    | = |                    | * |    |
      // | ly |   |  sin(-θ)   cos(-θ) |   | dy |
      let dx = p.pos.x - this.pos.x;
      let dy = p.pos.y - this.pos.y;
      let lx = dx * ca - dy * sa;
      let ly = dx * sa + dy * ca;

      // calculate relative velocity (vx, vy)
      let vx = p.vel.x * ca - p.vel.y * sa;
      let vy = p.vel.x * sa + p.vel.y * ca;

      let halfWidthAtY = this._halfWidthAtLocalY(ly);
      let prevHalfWidth = p.prevLy !== undefined ? this._halfWidthAtLocalY(p.prevLy) : halfWidthAtY;

      // check if the particle's current physical position is within the cup's safe volume:
      let inBox = (lx > -halfWidthAtY + p.r && lx < halfWidthAtY - p.r && ly > -halfH && ly < halfH - p.r);

      if (p.inCup) {
        if (!inBox) {
          if (ly < -halfH) {
            p.inCup = false;
          } else {
            if (lx <= -halfWidthAtY + p.r) { lx = -halfWidthAtY + p.r + 0.1; vx = abs(vx) * 0.6; }
            else if (lx >= halfWidthAtY - p.r) { lx = halfWidthAtY - p.r - 0.1; vx = -abs(vx) * 0.6; }
            if (ly >= halfH - p.r) { ly = halfH - p.r - 0.1; vy = -abs(vy) * 0.6; }
            halfWidthAtY = this._halfWidthAtLocalY(ly);
            inBox = (lx > -halfWidthAtY + p.r && lx < halfWidthAtY - p.r && ly > -halfH && ly < halfH - p.r);
          }
        }
      } else {
        if (inBox) {
          if (p.prevLy !== undefined && p.prevLy < -halfH) {
            p.inCup = true;
          } else {
            if (p.prevLx !== undefined) {
              if (p.prevLx >= prevHalfWidth) { lx = halfWidthAtY + p.r + 0.1; vx = abs(vx) * 0.6; }
              else if (p.prevLx <= -prevHalfWidth) { lx = -halfWidthAtY - p.r - 0.1; vx = -abs(vx) * 0.6; }
              else if (p.prevLy >= halfH) { ly = halfH + p.r + 0.1; vy = abs(vy) * 0.6; }
            } else {
              ly = -halfH - p.r - 0.1;
            }
            inBox = false;
          }
        }
      }

      // transfer the corrected local position and velocity back to global coordinates
      p.pos.x = this.pos.x + lx * w_ca - ly * w_sa;
      p.pos.y = this.pos.y + lx * w_sa + ly * w_ca;
      p.vel.x = vx * w_ca - vy * w_sa;
      p.vel.y = vx * w_sa + vy * w_ca;

      // record previous local position and inCup state for next frame's logic
      p.prevLx = lx;
      p.prevLy = ly;
      p.inCup = inBox;

      if (p.inCup) count++;
    }
    return count;
  }

  display() {
    if (!img_cup) return;
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.angle);
    imageMode(CENTER);
    image(img_cup, 0, 0, this.topHW * 2.2, this.h * 1.2);
    pop();
  }
}

class Emitter {
  constructor(config) {
    this.pos = createVector(config.x, config.y);
    this.kind = config.kind || "default";
    this.label = config.label || this.kind;
    this.maxDrops = config.maxDrops || 100;
    this.emittedCount = 0;
    this.particleColor = config.particleColor || [255, 255, 255];
    this.emitterColor = config.emitterColor || [180, 220, 255];
  }

  emit() {
    let px = this.pos.x + random(-4, 4);
    let r = random(params.min_radius, params.max_radius);
    let p = new Particle(px, this.pos.y, r, this.kind, this.particleColor);
    p.vel.set(random(-0.3, 0.3), random(0.5, 1.5));
    particles.push(p);
    this.emittedCount++;
    return true;
  }

  display() {
    drawPanel(this.pos.x - 58, this.pos.y - 34, 116, 68);
    fill(this.emitterColor[0], this.emitterColor[1], this.emitterColor[2], 220);
    noStroke();
    ellipse(this.pos.x, this.pos.y, 28, 28);

    if (this.kind !== "default") {
      fill(255);
      textAlign(CENTER, CENTER);
      textSize(12);
      text(this.label, this.pos.x, this.pos.y - 24);
    }
  }
}

class SpillGel {
  constructor(x, y, r) {
    this.pos = createVector(x, y);
    this.baseR = r;
    this.r = r;
    this.stored = 0;
    this.storedParticles = [];
    this.wanderOffset = random(1000);
  }

  update(particlesArray) {
    // floating in zero gravity with a bit of noise-based wandering
    this.pos.x += map(noise(this.wanderOffset), 0, 1, -1, 1);
    this.pos.y += map(noise(this.wanderOffset + 1000), 0, 1, -1, 1);
    this.wanderOffset += 0.005;

    // limit movement to stay within canvas bounds
    this.pos.x = constrain(this.pos.x, this.r, width - this.r);
    this.pos.y = constrain(this.pos.y, this.r, height - this.r);

    // delete particles that collide with the gel and increase stored count, but only if they are outside the cup
    for (let i = particlesArray.length - 1; i >= 0; i--) {
      let p = particlesArray[i];
      if (!p.inCup) {
        let d = p5.Vector.dist(this.pos, p.pos);
        if (d < this.r + p.r) {
          this.stored++;
          this.storedParticles.push({
            kind: p.kind,
            baseColor: p.baseColor ? [...p.baseColor] : [255, 255, 255]
          });
          this.r = this.baseR + this.stored * 0.5; // be bigger as it absorbs more
          particlesArray.splice(i, 1); // remove from the physical world
        }
      }
    }
  }

  squeeze(particlesArray) {
    if (this.stored > 0) {
      // five per squeeze, and give them a random initial velocity to spread them out a bit
      let releaseCount = min(this.stored, 5);
      for (let i = 0; i < releaseCount; i++) {
        let r = random(params.min_radius, params.max_radius);
        let releasedParticle = this.storedParticles.pop() || { kind: "default", baseColor: [255, 255, 255] };
        // spawn outside the gel's absorb radius so released drops are not reabsorbed immediately
        let releaseOffset = this.r + r + 4;
        let p = new Particle(
          this.pos.x + random(-6, 6),
          this.pos.y + releaseOffset,
          r,
          releasedParticle.kind,
          releasedParticle.baseColor
        );
        p.vel = createVector(random(-1.5, 1.5), random(2.5, 5.5));
        particlesArray.push(p);
      }
      this.stored -= releaseCount;
      this.r = this.baseR + this.stored * 0.5;
    }
  }

  display() {
    noStroke();
    fill(255, constrain(100 + this.stored * 10, 100, 255));
    ellipse(this.pos.x, this.pos.y, this.r * 2);

    fill(255);
    textAlign(CENTER, CENTER);
    textSize(14);
    text(this.stored, this.pos.x, this.pos.y);
  }
}

function drawInfo() {
  if (!currentOrder) return;

  let ingredientKinds = Object.keys(currentOrder.ingredients);
  let panelX = 12;
  let panelY = 12;
  let panelH = 214 + ingredientKinds.length * 24;
  let recipePanelX = width - ORDER_PANEL_WIDTH - 12;
  let recipePanelY = 12;
  let subtitle = "Match each ingredient within 4 particles. Total must match exactly.";
  if (gameState === "orderPreview") subtitle = "Click to start brewing this order.";
  if (gameState === "orderComplete") subtitle = "Order served. Click for the next order.";

  drawPanel(panelX, panelY, 320, panelH);
  drawPanel(recipePanelX, recipePanelY, ORDER_PANEL_WIDTH, ORDER_PANEL_HEIGHT);

  noStroke();
  fill(255);
  textAlign(LEFT, BASELINE);

  textSize(20);
  text(currentOrder.label, panelX + 16, panelY + 28);
  textSize(14);
  text("Orders served: " + servedOrders, panelX + 16, panelY + 54);
  text("Gravity mode: " + (activeGravityMode ? activeGravityMode.label : ""), panelX + 16, panelY + 76);
  text("Next gravity shuffle: " + getGravityRefreshSecondsLeft() + "s", panelX + 16, panelY + 98);
  text("Gravity vector: " + nf(params.gravity_x, 1, 3) + ", " + nf(params.gravity_y, 1, 3), panelX + 16, panelY + 120);
  text("Cup total: " + cupStats.total + " / " + currentOrder.totalTarget, panelX + 16, panelY + 142);
  text("Tolerance: +/- " + currentOrder.tolerance + " per ingredient", panelX + 16, panelY + 164);
  text(subtitle, panelX + 16, panelY + 186, 286);

  let y = panelY + 232;
  for (let kind of ingredientKinds) {
    let label = MATERIAL_LIBRARY[kind].label;
    text(label + ": " + (cupStats[kind] || 0) + " / " + currentOrder.ingredients[kind], panelX + 16, y);
    y += 16;
  }

  textSize(18);
  text("Recipe", recipePanelX + 16, recipePanelY + 28);
  textSize(13);
  text("Placeholder space for order card / recipe art", recipePanelX + 16, recipePanelY + 52, ORDER_PANEL_WIDTH - 32);

  let recipeY = recipePanelY + 86;
  for (let kind of ingredientKinds) {
    text("- " + MATERIAL_LIBRARY[kind].label + ": " + currentOrder.ingredients[kind], recipePanelX + 16, recipeY);
    recipeY += 18;
  }

  textSize(14);
  text("Move mouse to carry the cup. A / D or left / right arrows rotate. Press R to restart.", 12, height - 20);

  if (gameState === "orderPreview" || gameState === "orderComplete") {
    drawOrderOverlay();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (currentOrder) restartCurrentOrder();
}

function mousePressed() {
  if (gameState === "orderPreview") {
    gameState = "playing";
    return;
  }

  if (gameState === "orderComplete") {
    generateNextOrder();
    return;
  }

  if (gameState === "playing") {
    for (let g of gels) {
      let d = dist(mouseX, mouseY, g.pos.x, g.pos.y);
      if (d < g.r) {
        g.squeeze(particles);
        return;
      }
    }
  }
}

function keyPressed() {
  if (key === "r" || key === "R") {
    restartCurrentOrder();
  }

  if (ENABLE_DEBUG_SKIP && (key === "e" || key === "E")) {
    generateNextOrder();
  }
}