import { createDefaultConstraint, normalizeConstraintRecord } from "./constraints.js";

const defaultState = {
  constraints: [],
  selectedConstraintId: null,
  toolMode: "select",
  placementArmed: false,
  placementTarget: "center",
  viewportCursor: null,
  editorIntegration: {
    mapRef: "unknown-map",
    selection: null,
    sceneReady: false,
  },
  visuals: {
    showAll: true,
    showOnlySelected: false,
    showFlowLines: true,
    showLabels: true,
    lineThickness: 2,
    xrayMode: false,
    alwaysOnTop: true,
    colorTheme: "classic",
    opacity: 0.9,
  },
  savedPositions: [],
  ui: {
    listFilter: "",
    listSort: "created_desc",
    activeTab: "list",
    mapImportText: "",
  },
  history: {
    past: [],
    future: [],
    limit: 100,
  },
  dirty: false,
};

export function createStore(initialState = {}) {
  const subscribers = new Set();
  let state = {
    ...defaultState,
    ...initialState,
    constraints: (initialState.constraints || []).map((record) =>
      normalizeConstraintRecord(record),
    ),
  };

  function setState(updater) {
    state = typeof updater === "function" ? updater(state) : { ...state, ...updater };
    for (const cb of subscribers) {
      cb(state);
    }
  }

  function markDirty(nextState) {
    return { ...nextState, dirty: true };
  }

  function snapshotForHistory(s) {
    return {
      constraints: s.constraints,
      selectedConstraintId: s.selectedConstraintId,
      savedPositions: s.savedPositions,
      visuals: s.visuals,
      ui: s.ui,
    };
  }

  function applyConstraintPatch(records, id, patch) {
    return records.map((record) => {
      if (record.id !== id) {
        return record;
      }
      const next = {
        ...record,
        ...patch,
        constraint: {
          ...record.constraint,
          ...(patch.constraint || {}),
        },
      };
      return normalizeConstraintRecord(next);
    });
  }

  function withHistory(s, applyMutation) {
    const prev = snapshotForHistory(s);
    const base = applyMutation(s);
    const next = markDirty(base);
    const history = next.history || defaultState.history;
    const past = [...history.past, prev];
    if (past.length > history.limit) {
      past.shift();
    }
    return {
      ...next,
      history: { ...history, past, future: [] },
    };
  }

  const actions = {
    subscribe(cb) {
      subscribers.add(cb);
      cb(state);
      return () => subscribers.delete(cb);
    },
    getState() {
      return state;
    },
    replaceAll(nextState) {
      setState({
        ...defaultState,
        ...nextState,
        constraints: (nextState.constraints || []).map((record) =>
          normalizeConstraintRecord(record),
        ),
      });
    },
    importDocument(doc) {
      setState((s) =>
        withHistory(s, () => ({
          ...s,
          constraints: (doc.constraints || []).map((record) =>
            normalizeConstraintRecord(record),
          ),
          savedPositions: [...(doc.savedPositions || [])],
          visuals: { ...s.visuals, ...(doc.visuals || {}) },
          ui: { ...s.ui, ...(doc.ui || {}) },
          selectedConstraintId: doc.selectedConstraintId || doc.constraints?.[0]?.id || null,
        })),
      );
    },
    addConstraint(type, position) {
      const record = createDefaultConstraint(type, position);
      setState((s) =>
        withHistory(s, () => ({
          ...s,
          constraints: [...s.constraints, record],
          selectedConstraintId: record.id,
        })),
      );
      return record;
    },
    updateConstraint(id, patch) {
      setState((s) =>
        withHistory(s, () => ({
          ...s,
          constraints: applyConstraintPatch(s.constraints, id, patch),
        })),
      );
    },
    updateConstraintLive(id, patch) {
      setState((s) =>
        markDirty({
          ...s,
          constraints: applyConstraintPatch(s.constraints, id, patch),
        }),
      );
    },
    deleteConstraint(id) {
      setState((s) =>
        withHistory(s, () => ({
          ...s,
          constraints: s.constraints.filter((record) => record.id !== id),
          selectedConstraintId:
            s.selectedConstraintId === id ? null : s.selectedConstraintId,
        })),
      );
    },
    clearAllConstraints() {
      setState((s) =>
        withHistory(s, () => ({
          ...s,
          constraints: [],
          selectedConstraintId: null,
        })),
      );
    },
    deleteDisabledConstraints() {
      setState((s) =>
        withHistory(s, () => ({
          ...s,
          constraints: s.constraints.filter((record) => record.enabled),
          selectedConstraintId: s.selectedConstraintId,
        })),
      );
    },
    toggleAllConstraints(enabled) {
      setState((s) =>
        withHistory(s, () => ({
          ...s,
          constraints: s.constraints.map((record) => ({ ...record, enabled })),
        })),
      );
    },
    duplicateConstraint(id) {
      const source = state.constraints.find((record) => record.id === id);
      if (!source) {
        return null;
      }
      const clone = createDefaultConstraint(source.constraint.type, {
        x: source.constraint.cx,
        y: source.constraint.cy,
        z: source.constraint.cz,
      });
      clone.label = `${source.label} copy`;
      clone.constraint = { ...clone.constraint, ...source.constraint };
      setState((s) =>
        withHistory(s, () => ({
          ...s,
          constraints: [...s.constraints, clone],
          selectedConstraintId: clone.id,
        })),
      );
      return clone;
    },
    reorderConstraint(id, direction) {
      setState((s) =>
        withHistory(s, () => {
          const idx = s.constraints.findIndex((record) => record.id === id);
          if (idx < 0) {
            return s;
          }
          const target = direction === "up" ? idx - 1 : idx + 1;
          if (target < 0 || target >= s.constraints.length) {
            return s;
          }
          const next = [...s.constraints];
          const [item] = next.splice(idx, 1);
          next.splice(target, 0, item);
          return { ...s, constraints: next };
        }),
      );
    },
    moveConstraintToIndex(id, targetIndex) {
      setState((s) =>
        withHistory(s, () => {
          const fromIndex = s.constraints.findIndex((record) => record.id === id);
          if (fromIndex < 0) {
            return s;
          }
          const clampedTarget = Math.max(0, Math.min(s.constraints.length - 1, targetIndex));
          if (fromIndex === clampedTarget) {
            return s;
          }
          const next = [...s.constraints];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(clampedTarget, 0, moved);
          return { ...s, constraints: next };
        }),
      );
    },
    selectConstraint(id) {
      setState((s) => ({ ...s, selectedConstraintId: id }));
    },
    setToolMode(mode) {
      setState((s) => ({ ...s, toolMode: mode }));
    },
    setPlacementArmed(placementArmed) {
      setState((s) => ({ ...s, placementArmed }));
    },
    setPlacementTarget(placementTarget) {
      setState((s) => ({ ...s, placementTarget }));
    },
    setViewportCursor(viewportCursor) {
      setState((s) => ({ ...s, viewportCursor }));
    },
    setEditorIntegration(patch) {
      setState((s) => ({ ...s, editorIntegration: { ...s.editorIntegration, ...patch } }));
    },
    setVisuals(patch) {
      setState((s) =>
        withHistory(s, () => ({
          ...s,
          visuals: { ...s.visuals, ...patch },
        })),
      );
    },
    addSavedPosition(position) {
      const name = position?.name || `Pos ${state.savedPositions.length + 1}`;
      setState((s) =>
        withHistory(s, () => ({
          ...s,
          savedPositions: [...s.savedPositions, { ...position, name }],
        })),
      );
    },
    deleteSavedPosition(index) {
      setState((s) =>
        withHistory(s, () => ({
          ...s,
          savedPositions: s.savedPositions.filter((_, i) => i !== index),
        })),
      );
    },
    moveSelectedTo(x, y, z) {
      const id = state.selectedConstraintId;
      if (!id) {
        return;
      }
      actions.updateConstraint(id, { constraint: { cx: x, cy: y, cz: z } });
    },
    nudgeSelected(delta) {
      const id = state.selectedConstraintId;
      const selected = state.constraints.find((record) => record.id === id);
      if (!selected) {
        return;
      }
      actions.updateConstraint(id, {
        constraint: {
          cx: Number(selected.constraint.cx || 0) + Number(delta.x || 0),
          cy: Number(selected.constraint.cy || 0) + Number(delta.y || 0),
          cz: Number(selected.constraint.cz || 0) + Number(delta.z || 0),
        },
      });
    },
    setUiState(patch) {
      setState((s) =>
        markDirty({
          ...s,
          ui: { ...s.ui, ...patch },
        }),
      );
    },
    undo() {
      setState((s) => {
        if (!s.history.past.length) {
          return s;
        }
        const previous = s.history.past[s.history.past.length - 1];
        const past = s.history.past.slice(0, -1);
        const future = [snapshotForHistory(s), ...s.history.future];
        return {
          ...s,
          ...previous,
          dirty: true,
          history: { ...s.history, past, future },
        };
      });
    },
    redo() {
      setState((s) => {
        if (!s.history.future.length) {
          return s;
        }
        const [nextSnapshot, ...future] = s.history.future;
        const past = [...s.history.past, snapshotForHistory(s)];
        return {
          ...s,
          ...nextSnapshot,
          dirty: true,
          history: { ...s.history, past, future },
        };
      });
    },
    clearDirty() {
      setState((s) => ({ ...s, dirty: false }));
    },
  };

  return actions;
}
