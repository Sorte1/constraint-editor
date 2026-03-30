import { pickAtEvent } from "./raycast.js";

function getMapRef() {
  const fromQuery = new URLSearchParams(location.search).get("map");
  return fromQuery || window.mapName || document.title || "unknown-map";
}

export function createEditorHooks() {
  const frameListeners = new Set();
  const pickListeners = new Set();
  const hoverListeners = new Set();
  const cameraBySceneId = new Map();
  const renderInfoBySceneId = new Map();

  let renderHooked = false;

  function tryHookRendererRender(renderer) {
    if (renderHooked || !renderer) return;
    const proto = Object.getPrototypeOf(renderer);
    if (!proto || proto.__krRenderHooked) return;
    const orig = proto.render;
    proto.render = function (scene, camera) {
      const result = orig.call(this, scene, camera);
      if (scene?.isScene && camera && !camera.isOrthographicCamera) {
        const sceneId = scene.uuid || scene.id;
        if (sceneId) {
          cameraBySceneId.set(sceneId, camera);
          const gl = this.getContext?.();
          const rawViewport = gl?.getParameter?.(gl.VIEWPORT);
          renderInfoBySceneId.set(sceneId, {
            viewport: rawViewport
              ? {
                x: Number(rawViewport[0] || 0),
                y: Number(rawViewport[1] || 0),
                width: Number(rawViewport[2] || 0),
                height: Number(rawViewport[3] || 0),
              }
              : null,
            drawingBuffer: gl
              ? {
                width: Number(gl.drawingBufferWidth || 0),
                height: Number(gl.drawingBufferHeight || 0),
              }
              : null,
          });
        }
        window.__krCamera = camera;
      }
      return result;
    };
    proto.__krRenderHooked = true;
    renderHooked = true;
  }

  function discover() {
    const g = window.global;
    const scene = window.scene || g?.scene || null;
    const renderer = window.renderer || g?._renderer || null;
    const sceneId = scene?.uuid || scene?.id;
    const sceneCamera = sceneId ? cameraBySceneId.get(sceneId) : null;
    const renderInfo = sceneId ? renderInfoBySceneId.get(sceneId) : null;
    const camera = sceneCamera || g?.camera || window.__krCamera || window.camera || null;
    const canvas =
      renderer?.domElement ||
      document.querySelector("canvas#gameCanvas") ||
      document.querySelector("canvas") ||
      null;

    if (renderer && !renderHooked) tryHookRendererRender(renderer);

    return { scene, camera, renderer, canvas, renderInfo };
  }

  function eventTargetsCanvas(event, canvas) {
    if (!canvas) return false;
    if (event.target === canvas) return true;
    const rect = canvas.getBoundingClientRect();
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  }

  function tick() {
    const ctx = discover();
    const snapshot = {
      ...ctx,
      mapRef: getMapRef(),
      selection: window.editorSelection || null,
      sceneReady: Boolean(ctx.scene && ctx.camera && ctx.canvas),
    };
    for (const cb of frameListeners) cb(snapshot);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  document.addEventListener(
    "pointermove",
    (event) => {
      const ctx = discover();
      if (!ctx.canvas || !eventTargetsCanvas(event, ctx.canvas)) return;
      const hit = pickAtEvent(ctx, event);
      if (!hit) return;
      for (const cb of hoverListeners) cb(hit, event);
    },
    true,
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return;
      const ctx = discover();
      if (!ctx.canvas || !eventTargetsCanvas(event, ctx.canvas)) return;
      const hit = pickAtEvent(ctx, event);
      if (!hit) return;
      for (const cb of pickListeners) {
        const consumed = cb(hit, event);
        if (consumed) {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
          }
          break;
        }
      }
    },
    true,
  );

  return {
    subscribeFrame(cb) {
      frameListeners.add(cb);
      return () => frameListeners.delete(cb);
    },
    subscribePick(cb) {
      pickListeners.add(cb);
      return () => pickListeners.delete(cb);
    },
    subscribeHover(cb) {
      hoverListeners.add(cb);
      return () => hoverListeners.delete(cb);
    },
    getContext() {
      return discover();
    },
  };
}
