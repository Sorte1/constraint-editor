import {
  createDefaultConstraint,
  createDefaultTrainNode,
  normalizeConstraintRecord,
} from "./constraints.js";

const defaultState = {
  constraints: [],
  selectedConstraintId: null,
  toolMode: "select",
  placementArmed: false,
  placementTarget: "center",
  trainPlacementGroupId: null,
  trainPendingNode: null,
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
  function normalizeRecords(records = []) {
    const out = [];
    for (const raw of records) {
      const record = normalizeConstraintRecord(raw);
      const c = record.constraint || {};
      if (
        c.type === "JumpTrain" &&
        Array.isArray(c.nodes) &&
        c.nodes.length >= 2
      ) {
        const groupId =
          globalThis.crypto?.randomUUID?.() ||
          `train-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        for (let i = 0; i < c.nodes.length - 1; i++) {
          const n0 = c.nodes[i];
          const n1 = c.nodes[i + 1];
          const arc = createDefaultConstraint("JumpArc", {
            x: n0.cx,
            y: n0.cy,
            z: n0.cz,
          });
          arc.label = `${record.label || "Jump Train"} ${i + 1}`;
          arc.enabled = record.enabled;
          arc.constraint = {
            ...arc.constraint,
            trainGroupId: groupId,
            trainIndex: i,
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
          out.push(normalizeConstraintRecord(arc));
        }
      } else {
        out.push(record);
      }
    }
    return out;
  }

  const subscribers = new Set();
  let state = {
    ...defaultState,
    ...initialState,
    constraints: normalizeRecords(initialState.constraints || []),
  };

  function setState(updater) {
    state =
      typeof updater === "function" ? updater(state) : { ...state, ...updater };
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

  function makeTrainGroupId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `train-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function isGroupedJumpArc(record) {
    return (
      record?.constraint?.type === "JumpArc" &&
      typeof record.constraint.trainGroupId === "string" &&
      record.constraint.trainGroupId.length > 0
    );
  }

  function resolveTrainGroupId(records, idOrGroup) {
    if (!idOrGroup) return null;
    const byId = records.find((r) => r.id === idOrGroup);
    if (isGroupedJumpArc(byId)) return byId.constraint.trainGroupId;
    const hasGroup = records.some(
      (r) => isGroupedJumpArc(r) && r.constraint.trainGroupId === idOrGroup,
    );
    return hasGroup ? idOrGroup : null;
  }

  function getTrainGroupArcs(records, idOrGroup) {
    const groupId = resolveTrainGroupId(records, idOrGroup);
    if (!groupId) return [];
    const order = new Map(records.map((r, i) => [r.id, i]));
    return records
      .filter(
        (r) => isGroupedJumpArc(r) && r.constraint.trainGroupId === groupId,
      )
      .sort(
        (a, b) =>
          Number(a.constraint.trainIndex ?? 0) -
            Number(b.constraint.trainIndex ?? 0) ||
          Number(order.get(a.id) ?? 0) - Number(order.get(b.id) ?? 0),
      );
  }

  function patchArcNodeSide(arcRecord, side, patch) {
    const c = arcRecord.constraint || {};
    const prefix = side === "takeoff" ? "takeoff" : "landing";
    const nextConstraint = { ...c };
    if ("cx" in patch) nextConstraint[`${prefix}Cx`] = Number(patch.cx);
    if ("cy" in patch) nextConstraint[`${prefix}Cy`] = Number(patch.cy);
    if ("cz" in patch) nextConstraint[`${prefix}Cz`] = Number(patch.cz);
    if ("hitboxType" in patch)
      nextConstraint[`${prefix}HitboxType`] = patch.hitboxType;
    if ("radius" in patch)
      nextConstraint[`${prefix}Radius`] = Number(patch.radius);
    if ("height" in patch)
      nextConstraint[`${prefix}Height`] = Number(patch.height);
    if ("sizeX" in patch)
      nextConstraint[`${prefix}SizeX`] = Number(patch.sizeX);
    if ("sizeY" in patch)
      nextConstraint[`${prefix}SizeY`] = Number(patch.sizeY);
    if ("sizeZ" in patch)
      nextConstraint[`${prefix}SizeZ`] = Number(patch.sizeZ);
    return normalizeConstraintRecord({
      ...arcRecord,
      constraint: nextConstraint,
    });
  }

  function trainNodeFromArcSide(arcRecord, side) {
    const c = arcRecord.constraint || {};
    const prefix = side === "takeoff" ? "takeoff" : "landing";
    const node = createDefaultTrainNode({
      x: c[`${prefix}Cx`],
      y: c[`${prefix}Cy`],
      z: c[`${prefix}Cz`],
    });
    node.hitboxType = c[`${prefix}HitboxType`] ?? node.hitboxType;
    node.radius = Number(c[`${prefix}Radius`] ?? node.radius);
    node.height = Number(c[`${prefix}Height`] ?? node.height);
    node.sizeX = Number(c[`${prefix}SizeX`] ?? node.sizeX);
    node.sizeY = Number(c[`${prefix}SizeY`] ?? node.sizeY);
    node.sizeZ = Number(c[`${prefix}SizeZ`] ?? node.sizeZ);
    return node;
  }

  function normalizeTrainGroupIndices(records, groupId) {
    const arcs = getTrainGroupArcs(records, groupId);
    const nextIndexById = new Map(arcs.map((arc, index) => [arc.id, index]));
    return records.map((record) => {
      if (!isGroupedJumpArc(record)) return record;
      if (record.constraint.trainGroupId !== groupId) return record;
      const idx = nextIndexById.get(record.id);
      if (!Number.isFinite(idx)) return record;
      return normalizeConstraintRecord({
        ...record,
        constraint: { ...record.constraint, trainIndex: idx },
      });
    });
  }

  function getTrainGroupViewFromConstraints(
    records,
    idOrGroup,
    pendingNode = null,
  ) {
    const arcs = getTrainGroupArcs(records, idOrGroup);
    const groupId = resolveTrainGroupId(records, idOrGroup) || idOrGroup;
    if (!groupId) return null;
    if (!arcs.length) {
      return {
        groupId,
        arcIds: [],
        nodes: pendingNode ? [createDefaultTrainNode(pendingNode)] : [],
        arcParams: [],
        enabled: true,
      };
    }
    const nodes = [trainNodeFromArcSide(arcs[0], "takeoff")];
    for (const arc of arcs) {
      nodes.push(trainNodeFromArcSide(arc, "landing"));
    }
    const arcParams = arcs.map((arc) => ({
      jumpYVel: Number(arc.constraint.jumpYVel ?? 0.072),
    }));
    return {
      groupId,
      arcIds: arcs.map((a) => a.id),
      nodes,
      arcParams,
      enabled: arcs.some((a) => a.enabled !== false),
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
        constraints: normalizeRecords(nextState.constraints || []),
      });
    },
    importDocument(doc) {
      setState((s) =>
        withHistory(s, () => ({
          ...s,
          constraints: normalizeRecords(doc.constraints || []),
          savedPositions: [...(doc.savedPositions || [])],
          visuals: { ...s.visuals, ...(doc.visuals || {}) },
          ui: { ...s.ui, ...(doc.ui || {}) },
          selectedConstraintId:
            doc.selectedConstraintId || doc.constraints?.[0]?.id || null,
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
      if (clone.constraint.type === "JumpArc") {
        delete clone.constraint.trainGroupId;
        delete clone.constraint.trainIndex;
      }
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
          const fromIndex = s.constraints.findIndex(
            (record) => record.id === id,
          );
          if (fromIndex < 0) {
            return s;
          }
          const clampedTarget = Math.max(
            0,
            Math.min(s.constraints.length - 1, targetIndex),
          );
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
    moveTrainGroupToIndex(idOrGroup, targetIndex) {
      setState((s) =>
        withHistory(s, () => {
          const groupId = resolveTrainGroupId(s.constraints, idOrGroup);
          if (!groupId) return s;
          const indices = [];
          for (let i = 0; i < s.constraints.length; i++) {
            const record = s.constraints[i];
            if (
              isGroupedJumpArc(record) &&
              record.constraint.trainGroupId === groupId
            ) {
              indices.push(i);
            }
          }
          if (!indices.length) return s;

          const first = indices[0];
          const last = indices[indices.length - 1];
          const rawTarget = Math.max(
            0,
            Math.min(
              s.constraints.length,
              Math.floor(Number.isFinite(Number(targetIndex)) ? Number(targetIndex) : 0),
            ),
          );
          if (rawTarget >= first && rawTarget <= last + 1) {
            return s;
          }

          const removeSet = new Set(indices);
          const block = s.constraints.filter((_, idx) => removeSet.has(idx));
          const remaining = s.constraints.filter((_, idx) => !removeSet.has(idx));
          const removedBeforeTarget = indices.filter((idx) => idx < rawTarget).length;
          const insertAt = Math.max(
            0,
            Math.min(remaining.length, rawTarget - removedBeforeTarget),
          );
          const next = [...remaining];
          next.splice(insertAt, 0, ...block);
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
      setState((s) => ({
        ...s,
        editorIntegration: { ...s.editorIntegration, ...patch },
      }));
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
    startJumpTrain() {
      const groupId = makeTrainGroupId();
      setState((s) =>
        withHistory(s, () => ({
          ...s,
          trainPlacementGroupId: groupId,
          trainPendingNode: null,
          placementArmed: true,
          placementTarget: "trainNode",
          toolMode: "place",
        })),
      );
      return groupId;
    },
    addTrainNode(point) {
      setState((s) =>
        withHistory(s, () => {
          const groupId = s.trainPlacementGroupId;
          if (!groupId) return s;
          const arcs = getTrainGroupArcs(s.constraints, groupId);
          const newNode = createDefaultTrainNode(point);
          if (!arcs.length && !s.trainPendingNode) {
            return markDirty({
              ...s,
              trainPendingNode: newNode,
            });
          }
          const startNode = arcs.length
            ? trainNodeFromArcSide(arcs[arcs.length - 1], "landing")
            : s.trainPendingNode;
          if (!startNode) return s;
          const arc = createDefaultConstraint("JumpArc", point);
          arc.label = "Jump Arc";
          arc.constraint = {
            ...arc.constraint,
            trainGroupId: groupId,
            trainIndex: arcs.length,
            takeoffCx: startNode.cx,
            takeoffCy: startNode.cy,
            takeoffCz: startNode.cz,
            takeoffHitboxType: startNode.hitboxType,
            takeoffRadius: startNode.radius,
            takeoffHeight: startNode.height,
            takeoffSizeX: startNode.sizeX,
            takeoffSizeY: startNode.sizeY,
            takeoffSizeZ: startNode.sizeZ,
            landingCx: newNode.cx,
            landingCy: newNode.cy,
            landingCz: newNode.cz,
            landingHitboxType: newNode.hitboxType,
            landingRadius: newNode.radius,
            landingHeight: newNode.height,
            landingSizeX: newNode.sizeX,
            landingSizeY: newNode.sizeY,
            landingSizeZ: newNode.sizeZ,
          };
          const normalizedArc = normalizeConstraintRecord(arc);
          return markDirty({
            ...s,
            constraints: [...s.constraints, normalizedArc],
            selectedConstraintId: normalizedArc.id,
            trainPendingNode: null,
          });
        }),
      );
    },
    finishJumpTrain() {
      setState((s) => {
        const groupId = s.trainPlacementGroupId;
        if (!groupId) return s;
        const arcs = getTrainGroupArcs(s.constraints, groupId);
        const base = {
          ...s,
          trainPlacementGroupId: null,
          trainPendingNode: null,
          placementArmed: false,
          placementTarget: "center",
          toolMode: "select",
        };
        if (!arcs.length) return base;
        return markDirty(base);
      });
    },
    updateTrainNode(idOrGroup, nodeIndex, patch) {
      setState((s) =>
        withHistory(s, () => {
          const arcs = getTrainGroupArcs(s.constraints, idOrGroup);
          if (!arcs.length) return s;
          const maxNodeIndex = arcs.length;
          if (nodeIndex < 0 || nodeIndex > maxNodeIndex) return s;
          const byId = new Map(s.constraints.map((r) => [r.id, r]));
          if (nodeIndex === 0) {
            byId.set(arcs[0].id, patchArcNodeSide(arcs[0], "takeoff", patch));
          } else if (nodeIndex === maxNodeIndex) {
            const lastArc = arcs[arcs.length - 1];
            byId.set(lastArc.id, patchArcNodeSide(lastArc, "landing", patch));
          } else {
            const prevArc = arcs[nodeIndex - 1];
            const nextArc = arcs[nodeIndex];
            byId.set(prevArc.id, patchArcNodeSide(prevArc, "landing", patch));
            byId.set(nextArc.id, patchArcNodeSide(nextArc, "takeoff", patch));
          }
          return {
            ...s,
            constraints: s.constraints.map((r) => byId.get(r.id) || r),
          };
        }),
      );
    },
    updateTrainArcParams(idOrGroup, arcIndex, patch) {
      setState((s) =>
        withHistory(s, () => {
          const arcs = getTrainGroupArcs(s.constraints, idOrGroup);
          if (!arcs.length || arcIndex < 0 || arcIndex >= arcs.length) return s;
          const target = arcs[arcIndex];
          const updated = normalizeConstraintRecord({
            ...target,
            constraint: {
              ...target.constraint,
              ...(patch.jumpYVel != null
                ? { jumpYVel: Number(patch.jumpYVel) }
                : {}),
            },
          });
          return {
            ...s,
            constraints: s.constraints.map((r) =>
              r.id === target.id ? updated : r,
            ),
          };
        }),
      );
    },
    removeTrainNode(idOrGroup, nodeIndex) {
      setState((s) =>
        withHistory(s, () => {
          const arcs = getTrainGroupArcs(s.constraints, idOrGroup);
          if (!arcs.length) return s;
          const nodeCount = arcs.length + 1;
          if (nodeIndex < 0 || nodeIndex >= nodeCount) return s;
          const removeIds = new Set();
          const byId = new Map();
          if (arcs.length === 1) {
            removeIds.add(arcs[0].id);
          } else if (nodeIndex === 0) {
            removeIds.add(arcs[0].id);
          } else if (nodeIndex === nodeCount - 1) {
            removeIds.add(arcs[arcs.length - 1].id);
          } else {
            const prevArc = arcs[nodeIndex - 1];
            const nextArc = arcs[nodeIndex];
            const patchedPrev = normalizeConstraintRecord({
              ...prevArc,
              constraint: {
                ...prevArc.constraint,
                landingCx: nextArc.constraint.takeoffCx,
                landingCy: nextArc.constraint.takeoffCy,
                landingCz: nextArc.constraint.takeoffCz,
                landingHitboxType: nextArc.constraint.takeoffHitboxType,
                landingRadius: nextArc.constraint.takeoffRadius,
                landingHeight: nextArc.constraint.takeoffHeight,
                landingSizeX: nextArc.constraint.takeoffSizeX,
                landingSizeY: nextArc.constraint.takeoffSizeY,
                landingSizeZ: nextArc.constraint.takeoffSizeZ,
              },
            });
            byId.set(prevArc.id, patchedPrev);
            removeIds.add(nextArc.id);
          }
          let nextConstraints = s.constraints
            .filter((r) => !removeIds.has(r.id))
            .map((r) => byId.get(r.id) || r);
          const groupId = arcs[0].constraint.trainGroupId;
          nextConstraints = normalizeTrainGroupIndices(
            nextConstraints,
            groupId,
          );
          const selectedStillExists = nextConstraints.some(
            (r) => r.id === s.selectedConstraintId,
          );
          return {
            ...s,
            constraints: nextConstraints,
            selectedConstraintId: selectedStillExists
              ? s.selectedConstraintId
              : null,
          };
        }),
      );
    },
    getTrainGroupView(idOrGroup) {
      const groupId =
        resolveTrainGroupId(state.constraints, idOrGroup) || idOrGroup;
      const pending =
        groupId && state.trainPlacementGroupId === groupId
          ? state.trainPendingNode
          : null;
      return getTrainGroupViewFromConstraints(
        state.constraints,
        idOrGroup,
        pending,
      );
    },
  };

  return actions;
}
