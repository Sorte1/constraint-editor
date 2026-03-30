import { createDocument, normalizeConstraintRecord } from "./constraints.js";

const STORAGE_PREFIX = "krunker.constraintEditor.v1";
const DRAFT_SUFFIX = ":drafts";
const LAST_SESSION_KEY = `${STORAGE_PREFIX}:last-session`;

function keyForMap(mapRef) {
  return `${STORAGE_PREFIX}:${mapRef || "unknown-map"}`;
}

function draftKeyForMap(mapRef) {
  return `${keyForMap(mapRef)}${DRAFT_SUFFIX}`;
}

export function saveConstraintDocument(documentState) {
  const mapRef = documentState?.mapRef;
  const key = keyForMap(mapRef);
  const payload = {
    ...createDocument(mapRef, documentState?.constraints || []),
    name: documentState?.name || mapRef || "Constraint Set",
    savedPositions: [...(documentState?.savedPositions || [])],
    visuals: { ...(documentState?.visuals || {}) },
    ui: { ...(documentState?.ui || {}) },
    selectedConstraintId: documentState?.selectedConstraintId || null,
    savedAt: Date.now(),
  };
  const serialized = JSON.stringify(payload);
  localStorage.setItem(key, serialized);
  localStorage.setItem(LAST_SESSION_KEY, serialized);
}

export function loadConstraintDocument(mapRef) {
  const key = keyForMap(mapRef);
  const mapRaw = localStorage.getItem(key);
  const lastRaw = localStorage.getItem(LAST_SESSION_KEY);
  if (!mapRaw && !lastRaw) {
    return null;
  }
  try {
    const mapParsed = mapRaw ? JSON.parse(mapRaw) : null;
    const lastParsed = lastRaw ? JSON.parse(lastRaw) : null;
    const parsed = (lastParsed?.savedAt || 0) > (mapParsed?.savedAt || 0)
      ? lastParsed
      : (mapParsed || lastParsed);
    return {
      ...parsed,
      constraints: (parsed.constraints || []).map((record) =>
        normalizeConstraintRecord(record),
      ),
      savedPositions: [...(parsed.savedPositions || [])],
      visuals: { ...(parsed.visuals || {}) },
      ui: { ...(parsed.ui || {}) },
      selectedConstraintId: parsed.selectedConstraintId || null,
    };
  } catch {
    return null;
  }
}

export function createAutosave(store, getMapRef, delayMs = 400) {
  let timeout = null;
  let latestState = null;

  function flush() {
    if (!latestState?.dirty) {
      return;
    }
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    saveConstraintDocument({
      mapRef: getMapRef(),
      name: latestState.editorIntegration.mapRef || "Constraint Set",
      constraints: latestState.constraints,
      savedPositions: latestState.savedPositions,
      visuals: latestState.visuals,
      ui: latestState.ui,
      selectedConstraintId: latestState.selectedConstraintId,
    });
    store.clearDirty();
  }

  const onBeforeUnload = () => flush();
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      flush();
    }
  };
  window.addEventListener("beforeunload", onBeforeUnload);
  document.addEventListener("visibilitychange", onVisibilityChange);

  const unsubscribe = store.subscribe((state) => {
    latestState = state;
    if (!state.dirty) {
      return;
    }
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      flush();
    }, delayMs);
  });

  return () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    flush();
    unsubscribe();
    window.removeEventListener("beforeunload", onBeforeUnload);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

export function saveConstraintDrafts(mapRef, draftsById) {
  const key = draftKeyForMap(mapRef);
  const source = draftsById && typeof draftsById === "object" ? draftsById : {};
  const cleaned = {};
  for (const [id, draft] of Object.entries(source)) {
    if (!id || !draft || typeof draft !== "object") {
      continue;
    }
    cleaned[id] = {
      label: typeof draft.label === "string" ? draft.label : "",
      type: typeof draft.type === "string" ? draft.type : "HardCheckpoint",
      constraint: { ...(draft.constraint || {}) },
      updatedAt: Number(draft.updatedAt || Date.now()),
    };
  }
  localStorage.setItem(key, JSON.stringify(cleaned));
}

export function loadConstraintDrafts(mapRef) {
  const key = draftKeyForMap(mapRef);
  const raw = localStorage.getItem(key);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}
