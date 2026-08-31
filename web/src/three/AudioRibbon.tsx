/**
 * A 3D ribbon driven by live frequency data.
 *
 * This replaces the decorative orb the first iteration used. A blob that
 * wobbles when you talk is ornament; this shows the actual spectrum of your
 * voice scrolling through time, so it is a readable instrument as well as a
 * visual — you can see sibilants, vowels and silence as distinct shapes.
 *
 * How it works: FFT magnitudes are written into a data texture, one row per
 * frame, with a scrolling write cursor. The vertex shader samples that texture
 * to displace a plane. The CPU therefore uploads one row of bytes per frame
 * rather than recomputing ~16k vertex positions, which is what keeps it cheap
 * enough to run alongside speech recognition.
 */

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/** Frequency bins retained per frame. Matches the analyser's output size. */
const BINS = 64;

/** Frames of history in the ribbon. Higher is a longer visible tail. */
const HISTORY = 96;

const VERTEX_SHADER = /* glsl */ `
uniform sampler2D uSpectrum;
uniform float uCursor;
uniform float uAmplitude;
uniform float uTime;

varying float vHeight;
varying vec2 vUv;

void main() {
  vUv = uv;

  // uv.y walks back through history from the write cursor, so the ribbon
  // scrolls without ever moving the geometry itself.
  float row = fract(uCursor - uv.y);
  float magnitude = texture2D(uSpectrum, vec2(uv.x, row)).r;

  // Taper the edges so the ribbon fades into the page instead of ending on a
  // hard rectangular cut.
  float edgeFade = smoothstep(0.0, 0.12, uv.x) * smoothstep(1.0, 0.88, uv.x);
  float tailFade = smoothstep(0.0, 0.55, 1.0 - uv.y);

  float height = magnitude * uAmplitude * edgeFade * tailFade;
  vHeight = height;

  vec3 displaced = position;
  displaced.z += height;
  // A slow drift keeps the surface alive during silence without implying input.
  displaced.z += sin(uv.x * 8.0 + uTime * 0.6) * 0.012 * tailFade;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uInk;
uniform vec3 uAccent;
uniform float uLevel;

varying float vHeight;
varying vec2 vUv;

void main() {
  // Ink at rest, vermillion at the peaks: the accent appears only where there
  // is real signal, which is what makes it read as a meter.
  float intensity = clamp(vHeight * 3.2, 0.0, 1.0);
  vec3 colour = mix(uInk, uAccent, intensity);

  // Fade older history toward the paper so the tail recedes into the page.
  float age = smoothstep(0.05, 0.95, vUv.y);

  // The resting floor is deliberately near-invisible. At a higher baseline the
  // wireframe reads as a grey rug across the footer whenever nobody is
  // speaking; the grid should only materialise where there is signal.
  float alpha = (0.035 + intensity * 0.9) * (1.0 - age);

  if (alpha < 0.012) discard;
  gl_FragColor = vec4(colour, alpha);
}
`;

interface RibbonProps {
  /** Frequency magnitudes in [0, 1]. Length is resampled to BINS. */
  spectrum: Float32Array | null;
  /** Overall input level in [0, 1], used for the peak colour response. */
  level: number;
  /** Whether input is currently being captured. */
  active: boolean;
}

function Ribbon({ spectrum, level, active }: RibbonProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const cursor = useRef(0);
  const smoothedLevel = useRef(0);

  // One byte per bin per history row, single channel.
  const { texture, data } = useMemo(() => {
    const buffer = new Uint8Array(BINS * HISTORY);
    const tex = new THREE.DataTexture(buffer, BINS, HISTORY, THREE.RedFormat);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    // Repeat on Y so the scrolling cursor wraps seamlessly.
    tex.wrapT = THREE.RepeatWrapping;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return { texture: tex, data: buffer };
  }, []);

  const uniforms = useMemo(
    () => ({
      uSpectrum: { value: texture },
      uCursor: { value: 0 },
      uAmplitude: { value: 0.9 },
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uInk: { value: new THREE.Color('#14130e') },
      uAccent: { value: new THREE.Color('#cf3a17') },
    }),
    [texture],
  );

  useFrame((state, delta) => {
    const material = materialRef.current;
    if (!material) return;

    const smoothing = 1 - Math.exp(-delta * 10);
    smoothedLevel.current += (level - smoothedLevel.current) * smoothing;

    // Advance the write cursor and stamp the newest spectrum row.
    const row = Math.floor(cursor.current * HISTORY) % HISTORY;
    const offset = row * BINS;

    if (active && spectrum && spectrum.length > 0) {
      const step = spectrum.length / BINS;
      for (let bin = 0; bin < BINS; bin += 1) {
        const sample = spectrum[Math.floor(bin * step)] ?? 0;
        data[offset + bin] = Math.min(255, Math.max(0, sample * 255));
      }
    } else {
      // Decay toward the baseline rather than snapping to zero, so stopping
      // capture looks like the signal falling away.
      for (let bin = 0; bin < BINS; bin += 1) {
        data[offset + bin] = Math.max(0, (data[offset + bin] ?? 0) * 0.82 - 2);
      }
    }

    texture.needsUpdate = true;
    cursor.current = (cursor.current + delta * 0.9) % 1;

    material.uniforms.uCursor!.value = cursor.current;
    material.uniforms.uTime!.value = state.clock.elapsedTime;
    material.uniforms.uLevel!.value = smoothedLevel.current;
    material.uniforms.uAmplitude!.value = 0.55 + smoothedLevel.current * 0.9;
  });

  return (
    // Tilted back just enough to give the surface depth. An earlier pass laid
    // it almost edge-on, which collapsed the whole ribbon into a flat wedge.
    <mesh rotation={[-1.06, 0, 0]} position={[0, -0.1, 0]}>
      {/* Segment counts are decoupled from BINS/HISTORY on purpose. The shader
          samples the spectrum texture continuously, so the mesh only needs
          enough resolution to render the shape — matching the full 64x96 grid
          made the wireframe so dense it read as solid grey at rest. */}
      <planeGeometry args={[7.2, 3.0, 44, 30]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        // Wireframe: on a paper ground a solid surface reads as a grey smear,
        // while a mesh of lines reads as an instrument trace.
        wireframe
      />
    </mesh>
  );
}

export interface AudioRibbonSceneProps {
  spectrum: Float32Array | null;
  level: number;
  active: boolean;
}

/** The ribbon scene, mounted inside a Canvas by `RibbonStage`. */
export function AudioRibbonScene({ spectrum, level, active }: AudioRibbonSceneProps) {
  return (
    <>
      <Ribbon spectrum={spectrum} level={level} active={active} />
    </>
  );
}
