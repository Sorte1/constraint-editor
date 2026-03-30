import { createDefaultConstraint, normalizeConstraintRecord } from "./constraints.js";

export function exportConstraintDocument(documentState) {
  const doc = createConstraintsOnlyPayload(documentState);
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${documentState?.mapRef || "map"}.constraints.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function importConstraintsFromFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  return migrateConstraintDocument(parsed);
}

export function migrateConstraintDocument(doc) {
  if (Array.isArray(doc)) {
    return {
      version: 1,
      name: "Imported Constraint Set",
      mapRef: "unknown-map",
      savedPositions: [],
      visuals: {},
      ui: {},
      selectedConstraintId: null,
      constraints: doc.map((record) => normalizeConstraintRecord(record)),
    };
  }
  if (!doc || typeof doc !== "object") {
    throw new Error("Invalid JSON document");
  }
  const version = Number(doc.version || 1);
  if (version > 1) {
    throw new Error(`Unsupported constraints version ${version}`);
  }
  return {
    version: 1,
    name: doc.name || "Imported Constraint Set",
    mapRef: doc.mapRef || "unknown-map",
    savedPositions: [...(doc.savedPositions || [])],
    visuals: { ...(doc.visuals || {}) },
    ui: { ...(doc.ui || {}) },
    selectedConstraintId: doc.selectedConstraintId || null,
    constraints: (doc.constraints || []).map((record) =>
      normalizeConstraintRecord(record),
    ),
  };
}

export function serializeConstraintDocument(documentState) {
  return JSON.stringify(createConstraintsOnlyPayload(documentState), null, 2);
}

function createConstraintsOnlyPayload(documentState) {
  const expanded = [];
  for (const rawRecord of documentState?.constraints || []) {
    const record = normalizeConstraintRecord(rawRecord);
    const c = record.constraint || {};
    if (c.type === "JumpTrain" && Array.isArray(c.nodes) && c.nodes.length >= 2) {
      for (let i = 0; i < c.nodes.length - 1; i++) {
        const n0 = c.nodes[i];
        const n1 = c.nodes[i + 1];
        const arc = createDefaultConstraint("JumpArc", {
          x: n0.cx,
          y: n0.cy,
          z: n0.cz,
        });
        arc.enabled = record.enabled;
        arc.label = `${record.label || "Jump Train"} ${i + 1}`;
        arc.constraint = {
          ...arc.constraint,
          takeoffCx: n0.cx,
          takeoffCy: n0.cy,
          takeoffCz: n0.cz,
          takeoffHitboxType: n0.hitboxType,
          takeoffRadius: n0.radius,
          takeoffHeight: n0.height,
          takeoffSizeX: n0.sizeX,
          takeoffSizeY: n0.sizeY,
          takeoffSizeZ: n0.sizeZ,
          landingCx: n1.cx,
          landingCy: n1.cy,
          landingCz: n1.cz,
          landingHitboxType: n1.hitboxType,
          landingRadius: n1.radius,
          landingHeight: n1.height,
          landingSizeX: n1.sizeX,
          landingSizeY: n1.sizeY,
          landingSizeZ: n1.sizeZ,
          jumpYVel: Number(c.arcParams?.[i]?.jumpYVel ?? 0.072),
        };
        expanded.push(normalizeConstraintRecord(arc));
      }
      continue;
    }
    if (c.type === "JumpArc") {
      const stripped = normalizeConstraintRecord({
        ...record,
        constraint: { ...c },
      });
      delete stripped.constraint.trainGroupId;
      delete stripped.constraint.trainIndex;
      expanded.push(stripped);
      continue;
    }
    expanded.push(record);
  }
  return {
    version: 1,
    constraints: expanded,
  };
}
