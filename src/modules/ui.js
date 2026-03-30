import { mount, unmount } from "svelte";
import App from "./svelte/App.svelte";

function activeEditableElement() {
  const el = document.activeElement;
  if (!el) {
    return false;
  }
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

function injectHostStyles() {
  if (document.getElementById("kr-constraint-editor-host-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "kr-constraint-editor-host-style";
  style.textContent = `
  #kr-constraint-editor-root {
    position: fixed;
    inset: 0;
    z-index: 2147483001;
    display: none;
    pointer-events: none;
    font-family: "Inter", "Segoe UI", system-ui, sans-serif;
    color: #ffffff !important;
    overflow: hidden;
  }
  #kr-constraint-editor-root,
  #kr-constraint-editor-root *,
  #kr-constraint-editor-root *::before,
  #kr-constraint-editor-root *::after {
    font-family: "Inter", "Segoe UI", system-ui, sans-serif !important;
  }
  #kr-constraint-editor-root.open {
    display: block;
  }
  #kr-constraint-editor-toolbar-btn {
    position: fixed;
    bottom: 12px;
    right: 12px;
    z-index: 2147483002;
    border: 1px solid #30363d;
    border-radius: 6px;
    background: #1c2128;
    color: #58a6ff;
    font: 700 12px "Inter", system-ui, sans-serif;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    cursor: pointer;
    padding: 8px 14px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.6);
    transition: background 0.15s, border-color 0.15s;
  }
  #kr-constraint-editor-toolbar-btn:hover {
    background: #252b33;
    border-color: #58a6ff;
  }
  `;
  document.head.appendChild(style);
}

function buildBaseDom() {
  const toolbarBtn = document.createElement("button");
  toolbarBtn.id = "kr-constraint-editor-toolbar-btn";
  toolbarBtn.textContent = "Constraints";
  document.body.appendChild(toolbarBtn);

  const root = document.createElement("aside");
  root.id = "kr-constraint-editor-root";
  document.body.appendChild(root);

  return { root, toolbarBtn };
}

function calcBoxSizeFromCenter(center, point) {
  return {
    sizeX: Math.max(0.1, Math.abs(Number(point.x) - Number(center.x)) * 2),
    sizeY: Math.max(0.1, Math.abs(Number(point.y) - Number(center.y)) * 2),
    sizeZ: Math.max(0.1, Math.abs(Number(point.z) - Number(center.z)) * 2),
  };
}

export function mountUi(store, hooks) {
  injectHostStyles();
  const { root, toolbarBtn } = buildBaseDom();

  function setOpen(open) {
    root.classList.toggle("open", open);
  }

  const app = mount(App, {
    target: root,
    props: {
      store,
      onClose: () => setOpen(false),
    },
  });

  toolbarBtn.addEventListener("click", () => {
    setOpen(!root.classList.contains("open"));
  });

  const onKeydown = (event) => {
    if (activeEditableElement()) {
      return;
    }
    const isOpen = root.classList.contains("open");
    if (!isOpen) {
      return;
    }
    const k = event.key.toLowerCase();
    if (k === "c") {
      setOpen(!root.classList.contains("open"));
    } else if (k === "a") {
      const state = store.getState();
      const type =
        state.constraints[state.constraints.length - 1]?.constraint?.type ||
        "HardCheckpoint";
      const record = store.addConstraint(type);
      store.selectConstraint(record.id);
      store.setPlacementTarget("center");
      store.setPlacementArmed(true);
      store.setToolMode("place");
      setOpen(true);
    } else if (event.key === "Delete") {
      const id = store.getState().selectedConstraintId;
      if (id) {
        store.deleteConstraint(id);
      }
    } else if (event.key === "Escape") {
      if (store.getState().placementArmed) {
        store.setPlacementArmed(false);
        store.setPlacementTarget("center");
        store.setToolMode("select");
      } else {
        setOpen(false);
      }
    } else if (k === "d" && event.ctrlKey) {
      const id = store.getState().selectedConstraintId;
      if (id) {
        store.duplicateConstraint(id);
      }
    } else if (k === "z" && event.ctrlKey) {
      store.undo();
    } else if (k === "y" && event.ctrlKey) {
      store.redo();
    }
  };
  document.addEventListener("keydown", onKeydown, true);

  const unsubscribePick = hooks.subscribePick((hit, event) => {
    const state = store.getState();
    if (!state.placementArmed || !state.selectedConstraintId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
    const selected = state.constraints.find(
      (record) => record.id === state.selectedConstraintId,
    );
    if (!selected) {
      return;
    }

    const target = state.placementTarget || "center";
    const patch = {
      nx: hit.normal.x,
      ny: hit.normal.y,
      nz: hit.normal.z,
    };
    if (selected.constraint.type === "JumpArc" && target === "takeoffSize") {
      const size = calcBoxSizeFromCenter(
        {
          x: selected.constraint.takeoffCx,
          y: selected.constraint.takeoffCy,
          z: selected.constraint.takeoffCz,
        },
        hit.point,
      );
      patch.takeoffSizeX = size.sizeX;
      patch.takeoffSizeY = size.sizeY;
      patch.takeoffSizeZ = size.sizeZ;
    } else if (selected.constraint.type === "JumpArc" && target === "landingSize") {
      const size = calcBoxSizeFromCenter(
        {
          x: selected.constraint.landingCx,
          y: selected.constraint.landingCy,
          z: selected.constraint.landingCz,
        },
        hit.point,
      );
      patch.landingSizeX = size.sizeX;
      patch.landingSizeY = size.sizeY;
      patch.landingSizeZ = size.sizeZ;
    } else if (selected.constraint.type === "JumpArc") {
      if (target === "landing") {
        patch.landingCx = hit.point.x;
        patch.landingCy = hit.point.y;
        patch.landingCz = hit.point.z;
      } else if (target === "takeoffSample") {
        patch.takeoffSampleCx = hit.point.x;
        patch.takeoffSampleCy = hit.point.y;
        patch.takeoffSampleCz = hit.point.z;
      } else {
        patch.takeoffCx = hit.point.x;
        patch.takeoffCy = hit.point.y;
        patch.takeoffCz = hit.point.z;
        patch.cx = hit.point.x;
        patch.cy = hit.point.y;
        patch.cz = hit.point.z;
      }
    } else if (target === "segmentSize") {
      const mid = {
        x: (Number(selected.constraint.ax ?? 0) + Number(selected.constraint.bx ?? 0)) * 0.5,
        y: (Number(selected.constraint.ay ?? 0) + Number(selected.constraint.by ?? 0)) * 0.5,
        z: (Number(selected.constraint.az ?? 0) + Number(selected.constraint.bz ?? 0)) * 0.5,
      };
      const size = calcBoxSizeFromCenter(mid, hit.point);
      patch.sizeX = size.sizeX;
      patch.sizeY = size.sizeY;
      patch.sizeZ = size.sizeZ;
    } else if (target === "size") {
      const size = calcBoxSizeFromCenter(
        {
          x: selected.constraint.cx,
          y: selected.constraint.cy,
          z: selected.constraint.cz,
        },
        hit.point,
      );
      patch.sizeX = size.sizeX;
      patch.sizeY = size.sizeY;
      patch.sizeZ = size.sizeZ;
    } else if (target === "end") {
      patch.bx = hit.point.x;
      patch.by = hit.point.y;
      patch.bz = hit.point.z;
    } else if (target === "start") {
      patch.ax = hit.point.x;
      patch.ay = hit.point.y;
      patch.az = hit.point.z;
      patch.cx = hit.point.x;
      patch.cy = hit.point.y;
      patch.cz = hit.point.z;
    } else {
      patch.cx = hit.point.x;
      patch.cy = hit.point.y;
      patch.cz = hit.point.z;
      patch.ax = hit.point.x;
      patch.ay = hit.point.y;
      patch.az = hit.point.z;
    }
    store.updateConstraint(state.selectedConstraintId, { constraint: patch });
    store.setPlacementArmed(false);
    store.setPlacementTarget("center");
    store.setToolMode("select");
    setOpen(true);
    return true;
  });

  const unsubscribeHover = hooks.subscribeHover((hit, event) => {
    store.setViewportCursor({
      ...hit,
      screen: {
        x: event.clientX,
        y: event.clientY,
      },
    });
  });

  setOpen(true);

  return {
    async destroy() {
      unsubscribePick();
      unsubscribeHover();
      document.removeEventListener("keydown", onKeydown, true);
      await unmount(app);
      root.remove();
      toolbarBtn.remove();
    },
  };
}
