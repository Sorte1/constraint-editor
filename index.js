import { installRuntimeHooks } from "./src/hook.js";
import { bootstrapConstraintEditor } from "./src/modules/bootstrap.js";

installRuntimeHooks();

document.addEventListener("DOMContentLoaded", () => {
  let interval = setInterval(() => {
    let elm = document.getElementById("instructionHolder");
    if (elm) {
      clearInterval(interval);
      window.closeWindow();
    }
  }, 250);
});

bootstrapConstraintEditor();
