/**
 * Hosts the audio ribbon, with a canvas fallback.
 *
 * WebGL is not guaranteed — corporate policy blocks it, headless browsers lack
 * it, GPU drivers crash. The fallback is a 2D canvas spectrum drawn in the same
 * palette, so the meter keeps working rather than leaving a dead rectangle.
 */

import { Suspense, lazy, useEffect, useRef, useState } from 'react';

const RibbonCanvas = lazy(() => import('../three/RibbonCanvas'));

interface RibbonStageProps {
  spectrum: Float32Array | null;
  level: number;
  active: boolean;
}

/** Detect WebGL support once. */
function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** 2D spectrum bars, used when WebGL is unavailable or motion is reduced. */
function FallbackMeter({ spectrum, active }: RibbonStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const ink = getComputedStyle(document.documentElement)
      .getPropertyValue('--ink')
      .trim();
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent')
      .trim();

    function draw() {
      const element = canvasRef.current;
      if (!element || !context) return;

      // Match the backing store to the display size so bars stay crisp on
      // high-DPI screens.
      const ratio = window.devicePixelRatio || 1;
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (element.width !== width * ratio || element.height !== height * ratio) {
        element.width = width * ratio;
        element.height = height * ratio;
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const bins = spectrum?.length ?? 0;
      if (!bins || !active) {
        context.fillStyle = ink;
        context.globalAlpha = 0.14;
        context.fillRect(0, height - 1, width, 1);
        context.globalAlpha = 1;
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const barWidth = width / bins;
      for (let i = 0; i < bins; i += 1) {
        const magnitude = spectrum?.[i] ?? 0;
        const barHeight = Math.max(1, magnitude * height * 0.92);
        context.fillStyle = magnitude > 0.45 ? accent : ink;
        context.globalAlpha = 0.18 + magnitude * 0.72;
        context.fillRect(
          i * barWidth,
          height - barHeight,
          Math.max(1, barWidth - 1.5),
          barHeight,
        );
      }
      context.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [spectrum, active]);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}

export function RibbonStage(props: RibbonStageProps) {
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setWebglAvailable(detectWebGL());
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  if (webglAvailable === null || !webglAvailable || reducedMotion) {
    return <FallbackMeter {...props} />;
  }

  return (
    <Suspense fallback={<FallbackMeter {...props} />}>
      <RibbonCanvas {...props} />
    </Suspense>
  );
}
