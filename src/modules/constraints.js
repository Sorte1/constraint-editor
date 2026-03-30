const POSITIONED_TYPES = new Set([
  "HardCheckpoint",
  "SoftCheckpoint",
  "PlaneCheckpoint",
  "TakeoffZone",
  "LandingZone",
  "LookDirection",
  "LookRange",
]);

export const HITBOX_TYPES = ["box", "sphere", "circle", "cylinder"];
export const REQUIRED_STATES = [
  "Grounded",
  "Airborne",
  "Crouching",
  "Sliding",
  "OnWall",
];

export const CONSTRAINT_TYPES = [
  "HardCheckpoint",
  "SoftCheckpoint",
  "PlaneCheckpoint",
  "LineSegment",
  "Corridor",
  "JumpArc",
  "TakeoffZone",
  "LandingZone",
  "AirborneSegment",
  "LookDirection",
  "LookRange",
  "SpeedWindow",
  "VelocityDirection",
  "TurnConstraint",
  "StateCheckpoint",
];

function newId() {
  if (globalThis.crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function defaultConstraintFields(type, position) {
  const cx = finiteOr(position?.x, 0);
  const cy = finiteOr(position?.y, 0);
  const cz = finiteOr(position?.z, 0);
  const radius = 8;
  const nx = 0;
  const ny = 1;
  const nz = 0;
  const ax = cx;
  const ay = cy;
  const az = cz;
  const bx = cx;
  const by = cy;
  const bz = cz + radius;

  const base = {
    type,
    cx,
    cy,
    cz,
    radius,
    nx,
    ny,
    nz,
    ax,
    ay,
    az,
    bx,
    by,
    bz,
    hitboxType: "sphere",
    height: 6,
    sizeX: 8,
    sizeY: 8,
    sizeZ: 8,
    yaw: 0,
    toleranceRad: 0.35,
    yawMin: -0.6,
    yawMax: 0.6,
    minSpeed: 0,
    maxSpeed: 0.02,
    targetYaw: 0,
    maxDeltaRad: 0.5,
    requiredState: "Grounded",
    jumpYVel: 0.072,
    takeoffCx: cx,
    takeoffCy: cy,
    takeoffCz: cz,
    takeoffHitboxType: "sphere",
    takeoffRadius: 8,
    takeoffHeight: 6,
    takeoffSizeX: 8,
    takeoffSizeY: 8,
    takeoffSizeZ: 8,
    landingCx: cx,
    landingCy: cy,
    landingCz: cz + radius,
    landingHitboxType: "sphere",
    landingRadius: 8,
    landingHeight: 6,
    landingSizeX: 8,
    landingSizeY: 8,
    landingSizeZ: 8,
  };

  if (type === "PlaneCheckpoint") {
    base.hitboxType = "circle";
  } else if (
    type === "LineSegment" ||
    type === "Corridor" ||
    type === "AirborneSegment"
  ) {
    base.hitboxType = "cylinder";
  }

  return base;
}

export function createDefaultConstraint(type = "HardCheckpoint", position) {
  return {
    id: newId(),
    label: `${type}`,
    enabled: true,
    constraint: defaultConstraintFields(type, position),
  };
}

export function isPositionalConstraint(type) {
  return POSITIONED_TYPES.has(type);
}

export function normalizeConstraintRecord(record) {
  if (!record || typeof record !== "object") {
    return createDefaultConstraint();
  }
  const type = record.constraint?.type || "HardCheckpoint";
  const base = createDefaultConstraint(type, {
    x: record.constraint?.cx,
    y: record.constraint?.cy,
    z: record.constraint?.cz,
  });

  const next = {
    ...base,
    ...record,
    constraint: {
      ...base.constraint,
      ...(record.constraint || {}),
    },
  };

  const c = next.constraint;
  c.cx = finiteOr(c.cx, 0);
  c.cy = finiteOr(c.cy, 0);
  c.cz = finiteOr(c.cz, 0);
  c.radius = Math.max(0.01, finiteOr(c.radius, 8));
  c.nx = finiteOr(c.nx, 0);
  c.ny = finiteOr(c.ny, 1);
  c.nz = finiteOr(c.nz, 0);

  c.ax = finiteOr(c.ax, c.cx);
  c.ay = finiteOr(c.ay, c.cy);
  c.az = finiteOr(c.az, c.cz);
  const fallbackBx = c.cx + c.nx * c.radius;
  const fallbackBy = c.cy + c.ny * c.radius;
  const fallbackBz = c.cz + c.nz * c.radius;
  c.bx = finiteOr(c.bx, fallbackBx);
  c.by = finiteOr(c.by, fallbackBy);
  c.bz = finiteOr(c.bz, fallbackBz);

  c.hitboxType = HITBOX_TYPES.includes(c.hitboxType) ? c.hitboxType : base.constraint.hitboxType;
  c.height = Math.max(0.01, finiteOr(c.height, 6));
  c.sizeX = Math.max(0.01, finiteOr(c.sizeX, 8));
  c.sizeY = Math.max(0.01, finiteOr(c.sizeY, 8));
  c.sizeZ = Math.max(0.01, finiteOr(c.sizeZ, 8));

  c.yaw = finiteOr(c.yaw, 0);
  c.toleranceRad = Math.max(0, finiteOr(c.toleranceRad, 0.35));
  c.yawMin = finiteOr(c.yawMin, -0.6);
  c.yawMax = finiteOr(c.yawMax, 0.6);
  c.minSpeed = Math.max(0, finiteOr(c.minSpeed, 0));
  c.maxSpeed = Math.max(c.minSpeed, finiteOr(c.maxSpeed, 0.02));
  c.targetYaw = finiteOr(c.targetYaw, 0);
  c.maxDeltaRad = Math.max(0, finiteOr(c.maxDeltaRad, 0.5));
  c.requiredState = REQUIRED_STATES.includes(c.requiredState) ? c.requiredState : "Grounded";

  c.jumpYVel = Math.max(0.001, finiteOr(c.jumpYVel, 0.072));

  c.takeoffCx = finiteOr(c.takeoffCx, c.cx);
  c.takeoffCy = finiteOr(c.takeoffCy, c.cy);
  c.takeoffCz = finiteOr(c.takeoffCz, c.cz);
  c.takeoffHitboxType = HITBOX_TYPES.includes(c.takeoffHitboxType)
    ? c.takeoffHitboxType
    : "sphere";
  c.takeoffRadius = Math.max(0.01, finiteOr(c.takeoffRadius, c.radius));
  c.takeoffHeight = Math.max(0.01, finiteOr(c.takeoffHeight, c.height));
  c.takeoffSizeX = Math.max(0.01, finiteOr(c.takeoffSizeX, c.sizeX));
  c.takeoffSizeY = Math.max(0.01, finiteOr(c.takeoffSizeY, c.sizeY));
  c.takeoffSizeZ = Math.max(0.01, finiteOr(c.takeoffSizeZ, c.sizeZ));

  c.landingCx = finiteOr(c.landingCx, c.bx);
  c.landingCy = finiteOr(c.landingCy, c.by);
  c.landingCz = finiteOr(c.landingCz, c.bz);
  c.landingHitboxType = HITBOX_TYPES.includes(c.landingHitboxType)
    ? c.landingHitboxType
    : "sphere";
  c.landingRadius = Math.max(0.01, finiteOr(c.landingRadius, c.radius));
  c.landingHeight = Math.max(0.01, finiteOr(c.landingHeight, c.height));
  c.landingSizeX = Math.max(0.01, finiteOr(c.landingSizeX, c.sizeX));
  c.landingSizeY = Math.max(0.01, finiteOr(c.landingSizeY, c.sizeY));
  c.landingSizeZ = Math.max(0.01, finiteOr(c.landingSizeZ, c.sizeZ));

  return next;
}

export function validateConstraint(record) {
  const errors = [];
  if (!record?.id) {
    errors.push("Missing id");
  }
  if (!record?.constraint?.type) {
    errors.push("Missing constraint type");
  }
  const nums = ["cx", "cy", "cz"];
  for (const key of nums) {
    if (!Number.isFinite(record?.constraint?.[key])) {
      errors.push(`${key} must be finite`);
    }
  }
  const numericKeys = [
    "radius",
    "height",
    "sizeX",
    "sizeY",
    "sizeZ",
    "ax",
    "ay",
    "az",
    "bx",
    "by",
    "bz",
    "yaw",
    "toleranceRad",
    "yawMin",
    "yawMax",
    "minSpeed",
    "maxSpeed",
    "targetYaw",
    "maxDeltaRad",
    "jumpYVel",
    "takeoffCx",
    "takeoffCy",
    "takeoffCz",
    "takeoffRadius",
    "takeoffHeight",
    "takeoffSizeX",
    "takeoffSizeY",
    "takeoffSizeZ",
    "landingCx",
    "landingCy",
    "landingCz",
    "landingRadius",
    "landingHeight",
    "landingSizeX",
    "landingSizeY",
    "landingSizeZ",
  ];
  for (const key of numericKeys) {
    if (key in (record?.constraint || {}) && !Number.isFinite(record.constraint[key])) {
      errors.push(`${key} must be finite`);
    }
  }
  return errors;
}

export function createDocument(mapRef, constraints = []) {
  return {
    version: 1,
    name: mapRef || "Constraint Set",
    mapRef: mapRef || "unknown-map",
    savedPositions: [],
    visuals: {},
    ui: {},
    selectedConstraintId: null,
    constraints: constraints.map((record) => normalizeConstraintRecord(record)),
  };
}
