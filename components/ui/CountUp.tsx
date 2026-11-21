'use client';

/**
 * A figure that counts up to its value once, when it first appears. The server renders the final
 * text, so without JavaScript, with reduced motion, or for a screen reader it is simply the number.
 * Keeps the figure's own format: its decimals and thousands separators.
 */
import { useEffect, useState } from 'react';

const MS = 900;

export function CountUp({ text }: { text: string }) {
  const [shown, setShown] = useState(text);

  useEffect(() => {
    const target = Number(text.replace(/,/g, ''));
    if (!Number.isFinite(target) || target === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const decimals = text.split('.')[1]?.length ?? 0;
    const format = (v: number) =>
      v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / MS);
      const eased = 1 - (1 - t) ** 3;
      setShown(t < 1 ? format(target * eased) : text);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [text]);

  return (
    <>
      <span aria-hidden="true" className="tabular-nums">
        {shown}
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}
