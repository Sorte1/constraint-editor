<script>
    import { onDestroy } from "svelte";
    import {
        CONSTRAINT_TYPES,
        HITBOX_TYPES,
        REQUIRED_STATES,
    } from "../constraints.js";
    import {
        exportConstraintDocument,
        importConstraintsFromFile,
        serializeConstraintDocument,
    } from "../import_export.js";
    export let store;
    export let onClose;

    let state = store.getState();
    const unsubscribe = store.subscribe((next) => {
        state = next;
    });
    onDestroy(() => {
        unsubscribe();
        if (autoImportRetryTimer) {
            clearTimeout(autoImportRetryTimer);
            autoImportRetryTimer = null;
        }
    });

    const NUMERIC_FIELDS = new Set([
        "cx",
        "cy",
        "cz",
        "nx",
        "ny",
        "nz",
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
    ]);
    const SEGMENT_HITBOX_TYPES = ["sphere", "cylinder", "box"];
    let editLabel = "";
    let editType = "HardCheckpoint";
    let editConstraint = {};
    let jsonText = "";
    let newType = "HardCheckpoint";
    let draggingId = null;
    let dragOverId = null;
    let copyFeedback = false;
    let syncedId = null;
    let syncedConstraintRef = null;
    let autoImportedMapRef = null;
    let autoImportRetryTimer = null;

    function isTrainArcRecord(record) {
        return (
            record?.constraint?.type === "JumpArc" &&
            typeof record?.constraint?.trainGroupId === "string" &&
            record.constraint.trainGroupId.length > 0
        );
    }

    const TYPE_COLORS = {
        HardCheckpoint: "#58a6ff",
        SoftCheckpoint: "#79c0ff",
        PlaneCheckpoint: "#56d364",
        LineSegment: "#3fb950",
        Corridor: "#26a641",
        JumpArc: "#f0883e",
        JumpTrain: "#ff9933",
        TakeoffZone: "#ffa657",
        LandingZone: "#ffb77c",
        AirborneSegment: "#d2a8ff",
        LookDirection: "#bc8cff",
        LookRange: "#a371f7",
        SpeedWindow: "#f2cc60",
        VelocityDirection: "#e3b341",
        TurnConstraint: "#d29922",
        StateCheckpoint: "#ff7b72",
    };

    const TYPE_ICONS = {
        HardCheckpoint: "◎",
        SoftCheckpoint: "○",
        PlaneCheckpoint: "▱",
        LineSegment: "╱",
        Corridor: "⟺",
        JumpArc: "⌒",
        JumpTrain: "⛓",
        TakeoffZone: "⬆",
        LandingZone: "⬇",
        AirborneSegment: "〜",
        LookDirection: "➤",
        LookRange: "⌖",
        SpeedWindow: "⚡",
        VelocityDirection: "↗",
        TurnConstraint: "↻",
        StateCheckpoint: "◈",
    };

    $: selected =
        state.constraints.find((r) => r.id === state.selectedConstraintId) ||
        null;
    $: selectedTrainGroupId = isTrainArcRecord(selected)
        ? selected.constraint.trainGroupId
        : (state.trainPlacementGroupId || null);
    $: selectedTrainGroup = selectedTrainGroupId
        ? store.getTrainGroupView(selectedTrainGroupId)
        : null;
    $: trainEditorTargetId = selectedTrainGroupId || selected?.id || null;
    $: currentMapRef = state.editorIntegration.mapRef || "unknown-map";
    $: if (state.ui.activeTab === "list")
        store.setUiState({ activeTab: "edit" });
    $: selectedType = selectedTrainGroup || selected?.constraint?.type === "JumpTrain"
        ? "JumpTrain"
        : (editType || selected?.constraint?.type || "HardCheckpoint");
    $: isSegmentType =
        selectedType === "LineSegment" ||
        selectedType === "Corridor" ||
        selectedType === "AirborneSegment";
    $: isAirborneSegment = selectedType === "AirborneSegment";
    $: usesSingleZone =
        selectedType === "HardCheckpoint" ||
        selectedType === "SoftCheckpoint" ||
        selectedType === "TakeoffZone" ||
        selectedType === "LandingZone" ||
        selectedType === "PlaneCheckpoint";
    $: usesDirection =
        selectedType === "PlaneCheckpoint" ||
        selectedType === "LookDirection" ||
        selectedType === "LookRange" ||
        selectedType === "VelocityDirection";
    $: usesJumpArc = selectedType === "JumpArc";
    $: usesJumpTrain =
        Boolean(selectedTrainGroup) || selected?.constraint?.type === "JumpTrain";
    $: showSpeedWindow = selectedType === "SpeedWindow";
    $: showTurn = selectedType === "TurnConstraint";
    $: showState = selectedType === "StateCheckpoint";
    $: showLookDirection = selectedType === "LookDirection";
    $: showLookRange = selectedType === "LookRange";
    $: showVelocityDirection = selectedType === "VelocityDirection";

    $: if (selected?.id !== syncedId) {
        syncedId = selected?.id ?? null;
        editLabel = selected?.label ?? "";
        if (selectedTrainGroup) {
            editType = "JumpTrain";
            editConstraint = {
                nodes: selectedTrainGroup.nodes,
                arcParams: selectedTrainGroup.arcParams,
                trainGroupId: selectedTrainGroup.groupId,
            };
        } else {
            editType = selected?.constraint.type ?? "HardCheckpoint";
            editConstraint = { ...(selected?.constraint || {}) };
        }
        syncedConstraintRef = selected?.constraint || null;
    }

    $: if (
        selected &&
        selected.id === syncedId &&
        selected.constraint &&
        selected.constraint !== syncedConstraintRef
    ) {
        syncedConstraintRef = selected.constraint;
        editLabel = selected.label ?? "";
        if (selectedTrainGroup) {
            editType = "JumpTrain";
            editConstraint = {
                nodes: selectedTrainGroup.nodes,
                arcParams: selectedTrainGroup.arcParams,
                trainGroupId: selectedTrainGroup.groupId,
            };
        } else {
            editType = selected.constraint.type ?? "HardCheckpoint";
            editConstraint = { ...selected.constraint };
        }
    }

    $: if (selectedTrainGroup && selected?.id === syncedId) {
        editType = "JumpTrain";
        editConstraint = {
            nodes: selectedTrainGroup.nodes,
            arcParams: selectedTrainGroup.arcParams,
            trainGroupId: selectedTrainGroup.groupId,
        };
    }

    $: baseConstraintsVisible = state.constraints
        .map((record, index) => ({ ...record, _listIndex: index }))
        .filter(
            (record) =>
                record?.constraint?.type !== "JumpArc" &&
                record?.constraint?.type !== "JumpTrain",
        );
    $: constraintIndexById = new Map(
        state.constraints.map((record, index) => [record.id, index]),
    );
    $: trainGroupsVisible = (() => {
        const groups = new Map();
        state.constraints.forEach((record, index) => {
            if (!isTrainArcRecord(record)) return;
            const groupId = record.constraint.trainGroupId;
            const existing = groups.get(groupId) || {
                id: groupId,
                label: "Jump Train",
                enabled: false,
                arcCount: 0,
                _listIndex: index,
            };
            existing.arcCount += 1;
            existing.enabled = existing.enabled || !!record.enabled;
            existing._listIndex = Math.min(existing._listIndex, index);
            groups.set(groupId, existing);
        });
        if (
            state.trainPlacementGroupId &&
            !groups.has(state.trainPlacementGroupId)
        ) {
            groups.set(state.trainPlacementGroupId, {
                id: state.trainPlacementGroupId,
                label: "Jump Train (new)",
                enabled: true,
                arcCount: 0,
                _listIndex: state.constraints.length + 0.5,
            });
        }
        return [...groups.values()].map((group) => {
            const view = store.getTrainGroupView(group.id);
            return {
                id: group.id,
                label:
                    group.arcCount > 0
                        ? `Jump Train (${group.arcCount} arc${group.arcCount === 1 ? "" : "s"})`
                        : group.label,
                enabled: group.enabled,
                constraint: { type: "JumpTrain" },
                isVirtualTrainGroup: true,
                arcIds: view?.arcIds || [],
                _listIndex: group._listIndex,
            };
        });
    })();
    $: trainArcRows = trainGroupsVisible.flatMap((group) =>
        (group.arcIds || []).map((arcId, idx) => ({
            id: `${group.id}::arc::${idx}`,
            label: `Arc ${idx + 1}`,
            enabled: state.constraints.find((c) => c.id === arcId)?.enabled ?? true,
            constraint: { type: "JumpArc" },
            isVirtualTrainArc: true,
            isVirtualTrainGroup: false,
            groupId: group.id,
            targetConstraintId: arcId,
            _listIndex: (constraintIndexById.get(arcId) ?? (group._listIndex + idx)) + 0.001,
        })),
    );
    $: constraintsVisible = [
        ...baseConstraintsVisible,
        ...trainGroupsVisible.map((group) => ({
            ...group,
            _listIndex: (group._listIndex ?? 0) - 0.001,
        })),
        ...trainArcRows,
    ].sort((a, b) => (a._listIndex ?? 0) - (b._listIndex ?? 0));
    $: constraintsFiltered = constraintsVisible.filter((record) => {
        const q = (state.ui.listFilter || "").toLowerCase().trim();
        if (!q) return true;
        return (
            record.label.toLowerCase().includes(q) ||
            record.constraint.type.toLowerCase().includes(q)
        );
    });

    $: visibleCount = baseConstraintsVisible.length + trainGroupsVisible.length;
    $: enabledCount =
        baseConstraintsVisible.filter((r) => r.enabled).length +
        trainGroupsVisible.filter((r) => r.enabled).length;
    $: disabledCount = visibleCount - enabledCount;

    function switchTab(tab) {
        store.setUiState({ activeTab: tab });
    }

    function addConstraint(type) {
        const record = store.addConstraint(type || newType);
        store.selectConstraint(record.id);
        store.setPlacementTarget("center");
        store.setPlacementArmed(true);
        store.setToolMode("place");
    }

    function startJumpTrainMode() {
        store.startJumpTrain();
        onClose?.();
    }

    function beginRaycastPlacement(target = "center") {
        if (target === "trainNode") {
            if (!state.trainPlacementGroupId) {
                store.startJumpTrain();
            }
            store.setPlacementTarget("trainNode");
            store.setPlacementArmed(true);
            store.setToolMode("place");
            onClose?.();
            return;
        }
        if (!state.selectedConstraintId) {
            const created = store.addConstraint(newType || "HardCheckpoint");
            store.selectConstraint(created.id);
        }
        store.setPlacementTarget(target);
        store.setPlacementArmed(true);
        store.setToolMode("place");
        onClose?.();
    }

    function sanitizeConstraint(next) {
        const out = { ...next };
        for (const key of Object.keys(out)) {
            if (!NUMERIC_FIELDS.has(key)) {
                continue;
            }
            const n = Number(out[key]);
            out[key] = Number.isFinite(n) ? n : 0;
        }
        return out;
    }

    function commitLiveConstraint(nextLabel, nextType, nextConstraint) {
        if (!selected || usesJumpTrain) {
            return;
        }
        const constraint = sanitizeConstraint({
            ...(nextConstraint || editConstraint),
            type: nextType ?? editType,
        });
        store.updateConstraintLive(selected.id, {
            label: (nextLabel ?? editLabel) || "Constraint",
            enabled: selected.enabled,
            constraint,
        });
    }

    function updateEditField(key, value) {
        const nextConstraint = {
            ...editConstraint,
            [key]: value,
        };
        editConstraint = nextConstraint;
        commitLiveConstraint(editLabel, editType, nextConstraint);
    }

    function updateEditLabel(value) {
        editLabel = value;
        commitLiveConstraint(value, editType, editConstraint);
    }

    function updateEditType(value) {
        editType = value;
        commitLiveConstraint(editLabel, value, editConstraint);
    }

    function applySelected() {
        if (!selected || usesJumpTrain) return;
        const constraint = sanitizeConstraint({
            ...editConstraint,
            type: editType,
        });
        store.updateConstraint(selected.id, {
            label: editLabel || "Constraint",
            enabled: selected.enabled,
            constraint,
        });
    }

    function updateMapImportText(value) {
        store.setUiState({ mapImportText: value });
    }

    function normalizeMapImportPayload(rawPayload) {
        const raw = String(rawPayload || "").trim();
        if (!raw) {
            return null;
        }
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed === "string") {
                return parsed;
            }
            if (
                parsed &&
                typeof parsed === "object" &&
                "constraints" in parsed &&
                !("objects" in parsed || "spawns" in parsed)
            ) {
                return { error: "That looks like constraints JSON, not map JSON." };
            }
            return JSON.stringify(parsed);
        } catch (_) {
            return raw;
        }
    }

    function toggleEnabled() {
        if (!selected) return;
        store.updateConstraint(selected.id, { enabled: !selected.enabled });
    }

    async function copyJson() {
        const json = serializeConstraintDocument({
            mapRef: state.editorIntegration.mapRef,
            constraints: state.constraints,
            savedPositions: state.savedPositions,
            visuals: state.visuals,
            ui: state.ui,
            selectedConstraintId: state.selectedConstraintId,
        });
        jsonText = json;
        try {
            await navigator.clipboard.writeText(json);
        } catch (_) {}
        copyFeedback = true;
        setTimeout(() => (copyFeedback = false), 1400);
    }

    function loadJsonText() {
        const raw = jsonText.trim();
        if (!raw) return;
        try {
            store.importDocument(JSON.parse(raw));
        } catch (err) {
            alert(`Invalid JSON: ${err.message}`);
        }
    }

    async function onImportFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const imported = await importConstraintsFromFile(file);
            store.importDocument(imported);
            jsonText = serializeConstraintDocument(imported);
        } catch (err) {
            alert(`Import failed: ${err.message}`);
        } finally {
            event.target.value = "";
        }
    }

    function runMapAutoImport({ silent = false } = {}) {
        const normalized = normalizeMapImportPayload(state.ui.mapImportText);
        if (!normalized) {
            return;
        }
        if (typeof normalized === "object" && normalized.error) {
            if (!silent) {
                alert(normalized.error);
            }
            return;
        }
        const payload = String(normalized);
        const globalObj = window.global;
        if (typeof globalObj?.importMap !== "function") {
            if (!silent) {
                alert("window.global.importMap() is not available right now.");
            }
            return;
        }
        try {
            globalObj.importMap(payload);
        } catch (err) {
            if (!silent) {
                alert(`window.global.importMap() failed: ${err?.message || err}`);
            }
        }
    }

    function tryAutoRunImport(attempt = 0) {
        const payload = String(state.ui.mapImportText || "").trim();
        if (!payload) {
            return;
        }
        const globalObj = window.global;
        if (typeof globalObj?.importMap === "function") {
            runMapAutoImport({ silent: true });
            return;
        }
        if (attempt >= 24) {
            return;
        }
        autoImportRetryTimer = setTimeout(
            () => tryAutoRunImport(attempt + 1),
            250,
        );
    }

    $: if (
        currentMapRef &&
        currentMapRef !== autoImportedMapRef &&
        String(state.ui.mapImportText || "").trim()
    ) {
        autoImportedMapRef = currentMapRef;
        if (autoImportRetryTimer) {
            clearTimeout(autoImportRetryTimer);
            autoImportRetryTimer = null;
        }
        tryAutoRunImport(0);
    }

    function onMapImportKeydown(event) {
        if (event.key !== "Enter") {
            return;
        }
        if (event.ctrlKey || event.metaKey || !event.shiftKey) {
            event.preventDefault();
            runMapAutoImport();
        }
    }

    function useCursor() {
        if (!selected || !state.viewportCursor) return;
        updateEditField("cx", state.viewportCursor.point.x);
        updateEditField("cy", state.viewportCursor.point.y);
        updateEditField("cz", state.viewportCursor.point.z);
        updateEditField("nx", state.viewportCursor.normal.x);
        updateEditField("ny", state.viewportCursor.normal.y);
        updateEditField("nz", state.viewportCursor.normal.z);
    }

    function nudge(x, y, z) {
        store.nudgeSelected({ x, y, z });
    }

    function onDragStart(event, id) {
        draggingId = id;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", id);
    }
    function onDragOver(event, id) {
        event.preventDefault();
        dragOverId = id;
    }
    function onDropOnItem(event, targetRecord) {
        event.preventDefault();
        const id = draggingId || event.dataTransfer.getData("text/plain");
        const targetId = targetRecord?.targetConstraintId || targetRecord?.id;
        if (!id || !targetId || id === targetId) {
            draggingId = dragOverId = null;
            return;
        }
        const from = state.constraints.findIndex((c) => c.id === id);
        const target = state.constraints.findIndex((c) => c.id === targetId);
        if (from < 0 || target < 0) {
            draggingId = dragOverId = null;
            return;
        }
        store.moveConstraintToIndex(id, from < target ? target - 1 : target);
        draggingId = dragOverId = null;
    }
    function onDropToEnd(event) {
        event.preventDefault();
        const id = draggingId || event.dataTransfer.getData("text/plain");
        if (!id) {
            draggingId = dragOverId = null;
            return;
        }
        store.moveConstraintToIndex(id, state.constraints.length - 1);
        draggingId = dragOverId = null;
    }

    function selectListItem(record) {
        if (record?.isVirtualTrainGroup) {
            const group = store.getTrainGroupView(record.id);
            const firstArcId = group?.arcIds?.[0] || null;
            store.selectConstraint(firstArcId);
            return;
        }
        if (record?.isVirtualTrainArc && record?.targetConstraintId) {
            store.selectConstraint(record.targetConstraintId);
            return;
        }
        store.selectConstraint(record.id);
    }

    function typeColor(type) {
        return TYPE_COLORS[type] || "#8b949e";
    }
    function typeIcon(type) {
        return TYPE_ICONS[type] || "·";
    }

    function fmt(v, d = 2) {
        return Number(v).toFixed(d);
    }
</script>

<div class="shell">
    <aside class="rail">
        <div class="rail-head">
            <div class="rail-head-top">
                <span class="logo-mark">⬡</span>
                <span class="logo-text">CONSTRAINT RACK</span>
                <button class="close-btn" on:click={onClose} title="Close (Esc)"
                    >✕</button
                >
            </div>
            <div class="map-badge">
                <span
                    class="map-dot"
                    class:ready={state.editorIntegration.sceneReady}
                ></span>
                <span class="map-name"
                    >{state.editorIntegration.mapRef || "unknown-map"}</span
                >
                <span class="map-mode">{state.toolMode}</span>
            </div>
        </div>

        <div class="rail-toolbar">
            <div class="add-row">
                <select class="type-select" bind:value={newType}>
                    {#each CONSTRAINT_TYPES as type}
                        <option value={type}>{typeIcon(type)} {type}</option>
                    {/each}
                </select>
                <button
                    class="btn btn-add"
                    on:click={() => addConstraint(newType)}
                    title="Add constraint (A)"
                >
                    + Add
                </button>
            </div>
            <button
                class="btn btn-train"
                class:armed={!!state.trainPlacementGroupId}
                on:click={startJumpTrainMode}
                title="Start Jump Train — click nodes on map (Enter/Esc to finish)"
            >
                {#if state.trainPlacementGroupId}
                    <span class="pulse-dot"></span> Building train… Enter/Esc to finish
                {:else}
                    ⛓ New Jump Train
                {/if}
            </button>
            <button
                class="btn btn-raycast"
                class:armed={state.placementArmed}
                on:click={beginRaycastPlacement}
                title="Click map to place (Esc to cancel)"
            >
                {#if state.placementArmed}
                    <span class="pulse-dot"></span> Raycast armed — click map
                {:else}
                    ⊕ Raycast Set Position
                {/if}
            </button>
            <input
                class="search-input"
                placeholder="Filter constraints…"
                value={state.ui.listFilter || ""}
                on:input={(e) =>
                    store.setUiState({ listFilter: e.currentTarget.value })}
            />
        </div>

        <div class="stats-bar">
            <span class="stat">{visibleCount} total</span>
            <span class="stat stat-on">{enabledCount} on</span>
            {#if disabledCount > 0}<span class="stat stat-off"
                    >{disabledCount} off</span
                >{/if}
        </div>

        <div class="clist">
            {#each constraintsFiltered as record, index (record.id)}
                <button
                    draggable={!record.isVirtualTrainGroup && !record.isVirtualTrainArc}
                    class="citem"
                    class:train-child={record.isVirtualTrainArc}
                    class:selected={record.isVirtualTrainGroup
                        ? selectedTrainGroupId === record.id
                        : record.isVirtualTrainArc
                        ? record.targetConstraintId === state.selectedConstraintId
                        : record.id === state.selectedConstraintId}
                    class:disabled={!record.enabled}
                    class:dragover={dragOverId === record.id}
                    style="--tc: {typeColor(record.constraint.type)}"
                    on:dragstart={(e) =>
                        !record.isVirtualTrainGroup &&
                        !record.isVirtualTrainArc &&
                        onDragStart(e, record.id)}
                    on:dragover={(e) =>
                        !record.isVirtualTrainGroup && onDragOver(e, record.id)}
                    on:drop={(e) =>
                        !record.isVirtualTrainGroup && onDropOnItem(e, record)}
                    on:dragend={() => {
                        draggingId = null;
                        dragOverId = null;
                    }}
                    on:click={() => selectListItem(record)}
                >
                    <span class="citem-accent"></span>
                    <span class="citem-num">{index + 1}</span>
                    <span
                        class="citem-icon"
                        style="color: {typeColor(record.constraint.type)}"
                        >{typeIcon(record.constraint.type)}</span
                    >
                    <span class="citem-body">
                        <span class="citem-label"
                            >{record.label || "Unnamed"}</span
                        >
                        <span class="citem-type">{record.constraint.type}</span>
                    </span>
                    {#if !record.enabled}
                        <span class="citem-badge off">OFF</span>
                    {:else if record.isVirtualTrainGroup
                        ? selectedTrainGroupId === record.id
                        : record.isVirtualTrainArc
                        ? record.targetConstraintId === state.selectedConstraintId
                        : record.id === state.selectedConstraintId}
                        <span class="citem-badge sel">SEL</span>
                    {/if}
                    <span class="citem-handle" title="Drag to reorder"
                        >{record.isVirtualTrainGroup || record.isVirtualTrainArc
                            ? ""
                            : "⠿"}</span
                    >
                </button>
            {/each}
            {#if constraintsFiltered.length === 0}
                <div class="clist-empty">
                    {visibleCount === 0
                        ? "No constraints yet. Add one above."
                        : "No matches."}
                </div>
            {/if}
            <div
                class="drop-zone"
                role="button"
                tabindex="-1"
                on:dragover|preventDefault
                on:drop={onDropToEnd}
            >
                ↓ drop to move to end
            </div>
        </div>
    </aside>

    <section class="main">
        <nav class="tabs">
            {#each [["edit", "Edit"], ["visuals", "Visuals"], ["positions", "Positions"], ["io", "Import/Export"]] as [id, label]}
                <button
                    class="tab"
                    class:active={state.ui.activeTab === id}
                    on:click={() => switchTab(id)}>{label}</button
                >
            {/each}
            <div class="tabs-spacer"></div>
            <div class="undo-redo">
                <button
                    class="btn btn-icon"
                    on:click={() => store.undo()}
                    title="Undo (Ctrl+Z)">↩</button
                >
                <button
                    class="btn btn-icon"
                    on:click={() => store.redo()}
                    title="Redo (Ctrl+Y)">↪</button
                >
            </div>
        </nav>

        <div class="tab-body">
            {#if state.ui.activeTab === "edit"}
                {#if selected}
                    <div class="pane">
                        <div
                            class="constraint-titlebar"
                            style="--tc: {typeColor(selectedType)}"
                        >
                            <span class="ct-icon"
                                >{typeIcon(selectedType)}</span
                            >
                            <span class="ct-type"
                                >{selectedType}</span
                            >
                            <span class="ct-spacer"></span>
                            <button
                                class="btn btn-toggle"
                                class:enabled={selected.enabled}
                                on:click={toggleEnabled}
                                >{selected.enabled
                                    ? "Enabled"
                                    : "Disabled"}</button
                            >
                            <button
                                class="btn btn-sm"
                                on:click={() =>
                                    store.duplicateConstraint(selected.id)}
                                title="Duplicate (Ctrl+D)">⧉ Dupe</button
                            >
                            <button
                                class="btn btn-danger btn-sm"
                                on:click={() =>
                                    store.deleteConstraint(selected.id)}
                                title="Delete (Del)">✕ Del</button
                            >
                        </div>

                        <div class="field-group">
                            <div class="field-label">Label</div>
                            <div class="row gap-8">
                                <input
                                    class="input grow"
                                    value={editLabel}
                                    on:input={(e) =>
                                        updateEditLabel(e.currentTarget.value)}
                                    placeholder="Constraint label"
                                />
                            </div>
                        </div>

                        {#if !usesJumpTrain && selectedType !== "JumpArc"}
                            <div class="field-group">
                                <div class="field-label">Type</div>
                                <select
                                    class="input"
                                    value={editType}
                                    on:change={(e) =>
                                        updateEditType(e.currentTarget.value)}
                                >
                                    {#each CONSTRAINT_TYPES as type}
                                        <option value={type}
                                            >{typeIcon(type)} {type}</option
                                        >
                                    {/each}
                                </select>
                            </div>
                        {/if}

                        {#if !usesJumpTrain}
                        <div class="field-group">
                            <div class="field-row-header">
                                <div class="field-label">Position</div>
                                <div class="field-actions">
                                    <button
                                        class="btn btn-xs btn-accent"
                                        on:click={() =>
                                            beginRaycastPlacement("center")}
                                        >↖ Raycast Pick</button
                                    >
                                </div>
                            </div>
                            <div class="xyz-grid">
                                <div class="xyz-field">
                                    <span class="xyz-axis x">X</span>
                                    <input
                                        class="input mono"
                                        type="number"
                                        step="any"
                                        value={editConstraint.cx ?? 0}
                                        on:input={(e) =>
                                            updateEditField(
                                                "cx",
                                                e.currentTarget.value,
                                            )}
                                    />
                                </div>
                                <div class="xyz-field">
                                    <span class="xyz-axis y">Y</span>
                                    <input
                                        class="input mono"
                                        type="number"
                                        step="any"
                                        value={editConstraint.cy ?? 0}
                                        on:input={(e) =>
                                            updateEditField(
                                                "cy",
                                                e.currentTarget.value,
                                            )}
                                    />
                                </div>
                                <div class="xyz-field">
                                    <span class="xyz-axis z">Z</span>
                                    <input
                                        class="input mono"
                                        type="number"
                                        step="any"
                                        value={editConstraint.cz ?? 0}
                                        on:input={(e) =>
                                            updateEditField(
                                                "cz",
                                                e.currentTarget.value,
                                            )}
                                    />
                                </div>
                            </div>
                        </div>
                        {/if}

                        {#if usesDirection}
                            <div class="field-group">
                                <div class="field-label">Direction Normal</div>
                                <div class="xyz-grid">
                                    <div class="xyz-field">
                                        <span class="xyz-axis x">X</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.nx ?? 0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "nx",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                    <div class="xyz-field">
                                        <span class="xyz-axis y">Y</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.ny ?? 1}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "ny",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                    <div class="xyz-field">
                                        <span class="xyz-axis z">Z</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.nz ?? 0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "nz",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                </div>
                            </div>
                        {/if}

                        {#if usesSingleZone}
                            <div class="field-group">
                                <div class="field-label">Hitbox</div>
                                <div class="row gap-8">
                                    <select
                                        class="input"
                                        value={editConstraint.hitboxType ||
                                            "sphere"}
                                        on:change={(e) =>
                                            updateEditField(
                                                "hitboxType",
                                                e.currentTarget.value,
                                            )}
                                    >
                                        {#each HITBOX_TYPES as shape}
                                            <option value={shape}
                                                >{shape}</option
                                            >
                                        {/each}
                                    </select>
                                </div>
                                {#if (editConstraint.hitboxType || "sphere") === "sphere" || (editConstraint.hitboxType || "sphere") === "circle"}
                                    <div class="row gap-8 align-center">
                                        <input
                                            class="input mono grow"
                                            type="number"
                                            step="any"
                                            min="0"
                                            value={editConstraint.radius ?? 8}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "radius",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                        <span class="dim-note">radius</span>
                                    </div>
                                {:else if (editConstraint.hitboxType || "sphere") === "cylinder"}
                                    <div class="xyz-grid">
                                        <div class="xyz-field">
                                            <span class="xyz-axis z"
                                                >Radius</span
                                            >
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0"
                                                value={editConstraint.radius ??
                                                    8}
                                                on:input={(e) =>
                                                    updateEditField(
                                                        "radius",
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                        </div>
                                        <div class="xyz-field">
                                            <span class="xyz-axis y"
                                                >Height</span
                                            >
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0"
                                                value={editConstraint.height ??
                                                    6}
                                                on:input={(e) =>
                                                    updateEditField(
                                                        "height",
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                        </div>
                                    </div>
                                {:else}
                                    <div class="field-actions">
                                        <button
                                            class="btn btn-xs btn-accent"
                                            on:click={() =>
                                                beginRaycastPlacement("size")}
                                            >Pick Box Size</button
                                        >
                                    </div>
                                    <div class="xyz-grid">
                                        <div class="xyz-field">
                                            <span class="xyz-axis x"
                                                >Size X</span
                                            >
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0"
                                                value={editConstraint.sizeX ??
                                                    8}
                                                on:input={(e) =>
                                                    updateEditField(
                                                        "sizeX",
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                        </div>
                                        <div class="xyz-field">
                                            <span class="xyz-axis y"
                                                >Size Y</span
                                            >
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0"
                                                value={editConstraint.sizeY ??
                                                    8}
                                                on:input={(e) =>
                                                    updateEditField(
                                                        "sizeY",
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                        </div>
                                        <div class="xyz-field">
                                            <span class="xyz-axis z"
                                                >Size Z</span
                                            >
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0"
                                                value={editConstraint.sizeZ ??
                                                    8}
                                                on:input={(e) =>
                                                    updateEditField(
                                                        "sizeZ",
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/if}

                        {#if isSegmentType}
                            <div class="field-group">
                                <div class="field-row-header">
                                    <div class="field-label">Segment Start</div>
                                    <div class="field-actions">
                                        <button
                                            class="btn btn-xs btn-accent"
                                            on:click={() =>
                                                beginRaycastPlacement("start")}
                                            >Pick Start</button
                                        >
                                    </div>
                                </div>
                                <div class="xyz-grid">
                                    <div class="xyz-field">
                                        <span class="xyz-axis x">X</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.ax ?? 0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "ax",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                    <div class="xyz-field">
                                        <span class="xyz-axis y">Y</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.ay ?? 0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "ay",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                    <div class="xyz-field">
                                        <span class="xyz-axis z">Z</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.az ?? 0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "az",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div class="field-group">
                                <div class="field-row-header">
                                    <div class="field-label">Segment End</div>
                                    <div class="field-actions">
                                        <button
                                            class="btn btn-xs btn-accent"
                                            on:click={() =>
                                                beginRaycastPlacement("end")}
                                            >Pick End</button
                                        >
                                    </div>
                                </div>
                                <div class="xyz-grid">
                                    <div class="xyz-field">
                                        <span class="xyz-axis x">X</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.bx ?? 0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "bx",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                    <div class="xyz-field">
                                        <span class="xyz-axis y">Y</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.by ?? 0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "by",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                    <div class="xyz-field">
                                        <span class="xyz-axis z">Z</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.bz ?? 0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "bz",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                </div>
                                <div class="row gap-8">
                                    <select
                                        class="input"
                                        value={editConstraint.hitboxType ||
                                            "cylinder"}
                                        on:change={(e) =>
                                            updateEditField(
                                                "hitboxType",
                                                e.currentTarget.value,
                                            )}
                                    >
                                        {#each SEGMENT_HITBOX_TYPES as shape}
                                            <option value={shape}
                                                >{shape}</option
                                            >
                                        {/each}
                                    </select>
                                </div>
                                {#if (editConstraint.hitboxType || "cylinder") === "box"}
                                    {#if isAirborneSegment}
                                        <div class="dim-note">
                                            Airborne box uses start/end as opposite corners.
                                        </div>
                                    {:else}
                                        <div class="field-actions">
                                            <button
                                                class="btn btn-xs btn-accent"
                                                on:click={() =>
                                                    beginRaycastPlacement(
                                                        "segmentSize",
                                                    )}
                                                >Pick Box Size</button
                                            >
                                        </div>
                                        <div class="xyz-grid">
                                            <div class="xyz-field">
                                                <span class="xyz-axis x"
                                                    >Size X</span
                                                >
                                                <input
                                                    class="input mono"
                                                    type="number"
                                                    step="any"
                                                    min="0"
                                                    value={editConstraint.sizeX ??
                                                        8}
                                                    on:input={(e) =>
                                                        updateEditField(
                                                            "sizeX",
                                                            e.currentTarget.value,
                                                        )}
                                                />
                                            </div>
                                            <div class="xyz-field">
                                                <span class="xyz-axis y"
                                                    >Size Y</span
                                                >
                                                <input
                                                    class="input mono"
                                                    type="number"
                                                    step="any"
                                                    min="0"
                                                    value={editConstraint.sizeY ??
                                                        8}
                                                    on:input={(e) =>
                                                        updateEditField(
                                                            "sizeY",
                                                            e.currentTarget.value,
                                                        )}
                                                />
                                            </div>
                                            <div class="xyz-field">
                                                <span class="xyz-axis z"
                                                    >Size Z</span
                                                >
                                                <input
                                                    class="input mono"
                                                    type="number"
                                                    step="any"
                                                    min="0"
                                                    value={editConstraint.sizeZ ??
                                                        8}
                                                    on:input={(e) =>
                                                        updateEditField(
                                                            "sizeZ",
                                                            e.currentTarget.value,
                                                        )}
                                                />
                                            </div>
                                        </div>
                                    {/if}
                                {:else}
                                    <div class="row gap-8 align-center">
                                        <input
                                            class="input mono grow"
                                            type="number"
                                            step="any"
                                            min="0"
                                            value={editConstraint.radius ?? 8}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "radius",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                        <span class="dim-note"
                                            >thickness radius</span
                                        >
                                    </div>
                                {/if}
                            </div>
                        {/if}

                        {#if usesJumpArc}
                            <div class="field-group">
                                <div class="field-label">Jump Physics</div>
                                <div class="row gap-8 align-center">
                                    <input
                                        class="input mono grow"
                                        type="number"
                                        step="any"
                                        min="0.001"
                                        value={editConstraint.jumpYVel ?? 0.072}
                                        on:input={(e) =>
                                            updateEditField(
                                                "jumpYVel",
                                                e.currentTarget.value,
                                            )}
                                    />
                                    <span class="dim-note">jump y-vel</span>
                                </div>
                            </div>
                        {/if}

                        {#if usesJumpArc}
                            <div class="field-group">
                                <div class="field-row-header">
                                    <div class="field-label">
                                        JumpArc Takeoff
                                    </div>
                                    <div class="field-actions">
                                        <button
                                            class="btn btn-xs btn-accent"
                                            on:click={() =>
                                                beginRaycastPlacement(
                                                    "takeoff",
                                                )}>Pick Takeoff</button
                                        >
                                    </div>
                                </div>
                                <div class="xyz-grid">
                                    <div class="xyz-field">
                                        <span class="xyz-axis x">X</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.takeoffCx ??
                                                0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "takeoffCx",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                    <div class="xyz-field">
                                        <span class="xyz-axis y">Y</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.takeoffCy ??
                                                0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "takeoffCy",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                    <div class="xyz-field">
                                        <span class="xyz-axis z">Z</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.takeoffCz ??
                                                0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "takeoffCz",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                </div>
                                <div class="row gap-8">
                                    <select
                                        class="input"
                                        value={editConstraint.takeoffHitboxType ||
                                            "sphere"}
                                        on:change={(e) =>
                                            updateEditField(
                                                "takeoffHitboxType",
                                                e.currentTarget.value,
                                            )}
                                    >
                                        {#each HITBOX_TYPES as shape}
                                            <option value={shape}
                                                >{shape}</option
                                            >
                                        {/each}
                                    </select>
                                </div>
                                {#if (editConstraint.takeoffHitboxType || "sphere") === "sphere" || (editConstraint.takeoffHitboxType || "sphere") === "circle"}
                                    <div class="row gap-8 align-center">
                                        <input
                                            class="input mono grow"
                                            type="number"
                                            step="any"
                                            min="0"
                                            value={editConstraint.takeoffRadius ??
                                                8}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "takeoffRadius",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                        <span class="dim-note">radius</span>
                                    </div>
                                {:else if (editConstraint.takeoffHitboxType || "sphere") === "cylinder"}
                                    <div class="xyz-grid">
                                        <div class="xyz-field">
                                            <span class="xyz-axis z"
                                                >Radius</span
                                            >
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0"
                                                value={editConstraint.takeoffRadius ??
                                                    8}
                                                on:input={(e) =>
                                                    updateEditField(
                                                        "takeoffRadius",
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                        </div>
                                        <div class="xyz-field">
                                            <span class="xyz-axis y"
                                                >Height</span
                                            >
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0"
                                                value={editConstraint.takeoffHeight ??
                                                    6}
                                                on:input={(e) =>
                                                    updateEditField(
                                                        "takeoffHeight",
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                        </div>
                                    </div>
                                {:else}
                                    <div class="field-actions">
                                        <button
                                            class="btn btn-xs btn-accent"
                                            on:click={() =>
                                                beginRaycastPlacement(
                                                    "takeoffSize",
                                                )}
                                            >Pick Box Size</button
                                        >
                                    </div>
                                    <div class="xyz-grid">
                                        <div class="xyz-field">
                                            <span class="xyz-axis x"
                                                >Size X</span
                                            >
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0"
                                                value={editConstraint.takeoffSizeX ??
                                                    8}
                                                on:input={(e) =>
                                                    updateEditField(
                                                        "takeoffSizeX",
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                        </div>
                                        <div class="xyz-field">
                                            <span class="xyz-axis y"
                                                >Size Y</span
                                            >
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0"
                                                value={editConstraint.takeoffSizeY ??
                                                    8}
                                                on:input={(e) =>
                                                    updateEditField(
                                                        "takeoffSizeY",
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                        </div>
                                        <div class="xyz-field">
                                            <span class="xyz-axis z"
                                                >Size Z</span
                                            >
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0"
                                                value={editConstraint.takeoffSizeZ ??
                                                    8}
                                                on:input={(e) =>
                                                    updateEditField(
                                                        "takeoffSizeZ",
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                        </div>
                                    </div>
                                {/if}
                            </div>

                            <div class="field-group">
                                <div class="field-row-header">
                                    <div class="field-label">Takeoff Sample</div>
                                    <div class="field-actions">
                                        <button
                                            class="btn btn-xs"
                                            class:btn-accent={!(state.placementArmed && state.placementTarget === "takeoffSample")}
                                            class:btn-armed={state.placementArmed && state.placementTarget === "takeoffSample"}
                                            on:click={() => beginRaycastPlacement("takeoffSample")}
                                        >
                                            {#if state.placementArmed && state.placementTarget === "takeoffSample"}
                                                <span class="pulse-dot"></span> Click to lock in
                                            {:else}
                                                Sample Takeoff Spot
                                            {/if}
                                        </button>
                                        {#if Number.isFinite(editConstraint.takeoffSampleCx)}
                                            <button
                                                class="btn btn-xs btn-danger"
                                                on:click={() => {
                                                    store.updateConstraint(selected.id, { constraint: { takeoffSampleCx: null, takeoffSampleCy: null, takeoffSampleCz: null } });
                                                    editConstraint = { ...editConstraint, takeoffSampleCx: null, takeoffSampleCy: null, takeoffSampleCz: null };
                                                }}
                                            >Clear</button>
                                        {/if}
                                    </div>
                                </div>
                                {#if Number.isFinite(editConstraint.takeoffSampleCx)}
                                    <div class="xyz-grid">
                                        <div class="xyz-field">
                                            <span class="xyz-axis x">X</span>
                                            <input class="input mono" type="number" step="any" readonly value={editConstraint.takeoffSampleCx?.toFixed(2) ?? ""} />
                                        </div>
                                        <div class="xyz-field">
                                            <span class="xyz-axis y">Y</span>
                                            <input class="input mono" type="number" step="any" readonly value={editConstraint.takeoffSampleCy?.toFixed(2) ?? ""} />
                                        </div>
                                        <div class="xyz-field">
                                            <span class="xyz-axis z">Z</span>
                                            <input class="input mono" type="number" step="any" readonly value={editConstraint.takeoffSampleCz?.toFixed(2) ?? ""} />
                                        </div>
                                    </div>
                                {:else}
                                    <div class="dim-note">No sample — arc starts from takeoff zone center.</div>
                                {/if}
                            </div>

                            <div class="field-group">
                                <div class="field-row-header">
                                    <div class="field-label">
                                        JumpArc Landing
                                    </div>
                                    <div class="field-actions">
                                        <button
                                            class="btn btn-xs btn-accent"
                                            on:click={() =>
                                                beginRaycastPlacement(
                                                    "landing",
                                                )}>Pick Landing</button
                                        >
                                    </div>
                                </div>
                                <div class="xyz-grid">
                                    <div class="xyz-field">
                                        <span class="xyz-axis x">X</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.landingCx ??
                                                0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "landingCx",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                    <div class="xyz-field">
                                        <span class="xyz-axis y">Y</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.landingCy ??
                                                0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "landingCy",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                    <div class="xyz-field">
                                        <span class="xyz-axis z">Z</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.landingCz ??
                                                0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "landingCz",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                </div>
                                <div class="row gap-8">
                                    <select
                                        class="input"
                                        value={editConstraint.landingHitboxType ||
                                            "sphere"}
                                        on:change={(e) =>
                                            updateEditField(
                                                "landingHitboxType",
                                                e.currentTarget.value,
                                            )}
                                    >
                                        {#each HITBOX_TYPES as shape}
                                            <option value={shape}
                                                >{shape}</option
                                            >
                                        {/each}
                                    </select>
                                </div>
                                {#if (editConstraint.landingHitboxType || "sphere") === "sphere" || (editConstraint.landingHitboxType || "sphere") === "circle"}
                                    <div class="row gap-8 align-center">
                                        <input
                                            class="input mono grow"
                                            type="number"
                                            step="any"
                                            min="0"
                                            value={editConstraint.landingRadius ??
                                                8}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "landingRadius",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                        <span class="dim-note">radius</span>
                                    </div>
                                {:else if (editConstraint.landingHitboxType || "sphere") === "cylinder"}
                                    <div class="xyz-grid">
                                        <div class="xyz-field">
                                            <span class="xyz-axis z"
                                                >Radius</span
                                            >
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0"
                                                value={editConstraint.landingRadius ??
                                                    8}
                                                on:input={(e) =>
                                                    updateEditField(
                                                        "landingRadius",
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                        </div>
                                        <div class="xyz-field">
                                            <span class="xyz-axis y"
                                                >Height</span
                                            >
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0"
                                                value={editConstraint.landingHeight ??
                                                    6}
                                                on:input={(e) =>
                                                    updateEditField(
                                                        "landingHeight",
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                        </div>
                                    </div>
                                {:else}
                                    <div class="field-actions">
                                        <button
                                            class="btn btn-xs btn-accent"
                                            on:click={() =>
                                                beginRaycastPlacement(
                                                    "landingSize",
                                                )}
                                            >Pick Box Size</button
                                        >
                                    </div>
                                    <div class="xyz-grid">
                                        <div class="xyz-field">
                                            <span class="xyz-axis x"
                                                >Size X</span
                                            >
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0"
                                                value={editConstraint.landingSizeX ??
                                                    8}
                                                on:input={(e) =>
                                                    updateEditField(
                                                        "landingSizeX",
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                        </div>
                                        <div class="xyz-field">
                                            <span class="xyz-axis y"
                                                >Size Y</span
                                            >
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0"
                                                value={editConstraint.landingSizeY ??
                                                    8}
                                                on:input={(e) =>
                                                    updateEditField(
                                                        "landingSizeY",
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                        </div>
                                        <div class="xyz-field">
                                            <span class="xyz-axis z"
                                                >Size Z</span
                                            >
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0"
                                                value={editConstraint.landingSizeZ ??
                                                    8}
                                                on:input={(e) =>
                                                    updateEditField(
                                                        "landingSizeZ",
                                                        e.currentTarget.value,
                                                    )}
                                            />
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/if}

                        {#if usesJumpTrain}
                            <div class="field-group">
                                <div class="field-row-header">
                                    <div class="field-label">
                                        Jump Train — {(editConstraint.nodes?.length ?? 0)} node{(editConstraint.nodes?.length ?? 0) === 1 ? "" : "s"}, {(editConstraint.arcParams?.length ?? 0)} arc{(editConstraint.arcParams?.length ?? 0) === 1 ? "" : "s"}
                                    </div>
                                    <div class="field-actions">
                                        <button
                                            class="btn btn-xs btn-accent"
                                            on:click={() => beginRaycastPlacement("trainNode")}
                                        >+ Node</button>
                                    </div>
                                </div>

                                {#if (editConstraint.nodes?.length ?? 0) === 0}
                                    <div class="dim-note">No nodes yet. Click "+ Node" or press T and click the map.</div>
                                {/if}

                                {#each (editConstraint.nodes ?? []) as node, i}
                                    <div class="train-node-block">
                                        <div class="field-row-header">
                                            <div class="field-label train-node-label">
                                                {#if i === 0}
                                                    ○ Node 1 — Start
                                                {:else if i === (editConstraint.nodes.length - 1)}
                                                    ● Node {i + 1} — End
                                                {:else}
                                                    ⛓ Node {i + 1} — Arc {i}→{i + 1}
                                                {/if}
                                            </div>
                                            <div class="field-actions">
                                                <button
                                                    class="btn btn-xs btn-danger"
                                                    on:click={() => store.removeTrainNode(trainEditorTargetId, i)}
                                                >Del</button>
                                            </div>
                                        </div>
                                        <div class="xyz-grid">
                                            <div class="xyz-field">
                                                <span class="xyz-axis x">X</span>
                                                <input
                                                    class="input mono"
                                                    type="number"
                                                    step="any"
                                                    value={node.cx ?? 0}
                                                    on:input={(e) => store.updateTrainNode(trainEditorTargetId, i, { cx: Number(e.currentTarget.value) })}
                                                />
                                            </div>
                                            <div class="xyz-field">
                                                <span class="xyz-axis y">Y</span>
                                                <input
                                                    class="input mono"
                                                    type="number"
                                                    step="any"
                                                    value={node.cy ?? 0}
                                                    on:input={(e) => store.updateTrainNode(trainEditorTargetId, i, { cy: Number(e.currentTarget.value) })}
                                                />
                                            </div>
                                            <div class="xyz-field">
                                                <span class="xyz-axis z">Z</span>
                                                <input
                                                    class="input mono"
                                                    type="number"
                                                    step="any"
                                                    value={node.cz ?? 0}
                                                    on:input={(e) => store.updateTrainNode(trainEditorTargetId, i, { cz: Number(e.currentTarget.value) })}
                                                />
                                            </div>
                                        </div>
                                        <div class="row gap-8">
                                            <select
                                                class="input"
                                                value={node.hitboxType || "sphere"}
                                                on:change={(e) => store.updateTrainNode(trainEditorTargetId, i, { hitboxType: e.currentTarget.value })}
                                            >
                                                {#each HITBOX_TYPES as shape}
                                                    <option value={shape}>{shape}</option>
                                                {/each}
                                            </select>
                                        </div>
                                        {#if (node.hitboxType || "sphere") === "sphere" || (node.hitboxType || "sphere") === "circle"}
                                            <div class="row gap-8 align-center">
                                                <input
                                                    class="input mono grow"
                                                    type="number"
                                                    step="any"
                                                    min="0"
                                                    value={node.radius ?? 8}
                                                    on:input={(e) => store.updateTrainNode(trainEditorTargetId, i, { radius: Number(e.currentTarget.value) })}
                                                />
                                                <span class="dim-note">radius</span>
                                            </div>
                                        {:else if (node.hitboxType || "sphere") === "cylinder"}
                                            <div class="xyz-grid">
                                                <div class="xyz-field">
                                                    <span class="xyz-axis z">Radius</span>
                                                    <input
                                                        class="input mono"
                                                        type="number"
                                                        step="any"
                                                        min="0"
                                                        value={node.radius ?? 8}
                                                        on:input={(e) => store.updateTrainNode(trainEditorTargetId, i, { radius: Number(e.currentTarget.value) })}
                                                    />
                                                </div>
                                                <div class="xyz-field">
                                                    <span class="xyz-axis y">Height</span>
                                                    <input
                                                        class="input mono"
                                                        type="number"
                                                        step="any"
                                                        min="0"
                                                        value={node.height ?? 6}
                                                        on:input={(e) => store.updateTrainNode(trainEditorTargetId, i, { height: Number(e.currentTarget.value) })}
                                                    />
                                                </div>
                                            </div>
                                        {:else}
                                            <div class="xyz-grid">
                                                <div class="xyz-field">
                                                    <span class="xyz-axis x">W</span>
                                                    <input
                                                        class="input mono"
                                                        type="number"
                                                        step="any"
                                                        min="0"
                                                        value={node.sizeX ?? 8}
                                                        on:input={(e) => store.updateTrainNode(trainEditorTargetId, i, { sizeX: Number(e.currentTarget.value) })}
                                                    />
                                                </div>
                                                <div class="xyz-field">
                                                    <span class="xyz-axis y">H</span>
                                                    <input
                                                        class="input mono"
                                                        type="number"
                                                        step="any"
                                                        min="0"
                                                        value={node.sizeY ?? 8}
                                                        on:input={(e) => store.updateTrainNode(trainEditorTargetId, i, { sizeY: Number(e.currentTarget.value) })}
                                                    />
                                                </div>
                                                <div class="xyz-field">
                                                    <span class="xyz-axis z">D</span>
                                                    <input
                                                        class="input mono"
                                                        type="number"
                                                        step="any"
                                                        min="0"
                                                        value={node.sizeZ ?? 8}
                                                        on:input={(e) => store.updateTrainNode(trainEditorTargetId, i, { sizeZ: Number(e.currentTarget.value) })}
                                                    />
                                                </div>
                                            </div>
                                        {/if}
                                    </div>

                                    {#if i < (editConstraint.arcParams?.length ?? 0)}
                                        <div class="train-arc-params">
                                            <span class="train-arc-label">Arc {i + 1} jump y-vel</span>
                                            <input
                                                class="input mono"
                                                type="number"
                                                step="any"
                                                min="0.001"
                                                value={editConstraint.arcParams[i]?.jumpYVel ?? 0.072}
                                                on:input={(e) => store.updateTrainArcParams(trainEditorTargetId, i, { jumpYVel: Number(e.currentTarget.value) })}
                                            />
                                        </div>
                                    {/if}
                                {/each}
                            </div>
                        {/if}

                        {#if showLookDirection}
                            <div class="field-group">
                                <div class="field-label">Look Direction</div>
                                <div class="xyz-grid">
                                    <div class="xyz-field">
                                        <span class="xyz-axis y">Yaw</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.yaw ?? 0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "yaw",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                    <div class="xyz-field">
                                        <span class="xyz-axis z">Tolerance</span
                                        >
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            min="0"
                                            value={editConstraint.toleranceRad ??
                                                0.35}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "toleranceRad",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                </div>
                            </div>
                        {/if}

                        {#if showLookRange}
                            <div class="field-group">
                                <div class="field-label">Look Range</div>
                                <div class="xyz-grid">
                                    <div class="xyz-field">
                                        <span class="xyz-axis x">Yaw Min</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.yawMin ??
                                                -0.6}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "yawMin",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                    <div class="xyz-field">
                                        <span class="xyz-axis z">Yaw Max</span>
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.yawMax ?? 0.6}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "yawMax",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                </div>
                            </div>
                        {/if}

                        {#if showVelocityDirection}
                            <div class="field-group">
                                <div class="field-label">
                                    Velocity Direction
                                </div>
                                <div class="xyz-grid">
                                    <div class="xyz-field">
                                        <span class="xyz-axis y"
                                            >Target Yaw</span
                                        >
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            value={editConstraint.targetYaw ??
                                                0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "targetYaw",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                    <div class="xyz-field">
                                        <span class="xyz-axis z">Tolerance</span
                                        >
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            min="0"
                                            value={editConstraint.toleranceRad ??
                                                0.35}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "toleranceRad",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                    <div class="xyz-field">
                                        <span class="xyz-axis x">Min Speed</span
                                        >
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            min="0"
                                            value={editConstraint.minSpeed ?? 0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "minSpeed",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                </div>
                            </div>
                        {/if}

                        {#if showSpeedWindow}
                            <div class="field-group">
                                <div class="field-label">Speed Window</div>
                                <div class="xyz-grid">
                                    <div class="xyz-field">
                                        <span class="xyz-axis x">Min Speed</span
                                        >
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            min="0"
                                            value={editConstraint.minSpeed ?? 0}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "minSpeed",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                    <div class="xyz-field">
                                        <span class="xyz-axis y">Max Speed</span
                                        >
                                        <input
                                            class="input mono"
                                            type="number"
                                            step="any"
                                            min="0"
                                            value={editConstraint.maxSpeed ??
                                                0.02}
                                            on:input={(e) =>
                                                updateEditField(
                                                    "maxSpeed",
                                                    e.currentTarget.value,
                                                )}
                                        />
                                    </div>
                                </div>
                            </div>
                        {/if}

                        {#if showTurn}
                            <div class="field-group">
                                <div class="field-label">Turn Constraint</div>
                                <div class="row gap-8 align-center">
                                    <input
                                        class="input mono grow"
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={editConstraint.maxDeltaRad ??
                                            0.5}
                                        on:input={(e) =>
                                            updateEditField(
                                                "maxDeltaRad",
                                                e.currentTarget.value,
                                            )}
                                    />
                                    <span class="dim-note">max delta rad</span>
                                </div>
                            </div>
                        {/if}

                        {#if showState}
                            <div class="field-group">
                                <div class="field-label">Required State</div>
                                <select
                                    class="input"
                                    value={editConstraint.requiredState ||
                                        "Grounded"}
                                    on:change={(e) =>
                                        updateEditField(
                                            "requiredState",
                                            e.currentTarget.value,
                                        )}
                                >
                                    {#each REQUIRED_STATES as requiredState}
                                        <option value={requiredState}
                                            >{requiredState}</option
                                        >
                                    {/each}
                                </select>
                            </div>
                        {/if}

                        <button class="btn btn-apply" on:click={applySelected}>
                            ✓ Apply Changes
                        </button>

                        {#if state.viewportCursor}
                            <div class="cursor-info">
                                <span class="cursor-label">Cursor hit</span>
                                <span class="cursor-coords mono">
                                    {fmt(state.viewportCursor.point.x)},
                                    {fmt(state.viewportCursor.point.y)},
                                    {fmt(state.viewportCursor.point.z)}
                                </span>
                            </div>
                        {/if}

                        <div class="field-group">
                            <div class="field-label">Nudge (1 unit)</div>
                            <div class="nudge-grid">
                                <button
                                    class="btn btn-nudge x"
                                    on:click={() => nudge(-1, 0, 0)}>−X</button
                                >
                                <button
                                    class="btn btn-nudge x"
                                    on:click={() => nudge(1, 0, 0)}>+X</button
                                >
                                <button
                                    class="btn btn-nudge y"
                                    on:click={() => nudge(0, -1, 0)}>−Y</button
                                >
                                <button
                                    class="btn btn-nudge y"
                                    on:click={() => nudge(0, 1, 0)}>+Y</button
                                >
                                <button
                                    class="btn btn-nudge z"
                                    on:click={() => nudge(0, 0, -1)}>−Z</button
                                >
                                <button
                                    class="btn btn-nudge z"
                                    on:click={() => nudge(0, 0, 1)}>+Z</button
                                >
                            </div>
                        </div>

                        {#if selected.constraint.cx !== undefined}
                            <div class="readout">
                                <span class="readout-item"
                                    >cx <b>{fmt(selected.constraint.cx)}</b
                                    ></span
                                >
                                <span class="readout-item"
                                    >cy <b>{fmt(selected.constraint.cy)}</b
                                    ></span
                                >
                                <span class="readout-item"
                                    >cz <b>{fmt(selected.constraint.cz)}</b
                                    ></span
                                >
                                <span class="readout-item"
                                    >r <b
                                        >{fmt(
                                            selected.constraint.radius ?? 8,
                                        )}</b
                                    ></span
                                >
                                {#if selected.constraint.bx !== undefined}
                                    <span class="readout-item"
                                        >bx <b>{fmt(selected.constraint.bx)}</b
                                        ></span
                                    >
                                {/if}
                            </div>
                        {/if}
                    </div>
                {:else}
                    <div class="empty-state">
                        <div class="empty-icon">⬡</div>
                        <div class="empty-msg">
                            Select a constraint from the list
                        </div>
                        <div class="empty-sub">
                            or press <kbd>A</kbd> to add one
                        </div>
                    </div>
                {/if}
            {/if}

            {#if state.ui.activeTab === "visuals"}
                <div class="pane">
                    <div class="pane-title">Visual Controls</div>

                    <div class="field-group">
                        <div class="field-label">Visibility</div>
                        <div class="toggle-list">
                            <label class="toggle-row">
                                <input
                                    type="checkbox"
                                    checked={state.visuals.showAll}
                                    on:change={(e) =>
                                        store.setVisuals({
                                            showAll: e.currentTarget.checked,
                                        })}
                                />
                                <span class="toggle-track"></span>
                                <span>Show all constraints</span>
                            </label>
                            <label class="toggle-row">
                                <input
                                    type="checkbox"
                                    checked={state.visuals.showOnlySelected}
                                    on:change={(e) =>
                                        store.setVisuals({
                                            showOnlySelected:
                                                e.currentTarget.checked,
                                        })}
                                />
                                <span class="toggle-track"></span>
                                <span>Selected only</span>
                            </label>
                            <label class="toggle-row">
                                <input
                                    type="checkbox"
                                    checked={state.visuals.showFlowLines}
                                    on:change={(e) =>
                                        store.setVisuals({
                                            showFlowLines:
                                                e.currentTarget.checked,
                                        })}
                                />
                                <span class="toggle-track"></span>
                                <span>Show flow lines</span>
                            </label>
                            <label class="toggle-row">
                                <input
                                    type="checkbox"
                                    checked={state.visuals.showLabels}
                                    on:change={(e) =>
                                        store.setVisuals({
                                            showLabels: e.currentTarget.checked,
                                        })}
                                />
                                <span class="toggle-track"></span>
                                <span>Show labels</span>
                            </label>
                        </div>
                    </div>

                    <div class="field-group">
                        <div class="field-label">
                            Opacity — {Math.round(state.visuals.opacity * 100)}%
                        </div>
                        <input
                            type="range"
                            class="slider"
                            min="0.1"
                            max="1"
                            step="0.05"
                            value={state.visuals.opacity}
                            on:input={(e) =>
                                store.setVisuals({
                                    opacity: Number(e.currentTarget.value),
                                })}
                        />
                    </div>

                    <div class="field-group">
                        <div class="field-label">
                            Line Thickness — {state.visuals.lineThickness}px
                        </div>
                        <input
                            type="range"
                            class="slider"
                            min="1"
                            max="6"
                            step="1"
                            value={state.visuals.lineThickness}
                            on:input={(e) =>
                                store.setVisuals({
                                    lineThickness: Number(
                                        e.currentTarget.value,
                                    ),
                                })}
                        />
                    </div>

                    <div class="field-group">
                        <div class="field-label">Color Theme</div>
                        <div class="theme-grid">
                            {#each [["classic", "Classic", "#58a6ff"], ["neon", "Neon", "#00ff88"], ["mono", "Mono", "#e6edf3"]] as [id, label, dot]}
                                <button
                                    class="theme-btn"
                                    class:active={state.visuals.colorTheme ===
                                        id}
                                    on:click={() =>
                                        store.setVisuals({ colorTheme: id })}
                                >
                                    <span
                                        class="theme-dot"
                                        style="background:{dot}"
                                    ></span>
                                    {label}
                                </button>
                            {/each}
                        </div>
                    </div>
                </div>
            {/if}

            {#if state.ui.activeTab === "positions"}
                <div class="pane">
                    <div class="pane-title">Saved Positions</div>
                    <div class="row gap-8">
                        <button
                            class="btn btn-sm"
                            on:click={() => {
                                if (!state.viewportCursor) return;
                                store.addSavedPosition({
                                    name: `Cursor ${new Date().toLocaleTimeString()}`,
                                    x: state.viewportCursor.point.x,
                                    y: state.viewportCursor.point.y,
                                    z: state.viewportCursor.point.z,
                                });
                            }}>⊕ Save Cursor</button
                        >
                        <button
                            class="btn btn-sm"
                            on:click={() => {
                                if (!selected) return;
                                store.addSavedPosition({
                                    name: `${selected.label} center`,
                                    x: selected.constraint.cx,
                                    y: selected.constraint.cy,
                                    z: selected.constraint.cz,
                                });
                            }}>⊕ Save Selected</button
                        >
                    </div>

                    {#if state.savedPositions.length === 0}
                        <div class="field-group">
                            <div class="empty-inline">
                                No saved positions yet.
                            </div>
                        </div>
                    {:else}
                        <div class="pos-list">
                            {#each state.savedPositions as pos, idx}
                                <div class="pos-item">
                                    <div class="pos-name">
                                        {pos.name || `Position ${idx + 1}`}
                                    </div>
                                    <div class="pos-coords mono">
                                        {fmt(pos.x)}, {fmt(pos.y)}, {fmt(pos.z)}
                                    </div>
                                    <div class="row gap-8">
                                        <button
                                            class="btn btn-xs btn-accent"
                                            on:click={() =>
                                                store.moveSelectedTo(
                                                    Number(pos.x),
                                                    Number(pos.y),
                                                    Number(pos.z),
                                                )}
                                        >
                                            ↗ Apply to Selected
                                        </button>
                                        <button
                                            class="btn btn-xs btn-danger"
                                            on:click={() =>
                                                store.deleteSavedPosition(idx)}
                                            >✕</button
                                        >
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}

            {#if state.ui.activeTab === "io"}
                <div class="pane">
                    <div class="pane-title">Import / Export</div>

                    <div class="field-group">
                        <div class="field-label">Auto Map Import</div>
                        <textarea
                            class="json-area mono"
                            rows="3"
                            value={state.ui.mapImportText || ""}
                            on:input={(e) => updateMapImportText(e.currentTarget.value)}
                            on:keydown={onMapImportKeydown}
                            placeholder="Paste JSON map string here for window.global.importMap(...) (Enter to run, Shift+Enter for newline)…"
                        ></textarea>
                        <div class="row gap-8">
                            <button
                                class="btn btn-sm btn-accent"
                                on:click={runMapAutoImport}
                            >
                                ↻ Run window.global.importMap(json)
                            </button>
                        </div>
                    </div>

                    <div class="io-actions">
                        <button
                            class="btn btn-sm btn-accent"
                            on:click={() =>
                                exportConstraintDocument({
                                    mapRef: state.editorIntegration.mapRef,
                                    name: `${state.editorIntegration.mapRef || "map"} constraints`,
                                    constraints: state.constraints,
                                    savedPositions: state.savedPositions,
                                    visuals: state.visuals,
                                    ui: state.ui,
                                    selectedConstraintId: state.selectedConstraintId,
                                })}>↓ Export JSON</button
                        >
                        <button
                            class="btn btn-sm"
                            class:feedback={copyFeedback}
                            on:click={copyJson}
                        >
                            {copyFeedback ? "✓ Copied!" : "⎘ Copy JSON"}
                        </button>
                        <button class="btn btn-sm" on:click={loadJsonText}
                            >↑ Load from Text</button
                        >
                        <label
                            class="btn btn-sm btn-file"
                            title="Import from .json file"
                        >
                            ⊕ Import File
                            <input
                                type="file"
                                accept="application/json,.json"
                                on:change={onImportFile}
                            />
                        </label>
                        <button
                            class="btn btn-sm btn-danger"
                            on:click={() => {
                                if (
                                    confirm(
                                        `Clear all ${state.constraints.length} constraints?`,
                                    )
                                )
                                    store.clearAllConstraints();
                            }}>✕ Clear All</button
                        >
                    </div>

                    <div class="field-group">
                        <div class="field-label">JSON</div>
                        <textarea
                            class="json-area mono"
                            bind:value={jsonText}
                            placeholder="Paste JSON here to load, or copy/export to populate…"
                        ></textarea>
                    </div>

                    <div class="io-meta">
                        <span>{state.constraints.length} constraints</span>
                        <span>·</span>
                        <span
                            >Map: {state.editorIntegration.mapRef ||
                                "unknown"}</span
                        >
                        {#if state.dirty}<span class="dirty">● unsaved</span
                            >{/if}
                    </div>
                </div>
            {/if}
        </div>
    </section>
</div>

<style>
    /* ── Reset & tokens ─────────────────────────── */
    :root {
        --bg0: #0d1117;
        --bg1: #161b22;
        --bg2: #1c2128;
        --bg3: #252b33;
        --bg4: #2d333b;
        --border: #30363d;
        --text1: #e6edf3;
        --text2: #8b949e;
        --text3: #6e7681;
        --accent: #58a6ff;
        --green: #3fb950;
        --red: #f85149;
        --yellow: #d29922;
        --radius: 6px;
    }

    .shell {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: row;
        overflow: hidden;
        background: var(--bg0);
        color: var(--text1);
        font:
            13px/1.5 "Inter",
            "Segoe UI",
            system-ui,
            sans-serif;
        pointer-events: auto;
    }
    .shell * {
        box-sizing: border-box;
        font-family: inherit;
        color: var(--text1);
        outline: none;
    }

    /* ── Rail ─────────────────────────────────────── */
    .rail {
        width: 320px;
        min-width: 320px;
        max-width: 320px;
        background: var(--bg1);
        border-right: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        flex-shrink: 0;
    }

    .rail-head {
        background: var(--bg2);
        border-bottom: 1px solid var(--border);
        padding: 12px 14px 10px;
    }
    .rail-head-top {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
    }
    .logo-mark {
        font-size: 18px;
        color: var(--accent);
        line-height: 1;
    }
    .logo-text {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 1.8px;
        text-transform: uppercase;
        color: var(--text1);
        flex: 1;
    }
    .close-btn {
        background: none;
        border: none;
        color: var(--text3);
        font-size: 14px;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
    }
    .close-btn:hover {
        background: var(--bg4);
        color: var(--text1);
    }

    .map-badge {
        display: flex;
        align-items: center;
        gap: 7px;
    }
    .map-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--text3);
        flex-shrink: 0;
    }
    .map-dot.ready {
        background: var(--green);
    }
    .map-name {
        font-size: 12px;
        font-family: ui-monospace, "Cascadia Code", monospace;
        color: var(--text2);
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .map-mode {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: var(--yellow);
        background: #26200b;
        border: 1px solid #443800;
        border-radius: 3px;
        padding: 1px 6px;
    }

    /* Toolbar */
    .rail-toolbar {
        border-bottom: 1px solid var(--border);
        padding: 10px 12px;
        display: grid;
        gap: 8px;
        background: var(--bg1);
    }
    .add-row {
        display: flex;
        gap: 8px;
    }

    /* Stats bar */
    .stats-bar {
        display: flex;
        gap: 0;
        background: var(--bg2);
        border-bottom: 1px solid var(--border);
        padding: 4px 12px;
        font-size: 11px;
        gap: 10px;
    }
    .stat {
        color: var(--text2);
    }
    .stat-on {
        color: var(--green);
    }
    .stat-off {
        color: var(--red);
    }

    /* Constraint list */
    .clist {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-height: 0;
    }
    .clist-empty {
        padding: 20px;
        text-align: center;
        color: var(--text3);
        font-size: 12px;
    }
    .citem {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg2);
        color: var(--text1);
        padding: 7px 10px 7px 4px;
        text-align: left;
        cursor: pointer;
        overflow: hidden;
        transition:
            background 0.1s,
            border-color 0.1s;
    }
    .citem:hover {
        background: var(--bg3);
        border-color: #484f58;
    }
    .citem.selected {
        background: var(--bg3);
        border-color: var(--accent);
        box-shadow:
            0 0 0 1px var(--accent) inset,
            0 0 8px rgba(88, 166, 255, 0.1);
    }
    .citem.disabled {
        opacity: 0.5;
    }
    .citem.dragover {
        border-color: var(--yellow);
        box-shadow: 0 0 0 1px var(--yellow) inset;
    }
    .citem.train-child {
        margin-left: 18px;
        width: calc(100% - 18px);
        background: rgba(240, 136, 62, 0.06);
        border-style: dashed;
    }

    /* Left accent stripe */
    .citem-accent {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: var(--tc, #8b949e);
        border-radius: var(--radius) 0 0 var(--radius);
    }
    .citem-num {
        width: 22px;
        text-align: right;
        font-size: 11px;
        color: var(--text3);
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
        padding-left: 8px;
    }
    .citem-icon {
        font-size: 14px;
        flex-shrink: 0;
        width: 18px;
        text-align: center;
    }
    .citem-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
    }
    .citem-label {
        font-weight: 600;
        font-size: 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .citem-type {
        font-size: 10px;
        color: var(--text3);
        font-family: ui-monospace, monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .citem-badge {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.8px;
        text-transform: uppercase;
        border-radius: 3px;
        padding: 2px 5px;
        flex-shrink: 0;
    }
    .citem-badge.off {
        background: #3d1a1a;
        color: var(--red);
        border: 1px solid #5a2222;
    }
    .citem-badge.sel {
        background: #0d2044;
        color: var(--accent);
        border: 1px solid #1a3a6e;
    }
    .citem-handle {
        font-size: 14px;
        color: var(--text3);
        cursor: grab;
        flex-shrink: 0;
        letter-spacing: -2px;
    }

    .drop-zone {
        border: 1px dashed #30363d;
        border-radius: var(--radius);
        color: var(--text3);
        padding: 7px;
        text-align: center;
        font-size: 11px;
        cursor: default;
    }

    /* ── Main panel ────────────────────────────────── */
    .main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: var(--bg0);
    }

    /* Tab bar */
    .tabs {
        display: flex;
        align-items: center;
        border-bottom: 1px solid var(--border);
        background: var(--bg1);
        padding: 0 12px;
        gap: 2px;
    }
    .tab {
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--text2);
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        margin-bottom: -1px;
        transition:
            color 0.1s,
            border-color 0.1s;
    }
    .tab:hover {
        color: var(--text1);
    }
    .tab.active {
        color: var(--text1);
        border-bottom-color: var(--accent);
    }

    .tabs-spacer {
        flex: 1;
    }
    .undo-redo {
        display: flex;
        gap: 4px;
    }

    /* Tab body */
    .tab-body {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 16px;
        min-height: 0;
        width: 100%;
    }

    .pane {
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
        max-width: 100%;
    }
    .pane-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1.4px;
        color: var(--text2);
        padding-bottom: 4px;
        border-bottom: 1px solid var(--border);
    }

    /* Constraint title bar */
    .constraint-titlebar {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--bg2);
        border: 1px solid var(--border);
        border-left: 3px solid var(--tc, #8b949e);
        border-radius: var(--radius);
        padding: 8px 10px;
    }
    .ct-icon {
        font-size: 16px;
        color: var(--tc, #8b949e);
    }
    .ct-type {
        font-size: 12px;
        font-weight: 700;
        font-family: ui-monospace, monospace;
        color: var(--text1);
    }
    .ct-spacer {
        flex: 1;
    }

    /* Field groups */
    .field-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .field-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: var(--text2);
    }
    .field-row-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }
    .field-actions {
        display: flex;
        gap: 6px;
    }

    /* XYZ grid */
    .xyz-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
    }
    .xyz-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .xyz-axis {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.8px;
        text-transform: uppercase;
    }
    .xyz-axis.x {
        color: #f85149;
    }
    .xyz-axis.y {
        color: #3fb950;
    }
    .xyz-axis.z {
        color: #58a6ff;
    }

    /* Inputs */
    .input {
        width: 100%;
        background: var(--bg2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text1);
        padding: 7px 10px;
        font-size: 13px;
        transition:
            border-color 0.15s,
            box-shadow 0.15s;
    }
    .input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
    }
    .input::placeholder {
        color: var(--text3);
    }
    .input[type="number"] {
        -moz-appearance: textfield;
    }
    .input[type="number"]::-webkit-outer-spin-button,
    .input[type="number"]::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }
    .mono {
        font-family: ui-monospace, "Cascadia Code", monospace;
    }

    /* Apply button */
    .btn-apply {
        background: var(--accent);
        border: 1px solid rgba(88, 166, 255, 0.4);
        color: #0d1117;
        font-weight: 700;
        font-size: 13px;
        padding: 9px 18px;
        border-radius: var(--radius);
        cursor: pointer;
        transition:
            background 0.15s,
            transform 0.1s;
    }
    .btn-apply:hover {
        background: #79c0ff;
    }
    .btn-apply:active {
        transform: scale(0.98);
    }

    /* Nudge */
    .nudge-grid {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 5px;
    }
    .btn-nudge {
        background: var(--bg3);
        border: 1px solid var(--border);
        border-radius: 4px;
        color: var(--text1);
        font-size: 12px;
        font-weight: 600;
        padding: 6px 4px;
        cursor: pointer;
        text-align: center;
        transition: background 0.1s;
    }
    .btn-nudge.x {
        border-bottom: 2px solid #f85149;
    }
    .btn-nudge.y {
        border-bottom: 2px solid #3fb950;
    }
    .btn-nudge.z {
        border-bottom: 2px solid #58a6ff;
    }
    .btn-nudge:hover {
        background: var(--bg4);
    }

    /* Readout */
    .readout {
        display: flex;
        gap: 10px;
        font-size: 11px;
        color: var(--text2);
        background: var(--bg2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 6px 10px;
        font-family: ui-monospace, monospace;
    }
    .readout-item b {
        color: var(--text1);
    }

    /* Cursor info */
    .cursor-info {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 11px;
        background: #0d2044;
        border: 1px solid #1a3a6e;
        border-radius: var(--radius);
        padding: 6px 10px;
    }
    .cursor-label {
        color: var(--accent);
        font-weight: 600;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.6px;
    }
    .cursor-coords {
        color: var(--text2);
    }

    /* Dim note */
    .dim-note {
        font-size: 11px;
        color: var(--text3);
        white-space: nowrap;
    }

    /* Empty state */
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 280px;
        gap: 8px;
        color: var(--text3);
    }
    .empty-icon {
        font-size: 36px;
        opacity: 0.3;
    }
    .empty-msg {
        font-size: 14px;
        font-weight: 600;
        color: var(--text2);
    }
    .empty-sub {
        font-size: 12px;
    }
    .empty-sub kbd {
        background: var(--bg3);
        border: 1px solid var(--border);
        border-radius: 3px;
        padding: 1px 5px;
        font-size: 11px;
        font-family: inherit;
        color: var(--text1);
    }
    .empty-inline {
        color: var(--text3);
        font-size: 12px;
        padding: 8px 0;
    }

    /* Visuals tab */
    .toggle-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .toggle-row {
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        font-size: 13px;
        color: var(--text1);
        user-select: none;
    }
    .toggle-row input {
        display: none;
    }
    .toggle-track {
        position: relative;
        width: 34px;
        height: 18px;
        background: var(--bg4);
        border: 1px solid var(--border);
        border-radius: 9px;
        flex-shrink: 0;
        transition:
            background 0.15s,
            border-color 0.15s;
    }
    .toggle-track::after {
        content: "";
        position: absolute;
        left: 2px;
        top: 50%;
        transform: translateY(-50%);
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--text3);
        transition:
            left 0.15s,
            background 0.15s;
    }
    .toggle-row input:checked ~ .toggle-track {
        background: #0d3a1c;
        border-color: var(--green);
    }
    .toggle-row input:checked ~ .toggle-track::after {
        left: 18px;
        background: var(--green);
    }

    .slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 4px;
        background: var(--bg4);
        border: 1px solid var(--border);
        border-radius: 2px;
        outline: none;
        cursor: pointer;
    }
    .slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--accent);
        border: 2px solid var(--bg0);
        cursor: pointer;
    }

    .theme-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
    }
    .theme-btn {
        display: flex;
        align-items: center;
        gap: 7px;
        background: var(--bg2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text1);
        padding: 8px 10px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition:
            border-color 0.1s,
            background 0.1s;
    }
    .theme-btn:hover {
        background: var(--bg3);
    }
    .theme-btn.active {
        border-color: var(--accent);
        background: var(--bg3);
    }
    .theme-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    /* Positions tab */
    .pos-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .pos-item {
        background: var(--bg2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 5px;
    }
    .pos-name {
        font-size: 13px;
        font-weight: 600;
    }
    .pos-coords {
        font-size: 12px;
        color: var(--text2);
    }

    /* I/O tab */
    .io-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    .btn-file {
        position: relative;
        overflow: hidden;
    }
    .btn-file input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
        font-size: 0;
    }
    .json-area {
        width: 100%;
        min-height: 200px;
        resize: vertical;
        background: var(--bg2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text1);
        padding: 10px 12px;
        font-family: ui-monospace, "Cascadia Code", monospace;
        font-size: 12px;
        line-height: 1.6;
        transition: border-color 0.15s;
    }
    .json-area:focus {
        border-color: var(--accent);
        outline: none;
    }
    .json-area::placeholder {
        color: var(--text3);
    }

    .io-meta {
        display: flex;
        gap: 8px;
        font-size: 11px;
        color: var(--text3);
    }
    .dirty {
        color: var(--yellow);
    }

    /* ── Generic buttons ─────────────────────────── */
    .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        background: var(--bg3);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text1);
        padding: 7px 12px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        transition:
            background 0.1s,
            border-color 0.1s;
    }
    .btn:hover {
        background: var(--bg4);
        border-color: #484f58;
    }

    .btn-sm {
        padding: 5px 10px;
        font-size: 12px;
    }
    .btn-xs {
        padding: 3px 8px;
        font-size: 11px;
    }
    .btn-icon {
        padding: 5px 10px;
        font-size: 14px;
        background: none;
        border-color: transparent;
    }
    .btn-icon:hover {
        background: var(--bg3);
        border-color: var(--border);
    }

    .btn-add {
        background: #0d3a1c;
        border-color: #1a5c2c;
        color: var(--green);
        font-weight: 700;
    }
    .btn-add:hover {
        background: #133f21;
    }

    .btn-accent {
        background: #0d2044;
        border-color: #1a3a6e;
        color: var(--accent);
    }
    .btn-accent:hover {
        background: #122850;
    }

    .btn-armed {
        background: #261a0d;
        border-color: #6e3d00;
        color: var(--yellow);
    }
    .btn-armed:hover {
        background: #2f2010;
    }

    .btn-danger {
        background: #3d1a1a;
        border-color: #5a2222;
        color: var(--red);
    }
    .btn-danger:hover {
        background: #4a2020;
    }

    .btn-toggle {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.6px;
        padding: 4px 10px;
    }
    .btn-toggle.enabled {
        background: #0d3a1c;
        border-color: #1a5c2c;
        color: var(--green);
    }
    .btn-toggle:not(.enabled) {
        background: #3d1a1a;
        border-color: #5a2222;
        color: var(--red);
    }

    .btn-raycast {
        background: var(--bg2);
        border-color: var(--border);
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
        justify-content: center;
    }
    .btn-raycast.armed {
        background: #261a0d;
        border-color: #6e3d00;
        color: var(--yellow);
        animation: armed-pulse 1.5s ease-in-out infinite;
    }
    .btn-train {
        background: var(--bg2);
        border-color: var(--border);
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
        justify-content: center;
        color: #ff9933;
    }
    .btn-train.armed {
        background: #261500;
        border-color: #7a4400;
        color: #ffbb55;
        animation: armed-pulse 1.5s ease-in-out infinite;
    }
    .train-node-block {
        margin: 6px 0;
        padding: 8px;
        background: rgba(255, 153, 51, 0.07);
        border: 1px solid rgba(255, 153, 51, 0.2);
        border-radius: 5px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .train-node-label {
        font-size: 11px;
        color: #ff9933;
        font-weight: 600;
    }
    .train-arc-params {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        background: rgba(255, 153, 51, 0.04);
        border-left: 2px solid rgba(255, 153, 51, 0.3);
        border-radius: 0 4px 4px 0;
        margin: 2px 0 4px 0;
    }
    .train-arc-label {
        font-size: 10px;
        color: #8b949e;
        white-space: nowrap;
        flex-shrink: 0;
    }
    @keyframes armed-pulse {
        0%,
        100% {
            box-shadow: 0 0 0 0 rgba(210, 153, 34, 0);
        }
        50% {
            box-shadow: 0 0 0 4px rgba(210, 153, 34, 0.2);
        }
    }

    .pulse-dot {
        width: 8px;
        height: 8px;
        background: var(--yellow);
        border-radius: 50%;
        animation: dot-pulse 1s ease-in-out infinite;
        flex-shrink: 0;
    }
    @keyframes dot-pulse {
        0%,
        100% {
            opacity: 1;
            transform: scale(1);
        }
        50% {
            opacity: 0.5;
            transform: scale(0.7);
        }
    }

    .type-select {
        flex: 1;
        background: var(--bg2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text1);
        padding: 7px 10px;
        font-size: 13px;
        cursor: pointer;
    }
    .type-select:focus {
        border-color: var(--accent);
    }

    .search-input {
        width: 100%;
        background: var(--bg2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text1);
        padding: 7px 10px;
        font-size: 13px;
    }
    .search-input:focus {
        border-color: var(--accent);
        outline: none;
    }
    .search-input::placeholder {
        color: var(--text3);
    }

    .btn.feedback {
        background: #0d3a1c;
        border-color: var(--green);
        color: var(--green);
    }

    /* Utility */
    .row {
        display: flex;
    }
    .gap-8 {
        gap: 8px;
    }
    .align-center {
        align-items: center;
    }
    .grow {
        flex: 1;
        min-width: 0;
    }
</style>
