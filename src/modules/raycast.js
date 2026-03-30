import * as THREE from "three";

const CONSTRAINT_ROOT_NAME = "krConstraintHelpers";
const HOVER_CURSOR_NAME = "krHoverCursor";

function toNdc(event, canvas, renderInfo) {
  const rect = canvas.getBoundingClientRect();
  const xCss = event.clientX - rect.left;
  const yCss = event.clientY - rect.top;
  const uCss = xCss / rect.width;
  const vCss = yCss / rect.height;

  const dbWidth = Number(renderInfo?.drawingBuffer?.width || 0);
  const dbHeight = Number(renderInfo?.drawingBuffer?.height || 0);
  const vp = renderInfo?.viewport;

  if (dbWidth > 0 && dbHeight > 0 && vp && vp.width > 0 && vp.height > 0) {
    const xDb = uCss * dbWidth;
    const yDb = (1 - vCss) * dbHeight;
    const uVp = (xDb - vp.x) / vp.width;
    const vVp = (yDb - vp.y) / vp.height;
    return {
      x: Math.max(-1, Math.min(1, uVp * 2 - 1)),
      y: Math.max(-1, Math.min(1, vVp * 2 - 1)),
    };
  }

  return {
    x: Math.max(-1, Math.min(1, uCss * 2 - 1)),
    y: Math.max(-1, Math.min(1, -(vCss * 2 - 1))),
  };
}

function collectMeshes(scene) {
  const meshes = [];
  const stack = [...scene.children];
  while (stack.length) {
    const node = stack.pop();
    if (!node.visible) continue;
    if (node.name === CONSTRAINT_ROOT_NAME || node.name === HOVER_CURSOR_NAME) continue;
    if (node.userData?.recordId) continue;
    if (node.isMesh) {
      if (node.material?.wireframe) continue;
      meshes.push(node);
    } else if (node.children?.length) {
      for (const child of node.children) stack.push(child);
    }
  }
  return meshes;
}

function fallbackGroundPlanePick(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 200 - 100;
  const z = ((event.clientY - rect.top) / rect.height) * 200 - 100;
  return {
    point: { x, y: 0, z },
    normal: { x: 0, y: 1, z: 0 },
    objectId: "fallback-ground",
    distance: 0,
    fallback: true,
  };
}

export function pickAtEvent(ctx, event) {
  const { canvas, scene, camera, renderInfo } = ctx;
  if (!canvas) return null;

  if (scene && camera) {
    try {
      const raycaster = new THREE.Raycaster();
      const ndc = toNdc(event, canvas, renderInfo);
      scene.updateMatrixWorld(true);
      camera.updateProjectionMatrix?.();
      camera.updateMatrixWorld(true);
      raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);

      const meshes = collectMeshes(scene);
      const hits = raycaster.intersectObjects(meshes, false);
      const hit = hits[0];

      if (hit?.point) {
        let normal = { x: 0, y: 1, z: 0 };
        if (hit.face?.normal && hit.object?.matrixWorld) {
          const n = hit.face.normal.clone();
          n.transformDirection(hit.object.matrixWorld);
          normal = { x: n.x, y: n.y, z: n.z };
        }
        return {
          point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
          normal,
          objectId: hit.object?.uuid || null,
          distance: hit.distance,
          fallback: false,
        };
      }
    } catch (err) {
      console.warn("[kr-constraint-editor] raycast error", err);
    }
  }

  return fallbackGroundPlanePick(event, canvas);
}
