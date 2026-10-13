// A chart takes its container's full width (§2.2 Charts): it measures the box
// it sits in and lays out to that many pixels, so its type stays at its true
// size rather than stretching with a viewBox. The width is read before the
// first paint and again whenever the box resizes; 0 means not yet measured.
import { useLayoutEffect, useRef, useState } from 'react';

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const read = () => setWidth(Math.floor(element.getBoundingClientRect().width));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
