// A chart takes its container's full width (§2.2 Charts): it measures the box
// it sits in and lays out to that many pixels, so its type stays at its true
// size rather than stretching with a viewBox. The width is read before the
// first paint and again whenever the box resizes; 0 means not yet measured.
// It reads the laid-out width, not the painted one, so a chart that mounts
// inside something still scaling in (a popover opening) lays out to the size it
// will rest at.
//
// The box is whichever element the returned ref is on, whenever it mounts: a
// chart that first renders its loading shape, with no box, and draws once its
// answers land later, is measured then (the live app's order, which the
// stories' immediate fixtures never showed).
import { useLayoutEffect, useState } from 'react';

export function useWidth<T extends HTMLElement>() {
  const [element, ref] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!element) return undefined;
    const read = () => setWidth(Math.floor(parseFloat(getComputedStyle(element).width)) || 0);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [ref, width] as const;
}
