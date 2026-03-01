import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type Dir = 1 | -1;

export function PageCurlGL({
  frontUrl,
  backUrl,
  progress,
  dir,
  grabX = 0.88,
  grabY = 0.5,
  isDragging = false,
  strength = 1.0,
  enabled = true,
  imageAspect,
}: {
  frontUrl: string;
  backUrl: string;
  progress: number;
  dir: Dir;
  grabX?: number;
  grabY?: number;
  isDragging?: boolean;
  strength?: number;
  enabled?: boolean;
  imageAspect?: number;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const geoRef = useRef<THREE.PlaneGeometry | null>(null);
  const basePosRef = useRef<Float32Array | null>(null);

  const pivotRef = useRef<THREE.Group | null>(null);
  const frontMeshRef = useRef<THREE.Mesh | null>(null);
  const backMeshRef = useRef<THREE.Mesh | null>(null);

  const planeWRef = useRef(1.0);
  const planeHRef = useRef(1.45);

  // 원본 이미지 비율 저장 (width / height)
  const imageAspectRef = useRef<number | null>(null);

  const loader = useMemo(() => new THREE.TextureLoader(), []);
  const texCacheRef = useRef<Map<string, THREE.Texture>>(new Map());

  const segX = 260;
  const segY = 190;

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  const tuneTexture = (tex: THREE.Texture) => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;

    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;

    tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
    tex.needsUpdate = true;
  };

  const loadTextureReady = (url: string, onReady: (tex: THREE.Texture) => void, isFront = false) => {
    if (!url) return;
    const cached = texCacheRef.current.get(url);
    if (cached) {
      if (isFront && cached.image) {
        const newAspect = cached.image.width / cached.image.height;
        if (imageAspectRef.current !== newAspect) {
          imageAspectRef.current = newAspect;
          layoutToScreen();
        }
      }
      onReady(cached);
      return;
    }
    loader.load(
      url,
      (tex) => {
        tuneTexture(tex);
        texCacheRef.current.set(url, tex);
        if (isFront && tex.image) {
          const newAspect = tex.image.width / tex.image.height;
          if (imageAspectRef.current !== newAspect) {
            imageAspectRef.current = newAspect;
            layoutToScreen();
          }
        }
        onReady(tex);
      },
      undefined,
      () => {}
    );
  };

  const applyHingeByDir = () => {
    const pivot = pivotRef.current;
    const front = frontMeshRef.current;
    const back = backMeshRef.current;
    if (!pivot || !front || !back) return;

    const PLANE_W = planeWRef.current;

    pivot.position.set(0, 0, 0);
    pivot.rotation.set(0, 0, 0);

    if (dir === 1) {
      pivot.position.x = -PLANE_W / 2;
      front.position.x = +PLANE_W / 2;
      back.position.x = +PLANE_W / 2;
    } else {
      pivot.position.x = +PLANE_W / 2;
      front.position.x = -PLANE_W / 2;
      back.position.x = -PLANE_W / 2;
    }
  };

  /**
   * 원본 이미지 비율을 유지하면서 화면에 contain 방식으로 맞춤
   */
  const layoutToScreen = () => {
    const mount = mountRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const pivot = pivotRef.current;
    if (!mount || !camera || !renderer || !pivot) return;

    const rect = mount.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;

    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const screenAspect = w / h;
    const imgAspect = imageAspectRef.current ?? imageAspect ?? screenAspect;

    // contain 방식: 이미지 비율 유지하면서 화면에 맞춤
    let PLANE_W: number;
    let PLANE_H: number;

    if (imgAspect > screenAspect) {
      // 이미지가 화면보다 더 넓음 -> 가로에 맞춤
      PLANE_W = 1.0;
      PLANE_H = PLANE_W / imgAspect;
    } else {
      // 이미지가 화면보다 더 높음 -> 세로에 맞춤
      PLANE_H = 1.0 / screenAspect;
      PLANE_W = PLANE_H * imgAspect;
    }

    planeWRef.current = PLANE_W;
    planeHRef.current = PLANE_H;

    const oldGeo = geoRef.current;
    const newGeo = new THREE.PlaneGeometry(PLANE_W, PLANE_H, segX, segY);
    geoRef.current = newGeo;
    basePosRef.current = new Float32Array((newGeo.attributes.position as THREE.BufferAttribute).array as Float32Array);

    if (frontMeshRef.current) frontMeshRef.current.geometry = newGeo;
    if (backMeshRef.current) backMeshRef.current.geometry = newGeo;

    if (oldGeo) oldGeo.dispose();

    camera.aspect = screenAspect;
    camera.updateProjectionMatrix();

    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const tanHalfVFov = Math.tan(vFov / 2);

    // 세로/가로 기준 거리 계산 후 더 큰 값 선택 (contain)
    const distV = PLANE_H / (2 * tanHalfVFov);
    const distH = PLANE_W / (2 * tanHalfVFov * screenAspect);
    const dist = Math.max(distV, distH);

    camera.position.set(0, 0, dist);
    camera.updateProjectionMatrix();

    applyHingeByDir();
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const rect = mount.getBoundingClientRect();
    const camera = new THREE.PerspectiveCamera(52, rect.width / rect.height, 0.01, 100);
    camera.position.set(0, 0, 2.15);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.78);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 0.48);
    key.position.set(1.6, 1.2, 2.4);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.22);
    fill.position.set(-1.2, 0.6, 1.4);
    scene.add(fill);

    const initGeo = new THREE.PlaneGeometry(1, 1, segX, segY);
    geoRef.current = initGeo;
    basePosRef.current = new Float32Array((initGeo.attributes.position as THREE.BufferAttribute).array as Float32Array);

    const pivot = new THREE.Group();
    pivotRef.current = pivot;
    scene.add(pivot);

    const matFront = new THREE.MeshStandardMaterial({
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.FrontSide,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const matBack = new THREE.MeshStandardMaterial({
      roughness: 0.97,
      metalness: 0.0,
      side: THREE.BackSide,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.015,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const frontMesh = new THREE.Mesh(initGeo, matFront);
    const backMesh = new THREE.Mesh(initGeo, matBack);

    frontMesh.position.z = 0.03;
    backMesh.position.z = 0.02;

    frontMeshRef.current = frontMesh;
    backMeshRef.current = backMesh;

    pivot.add(backMesh);
    pivot.add(frontMesh);

    loadTextureReady(frontUrl, (tex) => {
      matFront.map = tex;
      matFront.needsUpdate = true;
    }, true);

    loadTextureReady(backUrl, (tex) => {
      matBack.map = tex;
      matBack.needsUpdate = true;
    });

    layoutToScreen();

    let raf = 0;
    const render = () => {
      raf = requestAnimationFrame(render);
      renderer.render(scene, camera);
    };
    render();

    const onResize = () => layoutToScreen();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);

      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);

      geoRef.current?.dispose();
      matFront.dispose();
      matBack.dispose();

      texCacheRef.current.forEach((t) => t.dispose());
      texCacheRef.current.clear();
    };
  }, [loader]);

  useEffect(() => {
    const frontMesh = frontMeshRef.current;
    const backMesh = backMeshRef.current;
    if (!frontMesh || !backMesh) return;

    const matFront = frontMesh.material as THREE.MeshStandardMaterial;
    const matBack = backMesh.material as THREE.MeshStandardMaterial;

    loadTextureReady(frontUrl, (tex) => {
      matFront.map = tex;
      matFront.needsUpdate = true;
    }, true);

    if (!backUrl) {
      matBack.map = null;
      matBack.color.set(0x000000);
      matBack.needsUpdate = true;
      return;
    }

    loadTextureReady(backUrl, (tex) => {
      matBack.map = tex;
      matBack.needsUpdate = true;
    });
  }, [frontUrl, backUrl]);

  useEffect(() => {
    applyHingeByDir();
  }, [dir]);

  // imageAspect prop 변경 시 레이아웃 업데이트
  useEffect(() => {
    if (imageAspect && !imageAspectRef.current) {
      layoutToScreen();
    }
  }, [imageAspect]);

  useEffect(() => {
    const geo = geoRef.current;
    const pivot = pivotRef.current;
    const base = basePosRef.current;
    if (!geo || !pivot || !base) return;

    if (!enabled) {
      const pos = geo.attributes.position as THREE.BufferAttribute;
      (pos.array as Float32Array).set(base);
      pos.needsUpdate = true;
      pivot.rotation.set(0, 0, 0);
      geo.computeVertexNormals();
    }
  }, [enabled]);

  useEffect(() => {
    const geo = geoRef.current;
    const pivot = pivotRef.current;
    const base = basePosRef.current;
    if (!geo || !pivot || !base) return;
    if (!enabled) return;

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;

    const p = clamp01(progress);

    if (p <= 0.001) {
      arr.set(base);
      pos.needsUpdate = true;
      pivot.rotation.set(0, 0, 0);
      geo.computeVertexNormals();
      return;
    }

    const PLANE_W = planeWRef.current;
    const PLANE_H = planeHRef.current;

    const turnTheta = p * Math.PI * 0.96;
    pivot.rotation.y = dir === 1 ? -turnTheta : turnTheta;

    const gY = clamp(grabY, 0.02, 0.98);
    pivot.rotation.x = (0.5 - gY) * 0.30 * p;

    const halfW = PLANE_W / 2;
    const halfH = PLANE_H / 2;

    const grabYWorld = (0.5 - gY) * PLANE_H;

    const gX = clamp(grabX, 0.02, 0.98);
    const cornerBoost = dir === 1 ? clamp01(gX / 0.72) : clamp01((1 - gX) / 0.72);

    const radius = PLANE_W * (0.40 - 0.14 * cornerBoost) / strength;
    const theta = p * Math.PI;

    const sigma = PLANE_H * 0.24;
    const bendPow = 0.80;

    for (let i = 0; i < pos.count; i++) {
      const bi = i * 3;

      const x0 = base[bi + 0];
      const y0 = base[bi + 1];

      const dist = dir === 1 ? x0 + halfW : halfW - x0;
      const tBase = THREE.MathUtils.clamp(dist / PLANE_W, 0, 1);

      const yNorm = THREE.MathUtils.clamp((y0 - grabYWorld) / halfH, -1, 1);
      const ySkew = yNorm * 0.34 * p;
      const t = THREE.MathUtils.clamp(tBase + ySkew, 0, 1);

      const bend = Math.pow(t, bendPow);
      const localTheta = theta * bend;

      const zCyl = radius * (1 - Math.cos(localTheta));
      const dx = radius * Math.sin(localTheta);

      const xFromLeft = -halfW + (tBase * PLANE_W) - dx;
      const x = dir === 1 ? xFromLeft : -xFromLeft;

      const dy = y0 - grabYWorld;
      const bellyWeight = Math.exp(-(dy * dy) / (2 * sigma * sigma));

      const belly = bellyWeight * Math.sin(localTheta) * (PLANE_W * 0.36) * strength;
      const lift = Math.pow(t, 1.22) * Math.sin(localTheta) * (PLANE_W * 0.16) * strength;
      const twist = yNorm * Math.sin(localTheta) * (PLANE_W * 0.10) * strength;

      arr[bi + 0] = x;
      arr[bi + 1] = y0;
      arr[bi + 2] = zCyl + belly + lift + twist;
    }

    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }, [progress, dir, grabX, grabY, strength, enabled]);

  return <div ref={mountRef} className="absolute inset-0" style={{ width: "100%", height: "100%" }} />;
}
