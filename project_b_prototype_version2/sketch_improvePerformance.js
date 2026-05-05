let gui;
let params = {
  gravity_x: 0,
  gravity_y: 0.02,
  attract_strength: 0.01,
  merge_dist: 3,
  min_radius: 8,
  max_radius: 12,
  damping: 0.99,
};

let goal = 20;
let cup_width = 80;
let cup_height = 200;
let rotation_speed = 0.03;
let emit_rate = 30;
let max_particles = 200;

const LEVEL_CLEAR_DELAY = 90;
const PULSE_INTERVAL = 300;
const PULSE_DURATION = 70;
const ENABLE_DEBUG_SKIP = true; // comment out or set to false to disable presentation skip

let particles = [];
let boundaries = [];
let emitters = [];
let gels = [];
let cup;
let frameCount_emit = 0;
let caught = 0;
let cupStats = { total: 0, espresso: 0, milk: 0, water: 0, other: 0 };
let currentLevel = 0;
let currentLevelConfig = null;
let levelFrame = 0;
let gameState = "playing";
let transitionTimer = 0;
let pulseFramesLeft = 0;
let pulseVector = null;
let pulseIndex = 0;

function getLevelConfigs() {
  return [
    {
      title: "Level 1: Training Shift",
      subtitle: "Catch 30 espresso drops.",
      targetCaught: 30,
      emitRate: 24,
      maxParticles: 120,
      gravityMode: "tutorial",
      progressKinds: ["espresso"],
      emitterConfigs: [
        { x: width * 0.5, y: 80, maxDrops: 100, kind: "espresso", particleColor: [145, 92, 58], emitterColor: [145, 92, 58] }
      ],
      gels: []
    },
    {
      title: "Level 2: Drifting Station",
      subtitle: "Gravity sways. Catch 30 espresso drops.",
      targetCaught: 30,
      emitRate: 24,
      maxParticles: 130,
      gravityMode: "horizontalDrift",
      progressKinds: ["espresso"],
      emitterConfigs: [
        { x: width * 0.5, y: 80, maxDrops: 100, kind: "espresso", particleColor: [145, 92, 58], emitterColor: [145, 92, 58] }
      ],
      gels: []
    },
    {
      title: "Level 3: Americano Drift",
      subtitle: "Catch 40 espresso and water drops with difference within 20.",
      targetCaught: 40,
      emitRate: 24,
      maxParticles: 130,
      gravityMode: "horizontalDrift",
      progressKinds: ["espresso", "water"],
      maxKindDifference: 16,
      emitterConfigs: [
        { x: width * 0.35, y: 80, maxDrops: 50, kind: "espresso", particleColor: [145, 92, 58], emitterColor: [145, 92, 58] },
        { x: width * 0.65, y: 80, maxDrops: 50, kind: "water", particleColor: [145, 210, 255], emitterColor: [145, 210, 255] }
      ],
      gels: [
        { x: width * 0.2, y: height * 0.3, r: 30 },
        { x: width * 0.8, y: height * 0.5, r: 30 }
      ]
    },
    {
      title: "Level 4: Gel Cleanup Americano",
      subtitle: "Sudden surges. Catch 40 espresso and water drops with difference within 15.",
      targetCaught: 40,
      emitRate: 36,
      maxParticles: 150,
      gravityMode: "drift",
      progressKinds: ["espresso", "water"],
      maxKindDifference: 12,
      emitterConfigs: [
        { x: width * 0.35, y: 80, maxDrops: 60, kind: "espresso", particleColor: [145, 92, 58], emitterColor: [145, 92, 58] },
        { x: width * 0.65, y: 80, maxDrops: 60, kind: "water", particleColor: [145, 210, 255], emitterColor: [145, 210, 255] }
      ],
      gels: [
        { x: width * 0.2, y: height * 0.3, r: 30 },
        { x: width * 0.8, y: height * 0.5, r: 30 }
      ]
    },
    {
      title: "Level 5: Zero-G Latte",
      subtitle: "Catch 40 espresso and milk drops with difference within 10.",
      targetCaught: 40,
      emitRate: 36,
      maxParticles: 150,
      gravityMode: "pulse",
      pulseStrength: 0.085,
      progressKinds: ["espresso", "milk"],
      maxKindDifference: 8,
      emitterConfigs: [
        { x: width * 0.35, y: 80, maxDrops: 60, kind: "espresso", particleColor: [145, 92, 58], emitterColor: [145, 92, 58] },
        { x: width * 0.65, y: 80, maxDrops: 60, kind: "milk", particleColor: [250, 244, 226], emitterColor: [235, 235, 220] }
      ],
      gels: [
        { x: width * 0.2, y: height * 0.3, r: 30 },
        { x: width * 0.8, y: height * 0.5, r: 30 }
      ]
    }
  ];
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  //setGuiPane();
  cup = new Cup(width / 2, height / 2, cup_width, cup_height);
  loadLevel(0);
}

function loadLevel(index) {
  const levels = getLevelConfigs();
  currentLevel = constrain(index, 0, levels.length - 1);
  currentLevelConfig = levels[currentLevel];

  goal = currentLevelConfig.targetCaught;
  emit_rate = currentLevelConfig.emitRate;
  max_particles = currentLevelConfig.maxParticles;

  frameCount_emit = 0;
  levelFrame = 0;
  transitionTimer = 0;
  gameState = "playing";
  pulseFramesLeft = 0;
  pulseVector = null;
  pulseIndex = 0;

  particles = [];
  boundaries = [];
  emitters = [];
  gels = [];
  caught = 0;
  cupStats = { total: 0, espresso: 0, milk: 0, water: 0, other: 0 };

  cup_width = 80;
  cup_height = 200;
  cup = new Cup(width / 2, height * 0.72, cup_width, cup_height);
  cup.angle = 0;
  cup.idleRotation = 0.005;

  for (let emitterConfig of currentLevelConfig.emitterConfigs) {
    emitters.push(new Emitter(emitterConfig));
  }

  for (let gelConfig of currentLevelConfig.gels) {
    gels.push(new SpillGel(gelConfig.x, gelConfig.y, gelConfig.r));
  }
}

function draw() {
  background(0);
  if (!currentLevelConfig) return;

  levelFrame++;
  updateLevelGravity();
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
    currentMoveSpeed = cup.idleRotation;
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

  caught = cup.countCaught(particles);
  cupStats = getCupStats();
  checkLevelState();

  //drawConnections();
  for (let p of particles) p.display();
  for (let b of boundaries) b.display();
  for (let e of emitters) e.display();
  cup.display();
  for (let g of gels) g.display();
  drawInfo();
}

function updateEmission() {
  if (gameState !== "playing") return;

  frameCount_emit++;
  if (frameCount_emit % emit_rate !== 0) return;

  for (let e of emitters) {
    e.emit();
  }
}

function updateLevelGravity() {
  let gx = 0;
  let gy = 0.02;

  if (currentLevelConfig.gravityMode === "tutorial") {
    gx = 0;
    gy = 0.024;
  } else if (currentLevelConfig.gravityMode === "horizontalDrift") {
    gx = 0.018 * sin(levelFrame * 0.012);
    gy = 0.024;
  } else {
    gx = 0.018 * sin(levelFrame * 0.012);
    gy = 0.006 + 0.016 * cos(levelFrame * 0.009);

    if (currentLevelConfig.gravityMode === "pulse") {
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
  let pulseStrength = currentLevelConfig.pulseStrength || 0.06;
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
  let stats = { total: 0, espresso: 0, milk: 0, water: 0, other: 0 };

  for (let p of particles) {
    if (!p.inCup) continue;
    stats.total++;
    if (p.kind === "espresso") stats.espresso++;
    else if (p.kind === "milk") stats.milk++;
    else if (p.kind === "water") stats.water++;
    else stats.other++;
  }

  return stats;
}

function getGoalProgress() {
  if (currentLevelConfig.progressKinds && currentLevelConfig.progressKinds.length > 0) {
    let total = 0;
    for (let kind of currentLevelConfig.progressKinds) {
      total += cupStats[kind] || 0;
    }
    return total;
  }

  return caught;
}

function hasMetCurrentGoal() {
  if (currentLevelConfig.progressKinds && currentLevelConfig.progressKinds.length > 0) {
    let mixCount = getGoalProgress();
    if (mixCount < goal) return false;

    if (currentLevelConfig.progressKinds.length >= 2 && currentLevelConfig.maxKindDifference !== undefined) {
      let first = cupStats[currentLevelConfig.progressKinds[0]] || 0;
      let second = cupStats[currentLevelConfig.progressKinds[1]] || 0;
      return abs(first - second) <= currentLevelConfig.maxKindDifference;
    }

    return true;
  }

  return caught >= goal;
}

function checkLevelState() {
  if (gameState === "playing" && hasMetCurrentGoal()) {
    if (currentLevel === getLevelConfigs().length - 1) {
      gameState = "finished";
    } else {
      gameState = "levelClear";
    }
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
    noStroke();
    const c = this.getDisplayColor();
    fill(c[0], c[1], c[2], this.bright);
    ellipse(this.pos.x, this.pos.y, this.r * 2, this.r * 2);
  }

  getDisplayColor() {
    if (this.kind === "espresso") return this.inCup ? [175, 120, 82] : this.baseColor;
    if (this.kind === "milk") return this.inCup ? [255, 248, 232] : this.baseColor;
    if (this.kind === "water") return this.inCup ? [110, 185, 255] : this.baseColor;
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
    this.hw = hw;
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

  updateBoundaries() {
    let halfH = this.h / 2;
    let tl = this._toWorld(-this.hw, -halfH);
    let tr = this._toWorld(this.hw, -halfH);
    let bl = this._toWorld(-this.hw, halfH);
    let br = this._toWorld(this.hw, halfH);
    // normals facing inward:
    // left wall normal = (1, 0) in local space (pointing right, into the cup)
    // bottom wall normal = (0, -1) in local space (pointing up, into the cup)
    // right wall normal = (-1, 0) in local space (pointing left, into the cup)
    this.walls[0].setPoints(tl.x, tl.y, bl.x, bl.y, this._rotateDir(1, 0)); // left wall
    this.walls[1].setPoints(bl.x, bl.y, br.x, br.y, this._rotateDir(0, -1)); // bottom wall
    this.walls[2].setPoints(tr.x, tr.y, br.x, br.y, this._rotateDir(-1, 0)); // right wall
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

      // check if the particle's current physical position is within the cup's safe volume:
      let inBox = (lx > -this.hw + p.r && lx < this.hw - p.r && ly > -halfH && ly < halfH - p.r);

      if (p.inCup) {
        if (!inBox) {
          if (ly < -halfH) {
            p.inCup = false;
          } else {
            if (lx <= -this.hw + p.r) { lx = -this.hw + p.r + 0.1; vx = abs(vx) * 0.6; }
            else if (lx >= this.hw - p.r) { lx = this.hw - p.r - 0.1; vx = -abs(vx) * 0.6; }
            if (ly >= halfH - p.r) { ly = halfH - p.r - 0.1; vy = -abs(vy) * 0.6; }
            inBox = true;
          }
        }
      } else {
        if (inBox) {
          if (p.prevLy !== undefined && p.prevLy < -halfH) {
            p.inCup = true;
          } else {
            if (p.prevLx !== undefined) {
              if (p.prevLx >= this.hw) { lx = this.hw + p.r + 0.1; vx = abs(vx) * 0.6; }
              else if (p.prevLx <= -this.hw) { lx = -this.hw - p.r - 0.1; vx = -abs(vx) * 0.6; }
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
    for (let w of this.walls) w.display();
    let halfH = this.h / 2;
    let tl = this._toWorld(-this.hw, -halfH);
    let tr = this._toWorld(this.hw, -halfH);
    stroke(255, 60);
    strokeWeight(1);
    drawingContext.setLineDash([4, 6]);
    line(tl.x, tl.y, tr.x, tr.y);
    drawingContext.setLineDash([]);
  }
}

class Emitter {
  constructor(config) {
    this.pos = createVector(config.x, config.y);
    this.kind = config.kind || "default";
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
    fill(this.emitterColor[0], this.emitterColor[1], this.emitterColor[2], 220);
    noStroke();
    ellipse(this.pos.x, this.pos.y, 28, 28);

    if (this.kind !== "default") {
      fill(255);
      textAlign(CENTER, CENTER);
      textSize(12);
      text(this.kind, this.pos.x, this.pos.y - 24);
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
  noStroke();
  fill(255);
  textSize(16);
  textAlign(LEFT, BASELINE);
  text(currentLevelConfig.title, 10, 20);
  text(currentLevelConfig.subtitle, 10, 40);
  text("In cup: " + getGoalProgress() + " / " + goal, 10, 60);
  // text("Remaining drops: " + remainingDrops(), 10, 85);
  text("Gravity: " + nf(params.gravity_x, 1, 3) + ", " + nf(params.gravity_y, 1, 3), 10, 80);
  // text("FPS: " + Math.floor(frameRate()), 10, 125);

  if (currentLevelConfig.progressKinds && currentLevelConfig.progressKinds.length > 0) {
    let y = 150;
    for (let kind of currentLevelConfig.progressKinds) {
      let label = kind.charAt(0).toUpperCase() + kind.slice(1);
      text(label + ": " + (cupStats[kind] || 0), 10, y);
      y += 20;
    }

    if (currentLevelConfig.progressKinds.length >= 2) {
      let first = cupStats[currentLevelConfig.progressKinds[0]] || 0;
      let second = cupStats[currentLevelConfig.progressKinds[1]] || 0;
      text("Difference: " + abs(first - second) + " / " + currentLevelConfig.maxKindDifference, 10, y);
      y += 20;
    }

    if (cupStats.other > 0) {
      text("Waste: " + cupStats.other, 10, y);
    }
  }

  text("Move mouse to carry the cup. A / D or left / right arrows rotate. Press R to restart.", 10, height - 20);

  textAlign(CENTER, CENTER);
  if (gameState === "levelClear") {
    textSize(28);
    text("Level clear", width / 2, height * 0.14);
    textSize(18);
    text("Click to continue", width / 2, height * 0.19);
  } else if (gameState === "finished") {
    textSize(28);
    text("Shift complete", width / 2, height * 0.14);
    textSize(18);
    text("Press R to restart from Level 1.", width / 2, height * 0.19);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  loadLevel(currentLevel);
}

function setGuiPane() {
  gui = new Pane();
  gui.addBinding(params, "gravity_x", { min: -0.05, max: 0.05, step: 0.01 });
  gui.addBinding(params, "gravity_y", { min: -0.05, max: 0.05, step: 0.01 });
  gui.addBinding(params, "attract_strength", { min: 0, max: 0.05 });
  gui.addBinding(params, "merge_dist", { min: 2, max: 10, step: 1 });
  gui.addBinding(params, "damping", { min: 0.98, max: 1, step: 0.005 });
}

function mousePressed() {
  if (gameState === "levelClear") {
    loadLevel(currentLevel + 1);
    return;
  }

  // check if clicking on any gel to squeeze it
  for (let g of gels) {
    let d = dist(mouseX, mouseY, g.pos.x, g.pos.y);
    if (d < g.r) {
      g.squeeze(particles);
    }
  }
}

function keyPressed() {
  if (key === "r" || key === "R") {
    if (gameState === "finished") loadLevel(0);
    else loadLevel(currentLevel);
  }

  if (ENABLE_DEBUG_SKIP && (key === "e" || key === "E")) {
    let nextLevel = (currentLevel + 1) % getLevelConfigs().length;
    loadLevel(nextLevel);
  }
}