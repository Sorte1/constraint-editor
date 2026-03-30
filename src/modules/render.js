import * as THREE from "three";

const PALETTES = {
  classic: {
    HardCheckpoint: 0x6bb8ff,
    SoftCheckpoint: 0x9cd4ff,
    PlaneCheckpoint: 0x4df5a6,
    LineSegment: 0x3ee089,
    Corridor: 0x2ccf7a,
    JumpArc: 0x33f0ff,
    JumpTrain: 0xff9933,
    TakeoffZone: 0x33f0ff,
    LandingZone: 0x80f7ff,
    AirborneSegment: 0xc084ff,
    LookDirection: 0xa8a0ff,
    LookRange: 0x7c6cff,
    SpeedWindow: 0xffe066,
    VelocityDirection: 0xffc94d,
    TurnConstraint: 0xffa62b,
    StateCheckpoint: 0xff6b6b,
  },
  neon: {
    HardCheckpoint: 0x00aaff,
    SoftCheckpoint: 0x00ccff,
    PlaneCheckpoint: 0x00ff88,
    LineSegment: 0x00ff44,
    Corridor: 0x00dd33,
    JumpArc: 0x00ffff,
    JumpTrain: 0xff8800,
    TakeoffZone: 0x00ffff,
    LandingZone: 0x88ffff,
    AirborneSegment: 0xff00ff,
    LookDirection: 0xcc88ff,
    LookRange: 0x9955ff,
    SpeedWindow: 0xffff00,
    VelocityDirection: 0xffdd00,
    TurnConstraint: 0xff8800,
    StateCheckpoint: 0xff0044,
  },
  mono: {
    HardCheckpoint: 0xffffff,
    SoftCheckpoint: 0xdddddd,
    PlaneCheckpoint: 0xcccccc,
    LineSegment: 0xbbbbbb,
    Corridor: 0xaaaaaa,
    JumpArc: 0xeeeeee,
    JumpTrain: 0xe8e8e8,
    TakeoffZone: 0xe0e0e0,
    LandingZone: 0xd0d0d0,
    AirborneSegment: 0x999999,
    LookDirection: 0xc0c0c0,
    LookRange: 0xb0b0b0,
    SpeedWindow: 0xd8d8d8,
    VelocityDirection: 0xc8c8c8,
    TurnConstraint: 0xb8b8b8,
    StateCheckpoint: 0xa0a0a0,
  },
};
const SELECT_COLOR = 0xffffff;
const DISABLED_COLOR = 0x444444;
const ROOT_NAME = "krConstraintHelpers";
const HELPER_VERSION = 3;
const HOVER_COLOR = 0x3fb950;
const ARMED_COLOR = 0xd29922;
const FLOW_COLOR = 0xffffff;

function typeColor(type, theme) {
  return (PALETTES[theme] ?? PALETTES.classic)[type] ?? 0x8b949e;
}

function mat(color, { wire = false, opacity = 1, side } = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    wireframe: wire,
    opacity,
    depthTest: true,
    depthWrite: true,
    side: side ?? THREE.FrontSide,
  });
}
function lineMat(color, opacity = 1) {
  return new THREE.LineBasicMaterial({
    color,
    opacity,
    depthTest: true,
    depthWrite: true,
  });
}

function enforceOverlayRender(obj, renderOrder = 10000) {
  obj.traverse((node) => {
    node.renderOrder = renderOrder;
    const apply = (m) => {
      if (!m) return;
      m.depthTest = true;
      m.depthWrite = true;
      m.needsUpdate = true;
    };
    if (Array.isArray(node.material)) node.material.forEach(apply);
    else apply(node.material);
  });
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const JUMP_GRAVITY = 0.00015;

function computeJumpArc(startRel, endRel, jumpYVel) {
  const dx = endRel.x - startRel.x;
  const dy = endRel.y - startRel.y;
  const dz = endRel.z - startRel.z;
  const a = 0.5 * JUMP_GRAVITY;
  const b = -jumpYVel;
  const disc = b * b - 4 * a * dy;

  let time;
  let impossible = false;
  if (disc >= 0) {
    const sqrtD = Math.sqrt(disc);
    const t1 = (-b - sqrtD) / (2 * a);
    const t2 = (-b + sqrtD) / (2 * a);
    const valid = [t1, t2].filter((t) => t > 0);
    if (valid.length > 0) {
      time = Math.max(...valid);
    } else {
      impossible = true;
    }
  } else {
    impossible = true;
  }
  if (impossible) time = (2 * jumpYVel) / JUMP_GRAVITY;

  const xv = dx / time;
  const zv = dz / time;
  const hSpeed = Math.sqrt(xv * xv + zv * zv);
  const STEPS = 60;
  const points = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = (i / STEPS) * time;
    points.push(
      new THREE.Vector3(
        startRel.x + xv * t,
        startRel.y + jumpYVel * t - 0.5 * JUMP_GRAVITY * t * t,
        startRel.z + zv * t,
      ),
    );
  }
  return { points, speed: hSpeed, impossible };
}

function makeSpeedLabel() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    depthTest: true,
    depthWrite: true,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.name = "speedLabel";
  sprite.scale.set(14, 2.6, 1);
  sprite.userData.isSpeedLabel = true;
  return sprite;
}

function updateSpeedLabel(sprite, text, colorHex) {
  const canvas = sprite.material.map.image;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "bold 34px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.lineWidth = 5;
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = "#" + colorHex.toString(16).padStart(6, "0");
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  sprite.material.map.needsUpdate = true;
  sprite.visible = true;
}

function createZoneVisual(color, name = "zone") {
  const g = new THREE.Group();
  g.name = name;
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    mat(color, { wire: true, opacity: 0.28 }),
  );
  sphere.name = "sphere";
  g.add(sphere);
  const circleDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 36),
    mat(color, { opacity: 0.18, side: THREE.DoubleSide }),
  );
  circleDisc.rotation.x = Math.PI / 2;
  circleDisc.name = "circleDisc";
  g.add(circleDisc);
  const circleRing = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.05, 8, 48),
    mat(color, { opacity: 0.9 }),
  );
  circleRing.rotation.x = Math.PI / 2;
  circleRing.name = "circleRing";
  g.add(circleRing);
  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 24, 1, true),
    mat(color, { wire: true, opacity: 0.3, side: THREE.DoubleSide }),
  );
  cylinder.name = "cylinder";
  g.add(cylinder);
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    mat(color, { wire: true, opacity: 0.32 }),
  );
  box.name = "box";
  g.add(box);
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    mat(color, { opacity: 0.95 }),
  );
  center.name = "center";
  g.add(center);
  return g;
}

function updateZoneVisual(zone, shape, config) {
  const active = ["box", "sphere", "circle", "cylinder"].includes(shape)
    ? shape
    : "sphere";
  const radius = Math.max(0.05, numberOr(config.radius, 8));
  const height = Math.max(0.05, numberOr(config.height, radius));
  const sizeX = Math.max(0.05, numberOr(config.sizeX, radius * 2));
  const sizeY = Math.max(0.05, numberOr(config.sizeY, radius * 2));
  const sizeZ = Math.max(0.05, numberOr(config.sizeZ, radius * 2));

  const sphere = zone.getObjectByName("sphere");
  const circleDisc = zone.getObjectByName("circleDisc");
  const circleRing = zone.getObjectByName("circleRing");
  const cylinder = zone.getObjectByName("cylinder");
  const box = zone.getObjectByName("box");
  if (sphere) {
    sphere.visible = active === "sphere";
    sphere.scale.setScalar(radius);
  }
  if (circleDisc) {
    circleDisc.visible = active === "circle";
    circleDisc.scale.set(radius, radius, radius);
  }
  if (circleRing) {
    circleRing.visible = active === "circle";
    circleRing.scale.set(radius, radius, radius);
  }
  if (cylinder) {
    cylinder.visible = active === "cylinder";
    cylinder.scale.set(radius, height, radius);
    cylinder.position.set(0, height * 0.5, 0);
  }
  if (box) {
    box.visible = active === "box";
    box.scale.set(sizeX, sizeY, sizeZ);
  }
}

function makeArrowHelper(color) {
  const g = new THREE.Group();
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 0),
    3,
    color,
    0.6,
    0.3,
  );
  arrow.name = "arrow";
  g.add(arrow);
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 8, 8),
    mat(color, { opacity: 0.95 }),
  );
  dot.name = "center";
  g.add(dot);
  return g;
}

function makeLineHelper(color) {
  const g = new THREE.Group();
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
    ]),
    lineMat(color, 0.9),
  );
  line.name = "line";
  g.add(line);
  for (const name of ["p0", "p1"]) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      mat(color, { opacity: 0.95 }),
    );
    dot.name = name;
    g.add(dot);
  }
  const segmentCylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 18, 1, true),
    mat(color, { wire: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  segmentCylinder.name = "segmentCylinder";
  g.add(segmentCylinder);
  const segmentBox = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    mat(color, { wire: true, opacity: 0.35 }),
  );
  segmentBox.name = "segmentBox";
  g.add(segmentBox);
  const segmentStartSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 10),
    mat(color, { wire: true, opacity: 0.24 }),
  );
  segmentStartSphere.name = "segmentStartSphere";
  g.add(segmentStartSphere);
  const segmentEndSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 10),
    mat(color, { wire: true, opacity: 0.24 }),
  );
  segmentEndSphere.name = "segmentEndSphere";
  g.add(segmentEndSphere);
  return g;
}

function makeGemHelper(color) {
  const g = new THREE.Group();
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.6, 0),
    mat(color, { wire: true, opacity: 0.9 }),
  );
  gem.name = "gem";
  g.add(gem);
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    mat(color, { opacity: 0.95 }),
  );
  dot.name = "center";
  g.add(dot);
  return g;
}

function makeJumpArcHelper(color) {
  const g = new THREE.Group();
  g.add(createZoneVisual(color, "takeoff"));
  g.add(createZoneVisual(color, "landing"));
  const arc = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 2, 0),
      new THREE.Vector3(0, 0, 4),
    ]),
    lineMat(color, 1),
  );
  arc.name = "arc";
  g.add(arc);
  const tether = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 4),
    ]),
    lineMat(0xffffff, 1),
  );
  tether.name = "tether";
  g.add(tether);
  const sampleDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    mat(0xffffff, { opacity: 0.95 }),
  );
  sampleDot.name = "takeoffSampleDot";
  sampleDot.visible = false;
  g.add(sampleDot);
  g.add(makeSpeedLabel());
  return g;
}

function makeJumpTrainHelper() {
  const g = new THREE.Group();
  g.userData.nodeGroups = [];
  g.userData.arcLines = [];
  g.userData.tetherLines = [];
  g.userData.speedLabels = [];
  return g;
}

function makeAirborneSegmentHelper(color) {
  const g = new THREE.Group();
  for (const name of ["p0", "p1"]) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      mat(color, { opacity: 0.95 }),
    );
    dot.name = name;
    g.add(dot);
  }
  const arc = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 2, 0),
      new THREE.Vector3(0, 0, 4),
    ]),
    lineMat(color, 0.85),
  );
  arc.name = "arc";
  g.add(arc);
  const tether = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 4),
    ]),
    lineMat(color, 0.35),
  );
  tether.name = "tether";
  g.add(tether);
  g.add(makeSpeedLabel());
  return g;
}

function createTypedHelper(record, theme) {
  const type = record.constraint.type;
  const color = typeColor(type, theme);
  const g = (() => {
    switch (type) {
      case "HardCheckpoint":
      case "SoftCheckpoint":
      case "PlaneCheckpoint":
      case "TakeoffZone":
      case "LandingZone":
        return createZoneVisual(color, "zone");
      case "LineSegment":
      case "Corridor":
      case "AirborneSegment":
        return makeLineHelper(color);
      case "JumpArc":
        return makeJumpArcHelper(color);
      case "JumpTrain":
        return makeJumpTrainHelper();
      case "LookDirection":
      case "LookRange":
      case "VelocityDirection":
        return makeArrowHelper(color);
      case "SpeedWindow":
      case "TurnConstraint":
      case "StateCheckpoint":
        return makeGemHelper(color);
      default:
        return createZoneVisual(color, "zone");
    }
  })();
  g.userData.recordId = record.id;
  g.userData.helperType = type;
  g.userData.helperVersion = HELPER_VERSION;
  enforceOverlayRender(g);
  const label = g.getObjectByName("speedLabel");
  if (label) label.renderOrder = 10001;
  return g;
}

function normalDir(record) {
  const v = new THREE.Vector3(
    Number(record.constraint.nx ?? 0),
    Number(record.constraint.ny ?? 1),
    Number(record.constraint.nz ?? 0),
  );
  return v.lengthSq() < 1e-9 ? new THREE.Vector3(0, 1, 0) : v.normalize();
}
function normalFromCursor(cursor) {
  const v = new THREE.Vector3(
    Number(cursor?.normal?.x ?? 0),
    Number(cursor?.normal?.y ?? 1),
    Number(cursor?.normal?.z ?? 0),
  );
  return v.lengthSq() < 1e-9 ? new THREE.Vector3(0, 1, 0) : v.normalize();
}

function setColor(helper, color, opacity, xray) {
  helper.traverse((node) => {
    if (node.userData?.isSpeedLabel) return;
    const apply = (m) => {
      if (!m) return;
      m.color?.set(color);
      m.transparent = opacity < 1;
      m.opacity = opacity;
      m.depthTest = !xray;
      m.depthWrite = false;
      m.needsUpdate = true;
    };
    if (Array.isArray(node.material)) node.material.forEach(apply);
    else apply(node.material);
  });
}

function flowAnchor(record) {
  const c = record.constraint || {};
  switch (c.type) {
    case "LineSegment":
    case "Corridor":
    case "AirborneSegment":
      return new THREE.Vector3(
        numberOr(c.bx, c.cx),
        numberOr(c.by, c.cy),
        numberOr(c.bz, c.cz),
      );
    case "JumpArc":
      return new THREE.Vector3(
        numberOr(c.takeoffCx, c.cx),
        numberOr(c.takeoffCy, c.cy),
        numberOr(c.takeoffCz, c.cz),
      );
    case "JumpTrain": {
      const last =
        c.nodes && c.nodes.length > 0 ? c.nodes[c.nodes.length - 1] : null;
      return last
        ? new THREE.Vector3(last.cx, last.cy, last.cz)
        : new THREE.Vector3(
            numberOr(c.cx, 0),
            numberOr(c.cy, 0),
            numberOr(c.cz, 0),
          );
    }
    default:
      return new THREE.Vector3(
        numberOr(c.cx, 0),
        numberOr(c.cy, 0),
        numberOr(c.cz, 0),
      );
  }
}

function updateHelper(
  helper,
  record,
  selected,
  visuals,
  previewCursor = null,
  sampleCursor = null,
) {
  const type = record.constraint.type;
  const opacity = Math.max(0.05, Math.min(1, visuals.opacity ?? 0.9));
  const color = selected
    ? SELECT_COLOR
    : record.enabled
      ? typeColor(type, visuals.colorTheme)
      : DISABLED_COLOR;
  const radius = Math.max(0.05, Number(record.constraint.radius || 8));
  const dir = previewCursor?.normal
    ? normalFromCursor(previewCursor)
    : normalDir(record);
  const center = previewCursor?.point || {
    x: numberOr(record.constraint.cx, 0),
    y: numberOr(record.constraint.cy, 0),
    z: numberOr(record.constraint.cz, 0),
  };
  const takeoffCenter = {
    x: numberOr(record.constraint.takeoffCx, center.x),
    y: numberOr(record.constraint.takeoffCy, center.y),
    z: numberOr(record.constraint.takeoffCz, center.z),
  };
  const landingCenter = {
    x: numberOr(
      record.constraint.landingCx,
      numberOr(record.constraint.bx, center.x),
    ),
    y: numberOr(
      record.constraint.landingCy,
      numberOr(record.constraint.by, center.y),
    ),
    z: numberOr(
      record.constraint.landingCz,
      numberOr(record.constraint.bz, center.z),
    ),
  };

  if (type === "JumpArc") {
    helper.position.set(takeoffCenter.x, takeoffCenter.y, takeoffCenter.z);
  } else if (type === "JumpTrain") {
    const nodes = record.constraint.nodes;
    if (nodes && nodes.length > 0) {
      helper.position.set(nodes[0].cx, nodes[0].cy, nodes[0].cz);
    } else {
      helper.position.set(center.x, center.y, center.z);
    }
  } else if (
    type === "LineSegment" ||
    type === "Corridor" ||
    type === "AirborneSegment"
  ) {
    helper.position.set(
      numberOr(record.constraint.ax, center.x),
      numberOr(record.constraint.ay, center.y),
      numberOr(record.constraint.az, center.z),
    );
  } else {
    helper.position.set(center.x, center.y, center.z);
  }
  helper.visible = visuals.showOnlySelected
    ? selected
    : record.enabled || selected;
  setColor(helper, color, opacity, visuals.xrayMode !== false);

  switch (type) {
    case "HardCheckpoint":
    case "SoftCheckpoint":
    case "TakeoffZone":
    case "LandingZone":
    case "PlaneCheckpoint": {
      const zone = helper.getObjectByName("zone") || helper;
      updateZoneVisual(zone, record.constraint.hitboxType, {
        radius: record.constraint.radius,
        height: record.constraint.height,
        sizeX: record.constraint.sizeX,
        sizeY: record.constraint.sizeY,
        sizeZ: record.constraint.sizeZ,
      });
      if (type === "PlaneCheckpoint") {
        zone.quaternion.copy(
          new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            dir,
          ),
        );
      } else {
        zone.quaternion.identity();
      }
      break;
    }
    case "LineSegment":
    case "Corridor":
    case "AirborneSegment": {
      const isAirborneSegment = type === "AirborneSegment";
      const hitboxType = record.constraint.hitboxType || "cylinder";
      const endPt = new THREE.Vector3(
        numberOr(record.constraint.bx, center.x) -
          numberOr(record.constraint.ax, center.x),
        numberOr(record.constraint.by, center.y) -
          numberOr(record.constraint.ay, center.y),
        numberOr(record.constraint.bz, center.z) -
          numberOr(record.constraint.az, center.z),
      );
      const line = helper.getObjectByName("line");
      if (line) {
        line.geometry.setFromPoints([new THREE.Vector3(), endPt]);
        line.geometry.computeBoundingSphere();
        line.visible = hitboxType !== "box";
      }
      helper.getObjectByName("p0")?.position.set(0, 0, 0);
      helper.getObjectByName("p1")?.position.copy(endPt);

      const dirNorm =
        endPt.lengthSq() > 1e-9
          ? endPt.clone().normalize()
          : new THREE.Vector3(0, 1, 0);
      const alignQ = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dirNorm,
      );
      const midpoint = endPt.clone().multiplyScalar(0.5);
      const segLen = Math.max(0.001, endPt.length());
      const segmentCylinder = helper.getObjectByName("segmentCylinder");
      const segmentBox = helper.getObjectByName("segmentBox");
      const startSphere = helper.getObjectByName("segmentStartSphere");
      const endSphere = helper.getObjectByName("segmentEndSphere");
      const boxX = Math.max(
        0.05,
        numberOr(record.constraint.sizeX, radius * 2),
      );
      const boxY = Math.max(
        0.05,
        numberOr(record.constraint.sizeY, radius * 2),
      );
      const boxZ = Math.max(0.05, numberOr(record.constraint.sizeZ, segLen));

      if (segmentCylinder) {
        segmentCylinder.visible = hitboxType === "cylinder";
        segmentCylinder.position.copy(midpoint);
        segmentCylinder.quaternion.copy(alignQ);
        segmentCylinder.scale.set(radius, segLen, radius);
      }
      if (segmentBox) {
        segmentBox.visible = hitboxType === "box";
        if (isAirborneSegment) {
          segmentBox.position.copy(midpoint);
          segmentBox.quaternion.identity();
          segmentBox.scale.set(
            Math.max(0.05, Math.abs(endPt.x)),
            Math.max(0.05, Math.abs(endPt.y)),
            Math.max(0.05, Math.abs(endPt.z)),
          );
        } else {
          segmentBox.position.copy(midpoint);
          segmentBox.quaternion.copy(alignQ);
          segmentBox.scale.set(boxX, boxY, Math.max(segLen, boxZ));
        }
      }
      if (startSphere) {
        startSphere.visible = hitboxType === "sphere";
        startSphere.position.set(0, 0, 0);
        startSphere.scale.setScalar(radius);
      }
      if (endSphere) {
        endSphere.visible = hitboxType === "sphere";
        endSphere.position.copy(endPt);
        endSphere.scale.setScalar(radius);
      }
      break;
    }
    case "JumpArc": {
      const takeoff = helper.getObjectByName("takeoff");
      const landing = helper.getObjectByName("landing");
      if (takeoff) {
        takeoff.position.set(0, 0, 0);
        updateZoneVisual(takeoff, record.constraint.takeoffHitboxType, {
          radius: record.constraint.takeoffRadius,
          height: record.constraint.takeoffHeight,
          sizeX: record.constraint.takeoffSizeX,
          sizeY: record.constraint.takeoffSizeY,
          sizeZ: record.constraint.takeoffSizeZ,
        });
      }
      const landPos = new THREE.Vector3(
        landingCenter.x - takeoffCenter.x,
        landingCenter.y - takeoffCenter.y,
        landingCenter.z - takeoffCenter.z,
      );
      if (landing) {
        landing.position.copy(landPos);
        updateZoneVisual(landing, record.constraint.landingHitboxType, {
          radius: record.constraint.landingRadius,
          height: record.constraint.landingHeight,
          sizeX: record.constraint.landingSizeX,
          sizeY: record.constraint.landingSizeY,
          sizeZ: record.constraint.landingSizeZ,
        });
      }

      const tether = helper.getObjectByName("tether");
      if (tether) {
        tether.geometry.setFromPoints([new THREE.Vector3(), landPos]);
        tether.geometry.computeBoundingSphere();
      }

      const livePoint = sampleCursor?.point;
      let arcStart;
      if (livePoint) {
        arcStart = new THREE.Vector3(
          livePoint.x - takeoffCenter.x,
          livePoint.y - takeoffCenter.y,
          livePoint.z - takeoffCenter.z,
        );
      } else if (Number.isFinite(record.constraint.takeoffSampleCx)) {
        arcStart = new THREE.Vector3(
          record.constraint.takeoffSampleCx - takeoffCenter.x,
          record.constraint.takeoffSampleCy - takeoffCenter.y,
          record.constraint.takeoffSampleCz - takeoffCenter.z,
        );
      } else {
        arcStart = new THREE.Vector3(0, 0, 0);
      }

      const sampleDot = helper.getObjectByName("takeoffSampleDot");
      if (sampleDot) {
        const hasSample =
          livePoint || Number.isFinite(record.constraint.takeoffSampleCx);
        sampleDot.visible = !!hasSample;
        if (hasSample) sampleDot.position.copy(arcStart);
      }

      const jumpYVel = Math.max(
        0.001,
        numberOr(record.constraint.jumpYVel, 0.072),
      );
      const arcResult = computeJumpArc(
        { x: arcStart.x, y: arcStart.y, z: arcStart.z },
        { x: landPos.x, y: landPos.y, z: landPos.z },
        jumpYVel,
      );
      const arc = helper.getObjectByName("arc");
      const speedLabel = helper.getObjectByName("speedLabel");

      if (arc && arcResult.points.length >= 2) {
        arc.geometry.setFromPoints(arcResult.points);
        arc.geometry.computeBoundingSphere();
      }
      if (speedLabel && arcResult.points.length > 0) {
        const apex = arcResult.points.reduce((a, b) => (a.y > b.y ? a : b));
        speedLabel.position.copy(apex).add(new THREE.Vector3(0, 1.5, 0));
        if (arcResult.impossible) {
          updateSpeedLabel(speedLabel, "IMPOSSIBLE", 0xff4444);
        } else {
          updateSpeedLabel(
            speedLabel,
            `spd ${(arcResult.speed * 1000).toFixed(2)}`,
            typeColor(type, visuals.colorTheme),
          );
        }
      }
      break;
    }
    case "JumpTrain": {
      const nodes = record.constraint.nodes || [];
      const arcParams = record.constraint.arcParams || [];
      const nodeGroups = helper.userData.nodeGroups;
      const arcLines = helper.userData.arcLines;
      const tetherLines = helper.userData.tetherLines;
      const speedLabels = helper.userData.speedLabels;

      while (nodeGroups.length < nodes.length) {
        const idx = nodeGroups.length;
        const zg = createZoneVisual(color, `trainNode_${idx}`);
        enforceOverlayRender(zg);
        setColor(zg, color, opacity, visuals.xrayMode !== false);
        helper.add(zg);
        nodeGroups.push(zg);
      }
      while (nodeGroups.length > nodes.length) {
        const zg = nodeGroups.pop();
        helper.remove(zg);
        disposeObject3D(zg);
      }

      const arcCount = Math.max(0, nodes.length - 1);
      while (arcLines.length < arcCount) {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 2, 0),
          ]),
          lineMat(color, 1),
        );
        line.name = `trainArc_${arcLines.length}`;
        line.frustumCulled = false;
        line.material.depthWrite = false;
        line.material.needsUpdate = true;
        enforceOverlayRender(line);
        helper.add(line);
        arcLines.push(line);
      }
      while (arcLines.length > arcCount) {
        const line = arcLines.pop();
        helper.remove(line);
        disposeObject3D(line);
      }

      while (tetherLines.length < arcCount) {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 4),
          ]),
          lineMat(0xffffff, 0.5),
        );
        line.name = `trainTether_${tetherLines.length}`;
        line.frustumCulled = false;
        line.material.depthWrite = false;
        line.material.needsUpdate = true;
        enforceOverlayRender(line);
        helper.add(line);
        tetherLines.push(line);
      }
      while (tetherLines.length > arcCount) {
        const line = tetherLines.pop();
        helper.remove(line);
        disposeObject3D(line);
      }

      while (speedLabels.length < arcCount) {
        const label = makeSpeedLabel();
        label.name = `trainSpeed_${speedLabels.length}`;
        label.renderOrder = 10001;
        label.frustumCulled = false;
        enforceOverlayRender(label, 10001);
        helper.add(label);
        speedLabels.push(label);
      }
      while (speedLabels.length > arcCount) {
        const label = speedLabels.pop();
        helper.remove(label);
        disposeObject3D(label);
      }

      if (nodes.length === 0) break;

      const origin = nodes[0];

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const zg = nodeGroups[i];
        zg.position.set(n.cx - origin.cx, n.cy - origin.cy, n.cz - origin.cz);
        updateZoneVisual(zg, n.hitboxType, {
          radius: n.radius,
          height: n.height,
          sizeX: n.sizeX,
          sizeY: n.sizeY,
          sizeZ: n.sizeZ,
        });
        setColor(zg, color, opacity, visuals.xrayMode !== false);
      }

      for (let i = 0; i < arcCount; i++) {
        const n0 = nodes[i];
        const n1 = nodes[i + 1];
        const jumpYVel = Math.max(
          0.001,
          numberOr(arcParams[i]?.jumpYVel, 0.072),
        );
        const start = {
          x: n0.cx - origin.cx,
          y: n0.cy - origin.cy,
          z: n0.cz - origin.cz,
        };
        const end = {
          x: n1.cx - origin.cx,
          y: n1.cy - origin.cy,
          z: n1.cz - origin.cz,
        };
        const arcResult = computeJumpArc(start, end, jumpYVel);
        if (arcResult.points.length >= 2) {
          arcLines[i].geometry.setFromPoints(arcResult.points);
          arcLines[i].geometry.computeBoundingSphere();
          arcLines[i].visible = true;
        } else {
          arcLines[i].visible = false;
        }
        tetherLines[i].geometry.setFromPoints([
          new THREE.Vector3(start.x, start.y, start.z),
          new THREE.Vector3(end.x, end.y, end.z),
        ]);
        tetherLines[i].geometry.computeBoundingSphere();
        tetherLines[i].visible = true;

        if (arcResult.points.length > 0) {
          const apex = arcResult.points.reduce((a, b) => (a.y > b.y ? a : b));
          speedLabels[i].position.copy(apex).add(new THREE.Vector3(0, 1.5, 0));
          if (arcResult.impossible) {
            updateSpeedLabel(speedLabels[i], "IMPOSSIBLE", 0xff4444);
          } else {
            updateSpeedLabel(
              speedLabels[i],
              `spd ${(arcResult.speed * 1000).toFixed(2)}`,
              typeColor(type, visuals.colorTheme),
            );
          }
        }
      }
      break;
    }
    case "LookDirection":
    case "LookRange":
    case "VelocityDirection": {
      const arrow = helper.getObjectByName("arrow");
      if (arrow) {
        arrow.setDirection(dir);
        arrow.setLength(Math.max(2, radius * 0.6), radius * 0.15, radius * 0.1);
        arrow.setColor(new THREE.Color(color));
      }
      break;
    }
    case "SpeedWindow":
    case "TurnConstraint":
    case "StateCheckpoint":
      helper
        .getObjectByName("gem")
        ?.scale.setScalar(Math.max(0.5, radius * 0.3));
      break;
  }
}

function makeHoverSphere() {
  const outer = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 12, 12),
    new THREE.MeshBasicMaterial({
      color: HOVER_COLOR,
      depthTest: true,
      depthWrite: true,
      opacity: 0.9,
    }),
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.04, 8, 32),
    new THREE.MeshBasicMaterial({
      color: HOVER_COLOR,
      depthTest: true,
      depthWrite: true,
      opacity: 0.6,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  const g = new THREE.Group();
  g.name = "krHoverCursor";
  g.add(outer);
  g.add(ring);
  g.visible = false;
  return g;
}

const helperById = new Map();
let rootGroup = null;
let rootScene = null;
let hoverSphere = null;
let hoverArmed = false;
let flowLine = null;

function protectScene(scene, group) {
  if (scene.__krProtected) return;
  scene.__krProtected = true;
  const origRemove = scene.remove.bind(scene);
  scene.remove = function (...args) {
    const safe = args.filter((o) => o !== group);
    if (safe.length) origRemove(...safe);
    return scene;
  };
  const origClear = scene.clear.bind(scene);
  scene.clear = function () {
    origClear.call(this);
    this.add(group);
    return this;
  };
}

function ensureRoot(editorScene) {
  if (!rootGroup || rootScene !== editorScene) {
    if (rootGroup && rootScene) rootScene.remove(rootGroup);
    rootGroup = new THREE.Group();
    rootGroup.name = ROOT_NAME;
    flowLine = new THREE.Line(
      new THREE.BufferGeometry(),
      lineMat(FLOW_COLOR, 1),
    );
    flowLine.name = "krConstraintFlow";
    flowLine.renderOrder = 9999;
    rootGroup.add(flowLine);
    hoverSphere = makeHoverSphere();
    enforceOverlayRender(hoverSphere, 10001);
    rootGroup.add(hoverSphere);
    rootScene = editorScene;
    helperById.clear();
  }
  if (rootGroup.parent !== editorScene) editorScene.add(rootGroup);
  protectScene(editorScene, rootGroup);
}

function updateFlowLine(state) {
  if (!flowLine) return;
  const enabled = state.constraints.filter(
    (r) => r.enabled || r.id === state.selectedConstraintId,
  );
  const points = [];
  for (const r of enabled) {
    const c = r.constraint;
    if (c.type === "JumpArc") {
      const start = Number.isFinite(c.takeoffSampleCx)
        ? { x: c.takeoffSampleCx, y: c.takeoffSampleCy, z: c.takeoffSampleCz }
        : {
            x: numberOr(c.takeoffCx, c.cx),
            y: numberOr(c.takeoffCy, c.cy),
            z: numberOr(c.takeoffCz, c.cz),
          };
      const end = {
        x: numberOr(c.landingCx, numberOr(c.bx, c.cx)),
        y: numberOr(c.landingCy, numberOr(c.by, c.cy)),
        z: numberOr(c.landingCz, numberOr(c.bz, c.cz)),
      };
      const jumpYVel = Math.max(0.001, numberOr(c.jumpYVel, 0.072));
      for (const p of computeJumpArc(start, end, jumpYVel).points) {
        points.push(p);
      }
    } else if (
      c.type === "JumpTrain" &&
      Array.isArray(c.nodes) &&
      c.nodes.length >= 2
    ) {
      for (let i = 0; i < c.nodes.length - 1; i++) {
        const n0 = c.nodes[i];
        const n1 = c.nodes[i + 1];
        const jumpYVel = Math.max(
          0.001,
          numberOr(c.arcParams?.[i]?.jumpYVel, 0.072),
        );
        for (const p of computeJumpArc(
          { x: n0.cx, y: n0.cy, z: n0.cz },
          { x: n1.cx, y: n1.cy, z: n1.cz },
          jumpYVel,
        ).points) {
          points.push(p);
        }
      }
    } else {
      points.push(flowAnchor(r));
    }
  }
  flowLine.visible =
    Boolean(state.visuals.showFlowLines) &&
    Boolean(state.visuals.showAll) &&
    points.length >= 2;
  if (!flowLine.visible) return;
  flowLine.geometry.setFromPoints(points);
  flowLine.geometry.computeBoundingSphere();
  const xray = state.visuals.xrayMode !== false;
  flowLine.material.depthTest = !xray;
  flowLine.material.needsUpdate = true;
}

function syncHelpers(editorScene, state) {
  ensureRoot(editorScene);
  const selectedId = state.selectedConstraintId;
  const isSamplingTakeoff =
    state.placementArmed && state.placementTarget === "takeoffSample";
  const previewCursor =
    state.placementArmed && !isSamplingTakeoff && state.viewportCursor?.point
      ? state.viewportCursor
      : null;
  const sampleCursor =
    isSamplingTakeoff && state.viewportCursor?.point
      ? state.viewportCursor
      : null;
  const theme = state.visuals.colorTheme || "classic";
  const validIds = new Set();
  for (const record of state.constraints) {
    validIds.add(record.id);
    let helper = helperById.get(record.id);
    if (
      helper &&
      (helper.userData.helperType !== record.constraint.type ||
        helper.userData.helperVersion !== HELPER_VERSION ||
        helper.userData.helperTheme !== theme)
    ) {
      rootGroup.remove(helper);
      disposeObject3D(helper);
      helperById.delete(record.id);
      helper = null;
    }
    if (!helper) {
      helper = createTypedHelper(record, theme);
      helper.userData.helperTheme = theme;
      helperById.set(record.id, helper);
      rootGroup.add(helper);
    }
    updateHelper(
      helper,
      record,
      record.id === selectedId,
      state.visuals,
      record.id === selectedId ? previewCursor : null,
      record.id === selectedId ? sampleCursor : null,
    );
    helper.visible = state.visuals.showAll && helper.visible;
  }
  for (const [id, helper] of helperById) {
    if (!validIds.has(id)) {
      rootGroup.remove(helper);
      disposeObject3D(helper);
      helperById.delete(id);
    }
  }
  updateFlowLine(state);
}

function updateHoverSphere(state) {
  if (!hoverSphere) return;
  const hit = state.viewportCursor?.point;
  if (!hit) {
    hoverSphere.visible = false;
    return;
  }
  hoverSphere.visible = true;
  hoverSphere.position.set(
    numberOr(hit.x, 0),
    numberOr(hit.y, 0),
    numberOr(hit.z, 0),
  );
  const armed = Boolean(state.placementArmed);
  if (armed === hoverArmed) return;
  hoverArmed = armed;
  const color = armed ? ARMED_COLOR : HOVER_COLOR;
  hoverSphere.traverse((node) => {
    const material = node.material;
    if (!material) return;
    const apply = (m) => {
      m.color?.set(color);
      m.needsUpdate = true;
    };
    if (Array.isArray(material)) material.forEach(apply);
    else apply(material);
  });
}

function disposeObject3D(obj) {
  if (!obj) return;
  obj.traverse((node) => {
    node.geometry?.dispose?.();
    if (Array.isArray(node.material))
      node.material.forEach((m) => m?.dispose?.());
    else node.material?.dispose?.();
  });
}

function detachRoot() {
  if (rootGroup && rootScene) {
    if (rootScene.__krProtected) delete rootScene.__krProtected;
    rootScene.remove(rootGroup);
  }
  if (flowLine) {
    flowLine.geometry?.dispose?.();
    flowLine.material?.dispose?.();
  }
  for (const helper of helperById.values()) disposeObject3D(helper);
  helperById.clear();
  rootGroup = null;
  rootScene = null;
  hoverSphere = null;
  flowLine = null;
}

export function createConstraintRenderer(store, hooks) {
  hooks.subscribeFrame((frame) => {
    const state = store.getState();
    if (frame.scene) {
      syncHelpers(frame.scene, state);
      updateHoverSphere(state);
    } else {
      detachRoot();
    }
  });
  return {
    destroy() {
      detachRoot();
    },
  };
}
