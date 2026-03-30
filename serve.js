import fs from "fs";

Bun.serve({
  port: 3000,
  routes: {
    "/krunker-constraint-editor.user.js": () => {
      Bun.build({
        entrypoints: ["./build/krunker-constraint-editor.user.js"],
        outdir: "./build",
        target: "browser",
      });
      const content = fs.readFileSync(
        "./build/krunker-constraint-editor.user.js",
        "utf-8",
      );

      return new Response(content, {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
        },
      });
    },
  },
});

console.log(
  "Serving on http://localhost:3000/krunker-constraint-editor.user.js",
);
