import { normalizeConstraintRecord } from "./constraints.js";

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
  return {
    version: 1,
    constraints: (documentState?.constraints || []).map((record) =>
      normalizeConstraintRecord(record),
    ),
  };
}
