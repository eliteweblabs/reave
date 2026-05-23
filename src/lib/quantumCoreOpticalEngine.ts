/**
 * Port of "QUANTUM CORE: OPTICAL ENGINE" (Three.js + postprocessing).
 * Original pen: https://codepen.io/Justin-Ross-Rythorian/pen/MYegaEO (MIT)
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { FilmPass } from "three/examples/jsm/postprocessing/FilmPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export function attachQuantumCoreOpticalEngine(host: HTMLElement): () => void {
  const prefersReduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** ~50% smaller on-screen than the original pen, with a wider FOV so the view still spans the logo mask. */
  const VIEW_Z = 16.6;
  const VIEW_FOV = 60;
  const CORE_VIS_SCALE = 0.46;
  const PARTICLE_VIS_SCALE = 0.5;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);
  scene.fog = new THREE.FogExp2(0x000000, 0.018);

  const camera = new THREE.PerspectiveCamera(
    VIEW_FOV,
    window.innerWidth / Math.max(1, window.innerHeight),
    0.1,
    100,
  );
  camera.position.z = VIEW_Z;

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  host.appendChild(renderer.domElement);

  const noiseVertex = `
    varying vec2 vUv; varying vec3 vNormal; varying vec3 vPos;
    uniform float uTime; uniform float uSpike;
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) {
      const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
      const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy) );
      vec3 x0 = v - i + dot(i, C.xxx) ;
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min( g.xyz, l.zxy );
      vec3 i2 = max( g.xyz, l.zxy );
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute( permute( permute(
                  i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
      float n_ = 0.142857142857;
      vec3  ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_ );
      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4( x.xy, y.xy );
      vec4 b1 = vec4( x.zw, y.zw );
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a0.zw,h.y);
      vec3 p2 = vec3(a1.xy,h.z);
      vec3 p3 = vec3(a1.zw,h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    }
    void main() {
      vUv = uv; vNormal = normalize(normalMatrix * normal);
      float n = snoise(position * 2.5 + uTime * 0.5);
      float pulse = sin(uTime * 4.0) * 0.05;
      vec3 newPos = position + normal * (n * uSpike + pulse);
      vPos = newPos;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
    }
  `;

  const plasmaFragment = `
    uniform vec3 uColorA; uniform vec3 uColorB; uniform float uTime;
    varying vec3 vNormal; varying vec3 vPos;
    void main() {
      vec3 viewDir = normalize(cameraPosition - vPos);
      float fresnel = dot(viewDir, vNormal);
      fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
      fresnel = pow(fresnel, 2.0);
      float scan = sin(vPos.y * 50.0 + uTime * 5.0) * 0.05;
      vec3 color = mix(uColorA, uColorB, fresnel + scan);
      color += uColorB * fresnel * 2.5;
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const sphereGeo = new THREE.IcosahedronGeometry(1.6, 64);
  const sphereMat = new THREE.ShaderMaterial({
    vertexShader: noiseVertex,
    fragmentShader: plasmaFragment,
    uniforms: {
      uTime: { value: 0 },
      uSpike: { value: 0.2 },
      uColorA: { value: new THREE.Color("#000000") },
      uColorB: { value: new THREE.Color("#00f3ff") },
    },
  });
  const core = new THREE.Mesh(sphereGeo, sphereMat);
  core.scale.setScalar(CORE_VIS_SCALE);
  scene.add(core);

  const particleCount = 4000;
  const particlesGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const r = 2.5 + Math.random() * 8;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * 0.5;
    positions[i * 3] = r * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi);
    positions[i * 3 + 2] = r * Math.sin(theta);
  }
  particlesGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const particlesMat = new THREE.PointsMaterial({
    size: 0.056,
    color: 0x00f3ff,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
  });
  const particles = new THREE.Points(particlesGeo, particlesMat);
  particles.scale.setScalar(PARTICLE_VIS_SCALE);
  scene.add(particles);

  const AdvancedLensShader = {
    uniforms: {
      tDiffuse: { value: null },
      uAberration: { value: 0.005 },
      uDistortion: { value: 0.2 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uAberration;
      uniform float uDistortion;
      varying vec2 vUv;

      vec2 distort(vec2 uv, float k) {
        vec2 centered = uv - 0.5;
        float r2 = dot(centered, centered);
        float f = 1.0 + r2 * (k + k * sqrt(r2));
        return f * centered + 0.5;
      }

      void main() {
        vec2 uv = vUv;
        vec2 rUv = distort(uv, uDistortion - uAberration);
        vec2 gUv = distort(uv, uDistortion);
        vec2 bUv = distort(uv, uDistortion + uAberration);
        float r = texture2D(tDiffuse, rUv).r;
        float g = texture2D(tDiffuse, gUv).g;
        float b = texture2D(tDiffuse, bUv).b;
        float mask = 1.0;
        if(rUv.x < 0.0 || rUv.x > 1.0 || rUv.y < 0.0 || rUv.y > 1.0) mask = 0.0;
        if(bUv.x < 0.0 || bUv.x > 1.0 || bUv.y < 0.0 || bUv.y > 1.0) mask = 0.0;
        gl_FragColor = vec4(r, g, b, 1.0) * mask;
      }
    `,
  };

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,
    0.4,
    0.85,
  );
  bloomPass.threshold = 0;
  bloomPass.strength = 1.3;
  bloomPass.radius = 0.6;
  composer.addPass(bloomPass);

  const filmPass = new FilmPass(0.5, 0.05, 648, false);
  composer.addPass(filmPass);

  const lensPass = new ShaderPass(AdvancedLensShader);
  lensPass.uniforms.uAberration.value = 0.005;
  lensPass.uniforms.uDistortion.value = 0.15;
  composer.addPass(lensPass);

  let targetSpike = 0.2;
  const targetColor = new THREE.Color(0x00f3ff);
  let particleSpeedMult = 1.0;
  let shakeIntensity = 0;
  let mouseX = 0;
  let mouseY = 0;

  /** Subtle look-parallax; clamped so the core cannot slide off-camera (read as “chopped”). */
  const onMouseMove = (e: MouseEvent) => {
    mouseX = (e.clientX - window.innerWidth / 2) * 0.00022;
    mouseY = (e.clientY - window.innerHeight / 2) * 0.00022;
  };
  document.addEventListener("mousemove", onMouseMove);

  function triggerShake(amt: number) {
    shakeIntensity = amt;
  }

  const btnStabilize = document.getElementById("btn-stabilize");
  const btnDestabilize = document.getElementById("btn-destabilize");
  const btnReset = document.getElementById("btn-reset");

  const onStabilize = () => {
    targetSpike = 0.1;
    targetColor.set("#00f3ff");
    bloomPass.strength = 1.3;
    particleSpeedMult = 0.5;
    lensPass.uniforms.uAberration.value = 0.002;
    lensPass.uniforms.uDistortion.value = 0.05;
    triggerShake(0.1);
  };

  const onDestabilize = () => {
    targetSpike = 1.2;
    targetColor.set("#ff0055");
    bloomPass.strength = 2.8;
    particleSpeedMult = 8.0;
    triggerShake(0.5);
    lensPass.uniforms.uDistortion.value = 0.6;
    lensPass.uniforms.uAberration.value = 0.04;
  };

  const onReset = () => {
    targetSpike = 0.3;
    targetColor.set("#bc13fe");
    bloomPass.strength = 1.6;
    particleSpeedMult = 1.0;
    lensPass.uniforms.uAberration.value = 0.005;
    lensPass.uniforms.uDistortion.value = 0.15;
    triggerShake(0.2);
  };

  btnStabilize?.addEventListener("click", onStabilize);
  btnDestabilize?.addEventListener("click", onDestabilize);
  btnReset?.addEventListener("click", onReset);

  /** Auto-drive Focus ↔ Warp transitions (same as button handlers). */
  const FOCUS_WARP_CYCLE_MS = 3500;
  let focusWarpIntervalId: number | undefined;
  let nextAutoIsWarp = true;
  if (!prefersReduced) {
    focusWarpIntervalId = window.setInterval(() => {
      if (nextAutoIsWarp) onDestabilize();
      else onStabilize();
      nextAutoIsWarp = !nextAutoIsWarp;
    }, FOCUS_WARP_CYCLE_MS);
  }

  const clock = new THREE.Clock();
  let raf = 0;
  let alive = true;
  const motionScale = prefersReduced ? 0.2 : 1;

  function animate() {
    if (!alive) return;
    raf = requestAnimationFrame(animate);
    const t = clock.getElapsedTime() * motionScale;

    sphereMat.uniforms.uTime.value = t;
    sphereMat.uniforms.uSpike.value +=
      (targetSpike - sphereMat.uniforms.uSpike.value) * 0.05 * motionScale;
    sphereMat.uniforms.uColorB.value.lerp(targetColor, 0.05 * motionScale);

    particles.rotation.y = -t * 0.1 * particleSpeedMult * motionScale;
    particlesMat.color.lerp(targetColor, 0.05 * motionScale);

    shakeIntensity *= 0.9;
    const shakeX = (Math.random() - 0.5) * shakeIntensity;
    const shakeY = (Math.random() - 0.5) * shakeIntensity;

    const parallaxAmp = prefersReduced ? 0.85 : 1.55;
    const parallaxLerp = 0.038 * Math.max(motionScale, 0.35);
    camera.position.x +=
      (mouseX * parallaxAmp - camera.position.x) * parallaxLerp + shakeX;
    camera.position.y +=
      (-mouseY * parallaxAmp - camera.position.y) * parallaxLerp + shakeY;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -0.38, 0.38);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, -0.38, 0.38);
    camera.position.z = VIEW_Z;
    camera.lookAt(scene.position);

    if (
      lensPass.uniforms.uDistortion.value > 0.15 &&
      targetColor.getHexString() !== "ff0055"
    ) {
      lensPass.uniforms.uDistortion.value +=
        (0.15 - lensPass.uniforms.uDistortion.value) * 0.05 * motionScale;
      lensPass.uniforms.uAberration.value +=
        (0.005 - lensPass.uniforms.uAberration.value) * 0.05 * motionScale;
    }

    composer.render();
  }

  const onResize = () => {
    const h = Math.max(1, window.innerHeight);
    camera.aspect = window.innerWidth / h;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  raf = requestAnimationFrame(animate);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("mousemove", onMouseMove);
    btnStabilize?.removeEventListener("click", onStabilize);
    btnDestabilize?.removeEventListener("click", onDestabilize);
    btnReset?.removeEventListener("click", onReset);

    if (focusWarpIntervalId !== undefined) {
      window.clearInterval(focusWarpIntervalId);
    }
    sphereGeo.dispose();
    sphereMat.dispose();
    particlesGeo.dispose();
    particlesMat.dispose();
    composer.dispose();
    renderer.dispose();
    if (renderer.domElement.parentElement === host) {
      host.removeChild(renderer.domElement);
    }
  };
}
