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

let particles = [];
let boundaries = [];
let emitters = [];
let gels = [];
let cup;
let frameCount_emit = 0;
let caught = 0;

let selectedProp = null;

function setup() {
  createCanvas(windowWidth, windowHeight);
  // setGuiPane();
  document.oncontextmenu = () => false;
  cup = new Cup(width / 2, height / 2, cup_width, cup_height);
  emitters.push(new Emitter(width / 2, 80));

  gels.push(new SpillGel(width * 0.2, height * 0.3, 30));
  gels.push(new SpillGel(width * 0.8, height * 0.5, 30));

  selectedProp = cup;
}

function draw() {
  background(0);

  frameCount_emit++;
  if (frameCount_emit % emit_rate === 0 && particles.length < max_particles) {
    for (let e of emitters) e.emit();
  }

  let gravity = createVector(params.gravity_x, params.gravity_y);
  for (let p of particles) { p.applyForce(gravity); }

  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      let a = particles[i], b = particles[j];
      let dx = b.pos.x - a.pos.x;
      let dy = b.pos.y - a.pos.y;
      let dSq = dx * dx + dy * dy;
      let minDist = (a.r + b.r) * 0.85;

      if (dSq > minDist * minDist) {
        // when they are apart but within the merge distance, apply a mild attraction to encourage clustering
        let d = constrain(sqrt(dSq), 5, 300);
        let force = p5.Vector.sub(b.pos, a.pos);
        let strength = (params.attract_strength * a.r * b.r) / (d * d);
        force.setMag(strength);
        a.applyForce(force);
        b.applyForce(p5.Vector.mult(force, -1));
      } else if (dSq > 0.0001) {
        // overlapping or touching: apply collision response
        let d = sqrt(dSq);
        let overlap = minDist - d;
        let forceDir = createVector(dx, dy).normalize();

        let correction = p5.Vector.mult(forceDir, overlap * 0.5);
        a.pos.sub(correction);
        b.pos.add(correction);

        // momentum exchange
        let relativeVel = p5.Vector.sub(b.vel, a.vel);
        let velAlongNormal = relativeVel.dot(forceDir);
        if (velAlongNormal < 0) {
          let restitution = 0.2; // bounciness factor
          let impulseMag = -(1 + restitution) * velAlongNormal * 0.5;
          let impulse = p5.Vector.mult(forceDir, impulseMag);
          a.vel.sub(impulse);
          b.vel.add(impulse);
        }
      }
    }
  }

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

  cup.update(particles);

  for (let p of particles) {
    p.update();
    p.edges();
  }

  for (let p of particles) {
    for (let b of boundaries) b.collide(p);
    for (let b of cup.walls) b.collide(p);
  }

  caught = cup.countCaught(particles);

  //drawConnections();
  for (let p of particles) p.display();
  for (let b of boundaries) b.display();
  for (let e of emitters) e.display();
  cup.display();
  drawInfo();
  for (let g of gels) {
    g.update(particles);
    g.display();
  }
}

class Particle {
  constructor(x, y, r) {
    this.pos = createVector(x, y);
    this.vel = createVector(random(-1, 1), random(-1, 1));
    this.acc = createVector(0, 0);
    this.r = r;
    this.bright = map(r, params.min_radius, params.max_radius, 200, 255);
    this.col = 255;
    this.inCup = false;
    this.prevPos = null;
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
    if (this.pos.x - this.r < 0) { this.pos.x = this.r; this.vel.x *= -0.7; }
    if (this.pos.x + this.r > width) { this.pos.x = width - this.r; this.vel.x *= -0.7; }
    if (this.pos.y - this.r < 0) { this.pos.y = this.r; this.vel.y *= -0.7; }
    if (this.pos.y + this.r > height) { this.pos.y = height - this.r; this.vel.y *= -0.7; }
  }

  display() {
    noStroke();
    if (this.inCup) {
      fill(100, 180, 255, this.bright);
    } else {
      fill(this.col, this.bright);
    }
    ellipse(this.pos.x, this.pos.y, this.r * 2, this.r * 2);
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
      let ref
      if (isCCD) {
        ref = p.prePos;
      } else {
        ref = p.pos;
      }
      let toP = p5.Vector.sub(ref, closest);
      let n;
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
    this.vel = createVector(0, 0);
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

  // ── 请用这个 update 方法完全替换掉原来的 setPos 方法 ──
  update(particlesArray) {
    // 1. 决定杯子下一帧要往哪里走 (Target)
    let targetX = this.pos.x;
    let targetY = this.pos.y;

    if (selectedProp === this) {
      // 状态 A：被鼠标抓住时，目标就是鼠标当前位置
      targetX = mouseX;
      targetY = mouseY;
    } else {
      // 状态 B：没被抓住时，受到重力影响往下掉
      this.vel.y += params.gravity_y * 0.8; // 施加重力
      this.vel.mult(0.95); // 空间阻力
      targetX += this.vel.x;
      targetY += this.vel.y;

      // 防止杯子掉出屏幕底部 (h/2 是因为局部坐标系原点在中心)
      if (targetY > height - this.h / 2) {
        targetY = height - this.h / 2;
        this.vel.y *= -0.3; // 砸到底部时的微弱反弹
      }
    }

    // 2. 限制移动速度 (防止瞬间移动穿模)
    let target = createVector(targetX, targetY);
    let d = p5.Vector.dist(target, this.pos);
    // 如果是鼠标拖着，允许移动快一点(30)；如果是掉落，限制速度(15)
    let maxMove = (selectedProp === this) ? 30 : 15;

    let newPos = this.pos.copy();
    if (d > maxMove) {
      // 如果目标太远，最多只走 maxMove 的距离
      newPos.add(p5.Vector.sub(target, this.pos).normalize().mult(maxMove));
    } else {
      // 如果在允许范围内，直接到达目标点
      newPos.set(target.x, target.y);
    }

    // 3. 惯性传递 (把杯子的位移传递给杯子里的咖啡粒子)
    let delta = p5.Vector.sub(newPos, this.pos);
    if (delta.magSq() > 0.1 && particlesArray) {
      for (let p of particlesArray) {
        if (p.inCup) {
          p.pos.add(delta); // 粒子跟着杯子强制平移
          p.vel.add(p5.Vector.mult(delta, 0.05)); // 赋予粒子一点晃动的惯性速度
        }
      }
    }

    // 4. 真正更新坐标，并同步更新物理碰撞边界
    this.pos = newPos;
    this.updateBoundaries();
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
  constructor(x, y) { this.pos = createVector(x, y); }

  emit() {
    let px = this.pos.x + random(-4, 4);
    let r = random(params.min_radius, params.max_radius);
    let p = new Particle(px, this.pos.y, r);
    p.vel.set(random(-0.3, 0.3), random(0.5, 1.5));
    particles.push(p);
  }

  display() {
    fill(180, 220, 255, 200);
    noStroke();
    ellipse(this.pos.x, this.pos.y, 28, 28);
  }
}

class SpillGel {
  constructor(x, y, r) {
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
    this.baseR = r;
    this.r = r;
    this.stored = 0;
    this.wanderOffset = random(1000);
  }

  update(particlesArray) {
    // ── 1. 移动逻辑：根据是否被选中决定行为 ──
    if (selectedProp === this) {
      // 被选中时，平滑跟随鼠标
      let target = createVector(mouseX, mouseY);
      let force = p5.Vector.sub(target, this.pos);
      this.vel = force.mult(0.15); // 跟随的弹性系数
      this.pos.add(this.vel);
    } else {
      // 没被选中时，受重力和噪声影响，缓缓飘落
      this.pos.x += map(noise(this.wanderOffset), 0, 1, -1, 1);
      this.vel.y += params.gravity_y * 0.5; // 受到微弱重力
      this.vel.mult(0.95); // 空间阻力
      this.pos.add(this.vel);
      this.wanderOffset += 0.005;

      // 掉落到屏幕底部的反弹逻辑
      if (this.pos.y > height - this.r) {
        this.pos.y = height - this.r;
        this.vel.y *= -0.5;
      }
    }

    // 限制在屏幕左右边界
    this.pos.x = constrain(this.pos.x, this.r, width - this.r);

    // ── 2. 吸收逻辑 (完全保留你想要的变大特性) ──
    for (let i = particlesArray.length - 1; i >= 0; i--) {
      let p = particlesArray[i];
      if (!p.inCup) {
        let d = p5.Vector.dist(this.pos, p.pos);
        if (d < this.r + p.r) {
          this.stored++;
          this.r = this.baseR + this.stored * 0.5; // 吸水后体积膨胀！
          particlesArray.splice(i, 1);
        }
      }
    }
  }

  // 挤压释放逻辑
  squeeze(particlesArray) {
    if (this.stored > 0) {
      let releaseCount = min(this.stored, 5);
      for (let i = 0; i < releaseCount; i++) {
        let r = random(params.min_radius, params.max_radius);
        let p = new Particle(this.pos.x, this.pos.y + this.r, r);
        p.vel = createVector(random(-2, 2), random(2, 6)); // 喷射力度稍微加大
        p.col = 150;
        particlesArray.push(p);
      }
      this.stored -= releaseCount;
      this.r = this.baseR + this.stored * 0.5; // 吐出来后体积缩小
    }
  }

  // 增加点击检测方法
  isClicked(mX, mY) {
    return dist(mX, mY, this.pos.x, this.pos.y) < this.r;
  }

  display() {
    push(); // 隔离样式，防止污染 drawInfo
    noStroke();
    // 选中时，给凝胶加一个高亮的描边！提示玩家正抓着它
    if (selectedProp === this) {
      stroke(255);
      strokeWeight(2);
    }
    fill(100, 255, 150, constrain(100 + this.stored * 10, 100, 255));
    ellipse(this.pos.x, this.pos.y, this.r * 2);

    fill(255);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(14);
    text(this.stored, this.pos.x, this.pos.y);
    pop();
  }
}

function drawInfo() {
  noStroke();
  fill(255);
  textSize(16);
  textAlign(LEFT, BASELINE);
  text("Particles: " + particles.length, 10, 20);
  text("FPS: " + Math.floor(frameRate()), 10, 40);
  text("In cup: " + caught, 10, 60);
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }

function setGuiPane() {
  gui = new Pane();
  gui.addBinding(params, "gravity_x", { min: -0.05, max: 0.05, step: 0.01 });
  gui.addBinding(params, "gravity_y", { min: -0.05, max: 0.05, step: 0.01 });
  gui.addBinding(params, "attract_strength", { min: 0, max: 0.05 });
  gui.addBinding(params, "merge_dist", { min: 2, max: 10, step: 1 });
  gui.addBinding(params, "damping", { min: 0.98, max: 1, step: 0.005 });
}

function drawConnections() {
  noStroke();
  fill(255, 100);
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      let a = particles[i], b = particles[j];
      let dx = a.pos.x - b.pos.x;
      let dy = a.pos.y - b.pos.y;
      let dSq = dx * dx + dy * dy;
      let maxDist = a.r + b.r + params.merge_dist;
      if (dSq < maxDist * maxDist) {
        let d = sqrt(dSq);
        let blend = constrain(map(d, a.r + b.r, maxDist, 1, 0), 0, 1);
        let steps = floor(blend * 2 + 1);
        for (let t = 0; t <= steps; t++) {
          let tt = t / steps;
          let x = lerp(a.pos.x, b.pos.x, tt);
          let y = lerp(a.pos.y, b.pos.y, tt);
          let r = lerp(a.r, b.r, tt) * (0.55 + 0.45 * blend);
          ellipse(x, y, r * 2, r * 2);
        }
      }
    }
  }
}

function mousePressed() {
  if (mouseButton === LEFT) {
    // ── 左键：选择道具 ──
    let found = false;
    // 优先检查是否点到了凝胶
    for (let g of gels) {
      if (g.isClicked(mouseX, mouseY)) {
        selectedProp = g;
        found = true;
        break;
      }
    }
    // 如果没点到凝胶，检查是否点到了杯子 (给一个比较宽松的点击判定半径)
    if (!found) {
      let dToCup = dist(mouseX, mouseY, cup.pos.x, cup.pos.y);
      if (dToCup < 80) {
        selectedProp = cup;
      } else {
        // 如果点在了空无一物的太空，也可以设定为默认控制杯子
        selectedProp = cup;
      }
    }
  }
  else if (mouseButton === RIGHT) {
    // ── 右键：专属交互 (挤压) ──
    // 只要右键点到了凝胶，不管它当前有没有被选中，直接让它吐咖啡！
    for (let g of gels) {
      if (g.isClicked(mouseX, mouseY)) {
        g.squeeze(particles);
      }
    }
  }
}