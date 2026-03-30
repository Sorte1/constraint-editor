const HOOK_SENTINEL = "__krConstraintEditorHookInstalled";
const RENDER_HOOKED = "__krRenderHooked";

const capturedProps = new Set();

function hookRendererInstance(renderer) {
  if (!renderer || typeof renderer.render !== "function") return;

  const proto = Object.getPrototypeOf(renderer);
  if (!proto || proto[RENDER_HOOKED]) return;

  const originalRender = proto.render;

  proto.render = function renderHook(scene, camera) {
    if (scene?.isScene && camera && !camera.isOrthographicCamera) {
      window.__krCamera = camera;
      window.camera = camera;
    }

    return originalRender.call(this, scene, camera);
  };

  Object.defineProperty(proto, RENDER_HOOKED, {
    value: true,
    configurable: true,
  });
}

function hookProperty(name, onCapture) {
  const storage = Symbol(`__kr_${name}`);
  const existing = Object.getOwnPropertyDescriptor(Object.prototype, name);

  Object.defineProperty(Object.prototype, name, {
    configurable: true,
    enumerable: false,

    get() {
      if (existing?.get) {
        return existing.get.call(this);
      }
      return this[storage];
    },

    set(value) {
      if (existing?.set) {
        existing.set.call(this, value);
      } else {
        this[storage] = value;
      }

      if (!value || capturedProps.has(name)) {
        return;
      }

      capturedProps.add(name);
      window[name] = value;

      onCapture?.(value, this);
    },
  });
}

export function installRuntimeHooks() {
  if (window[HOOK_SENTINEL]) return;

  Object.defineProperty(window, HOOK_SENTINEL, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  hookProperty("renderer", (renderer, appObj) => {
    window.global = appObj;
    hookRendererInstance(renderer);
  });

  hookProperty("scene");
  hookProperty("panel");

  hookProperty("camera", (camera) => {
    window.camera = camera;
    window.__krCamera = camera;
  });
}
