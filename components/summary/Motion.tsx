/**
 * The Summary's two motion moments: the bridge bars grow in sequence from the running total, and the
 * rings draw their arc once. Transform, opacity and the ring's dash only. With reduced motion, or
 * before the CSS loads, everything sits at its final state.
 */
export function SummaryMotion() {
  return (
    <style>{`
      @keyframes pg-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      @keyframes pg-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
      @keyframes pg-draw { from { stroke-dasharray: 0 390; } }
      .pg-grow { animation: pg-grow 260ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
      .pg-fade { animation: pg-fade 260ms ease-out both; }
      .pg-ring svg circle + circle { animation: pg-draw 900ms cubic-bezier(0.3, 0.6, 0.2, 1) 120ms both; }
      @media (prefers-reduced-motion: reduce) {
        .pg-grow, .pg-fade, .pg-ring svg circle + circle { animation: none; }
      }
    `}</style>
  );
}
