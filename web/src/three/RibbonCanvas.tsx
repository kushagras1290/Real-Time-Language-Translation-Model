/**
 * The WebGL canvas for the audio ribbon, split out so it can be code-split.
 *
 * three.js is larger than the rest of the application combined, so it is loaded
 * lazily and never fetched at all on machines that fall back to the 2D meter.
 */

import { Canvas } from '@react-three/fiber';

import { AudioRibbonScene, type AudioRibbonSceneProps } from './AudioRibbon';

export default function RibbonCanvas({ spectrum, level, active }: AudioRibbonSceneProps) {
  return (
    <Canvas
      // Looking slightly down at the surface as it recedes into the page.
      camera={{ position: [0, 1.15, 2.05], fov: 46 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ background: 'transparent' }}
    >
      <AudioRibbonScene spectrum={spectrum} level={level} active={active} />
    </Canvas>
  );
}
