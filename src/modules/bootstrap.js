import { createEditorHooks } from "./editor_hooks.js";
import { createStore } from "./store.js";
import { mountUi } from "./ui.js";
import { createConstraintRenderer } from "./render.js";
import { createAutosave, loadConstraintDocument } from "./persistence.js";

const BOOTSTRAP_SENTINEL = "__krConstraintEditorBootstrapped";

function waitForDocumentReady(cb) {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    cb();
    return;
  }
  window.addEventListener("DOMContentLoaded", cb, { once: true });
}

export function bootstrapConstraintEditor() {
  if (window[BOOTSTRAP_SENTINEL]) {
    return;
  }
  window[BOOTSTRAP_SENTINEL] = true;

  waitForDocumentReady(() => {
    try {
      const hooks = createEditorHooks();
      const store = createStore();

      hooks.subscribeFrame((snapshot) => {
        store.setEditorIntegration({
          mapRef: snapshot.mapRef,
          selection: snapshot.selection,
          sceneReady: snapshot.sceneReady,
        });
      });

      let loadedMapRef = null;
      hooks.subscribeFrame((snapshot) => {
        if (!snapshot.mapRef || snapshot.mapRef === loadedMapRef) {
          return;
        }
        loadedMapRef = snapshot.mapRef;
        const doc = loadConstraintDocument(snapshot.mapRef);
        if (doc?.constraints) {
          store.importDocument(doc);
          store.clearDirty();
        }
      });

      mountUi(store, hooks);
      createConstraintRenderer(store, hooks);
      createAutosave(store, () => store.getState().editorIntegration.mapRef);
    } catch (err) {
      console.error("[kr-constraint-editor] init failed:", err);
    }
  });
}
