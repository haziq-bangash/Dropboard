"use client";

import { ArrowUp, Plus } from "lucide-react";
import { useEffect, useState } from "react";

const PROMPTS = [
  "Which region had the highest revenue last quarter?",
  "Show monthly orders and the average order value",
  "Top 10 products by revenue",
  "How many customers ordered more than once?",
  "Which day of the week sells the most?",
  "Compare ad spend with sales by channel",
];

const ROW = 80; // px height of one prompt row
const INTERVAL = 2800; // ms each prompt stays active
const SLIDE = 700; // ms for the slide between prompts
const N = PROMPTS.length;

// Two rows above and three below the active one are repeated at the ends, so the loop wraps
// without a visible jump: index N looks exactly like index 0.
const ITEMS = [...PROMPTS.slice(-2), ...PROMPTS, ...PROMPTS.slice(0, 3)];

/**
 * Decorative: example questions scroll by, and the active one sits in an input-style pill.
 * The same list is drawn twice (faded in the background, and in color inside the pill) and both move together.
 * Stops advancing when the visitor prefers reduced motion.
 */
export function PromptCarousel() {
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(true);

  // A timer is a subscription to the outside world, so this is the one effect the carousel needs.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((i) => (i >= N ? i : i + 1)), INTERVAL);
    return () => clearInterval(id);
  }, []);

  // After sliding onto the repeated copy of the first prompt, jump back to the real one without animating.
  function wrapAround() {
    if (index !== N) return;
    setAnimate(false);
    setIndex(0);
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
  }

  const transition = animate ? `transform ${SLIDE}ms cubic-bezier(0.4, 0, 0.2, 1)` : "none";

  return (
    <div className="relative mx-auto mt-12 w-full max-w-3xl px-5" data-testid="prompt-carousel" data-index={index % N}>
      {/* screen readers get the list once, plainly */}
      <ul className="sr-only">
        {PROMPTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <div aria-hidden="true" className="relative h-[400px]">
        {/* faded background list */}
        <div className="absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_30%,black_70%,transparent)]">
          <div
            style={{ transform: `translateY(${-index * ROW}px)`, transition }}
            onTransitionEnd={(e) => e.target === e.currentTarget && wrapAround()}
          >
            {ITEMS.map((p, i) => (
              <div key={i} className="flex items-center px-8 text-xl font-medium text-background/40" style={{ height: ROW }}>
                {p}
              </div>
            ))}
          </div>
        </div>

        {/* active pill, centered on the third row */}
        <div className="absolute inset-x-0 flex items-center gap-3 rounded-full bg-background px-3 shadow-xl ring-1 ring-black/5" style={{ top: ROW * 2, height: ROW }}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
            <Plus className="size-5" />
          </span>
          <div className="relative h-full flex-1 overflow-hidden">
            <div style={{ transform: `translateY(${-(index + 2) * ROW}px)`, transition }}>
              {ITEMS.map((p, i) => (
                <div key={i} className="flex items-center truncate text-xl font-medium text-primary" style={{ height: ROW }}>
                  {p}
                </div>
              ))}
            </div>
          </div>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm">
            <ArrowUp className="size-5" />
          </span>
        </div>
      </div>
    </div>
  );
}
