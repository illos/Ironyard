import { useCallback, useEffect, useRef } from 'react';

// Minimal touch-and-mouse long-press hook. Returns spread-able event handlers.
// Right-click on desktop also fires the long-press action so power users have
// a fast path that doesn't require holding the mouse button.

type LongPressHandlers = {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchMove: () => void;
  onTouchCancel: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
};

export function useLongPress(onLongPress: () => void, ms = 500): LongPressHandlers {
  const timerRef = useRef<number | null>(null);
  const triggeredRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const start = useCallback(() => {
    triggeredRef.current = false;
    clear();
    timerRef.current = window.setTimeout(() => {
      triggeredRef.current = true;
      onLongPress();
    }, ms);
  }, [clear, onLongPress, ms]);

  return {
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: clear,
    onTouchCancel: clear,
    onMouseDown: (e) => {
      // Only left button starts a long-press (right-click handles below).
      if (e.button === 0) start();
    },
    onMouseUp: clear,
    onMouseLeave: clear,
    onContextMenu: (e) => {
      e.preventDefault();
      clear();
      onLongPress();
    },
  };
}
