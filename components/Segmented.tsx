"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type Option<T extends string> = { value: T; label: string };

// Pill-shaped switch with a "bubble" that glides to the selected option (styles: .seg in globals.css).
export default function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  fullWidth = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  label: string;
  fullWidth?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const buttons = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const [animate, setAnimate] = useState(false); // stay still on first paint, glide afterwards

  const measure = useCallback(() => {
    const el = buttons.current.get(value);
    if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value]);

  useLayoutEffect(measure, [measure, options]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Fonts loading or the window resizing change button widths, so re-measure.
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div className={`seg${fullWidth ? " seg-full" : ""}${animate ? " seg-ready" : ""}`} role="group" aria-label={label} ref={wrap}>
      {thumb && <span className="seg-thumb" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} aria-hidden />}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="seg-btn"
          aria-pressed={value === o.value}
          ref={(el) => {
            if (el) buttons.current.set(o.value, el);
            else buttons.current.delete(o.value);
          }}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
