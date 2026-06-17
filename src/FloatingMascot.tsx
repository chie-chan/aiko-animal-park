import { type PointerEvent, useEffect, useRef, useState } from "react";

interface Props {
  tipsByStep: Record<number, string[]>;
  currentStep: number;
}

const MASCOT_SIZE = 110;
const MASCOT_MARGIN = 26;
const BOTTOM_BAR_OFFSET = 70;

function defaultMascotPosition() {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return {
    x: Math.max(8, window.innerWidth - MASCOT_SIZE - MASCOT_MARGIN),
    y: Math.max(70, window.innerHeight - MASCOT_SIZE - MASCOT_MARGIN - BOTTOM_BAR_OFFSET),
  };
}

function clampMascotPosition(x: number, y: number) {
  if (typeof window === "undefined") return { x, y };
  return {
    x: Math.max(8, Math.min(window.innerWidth - MASCOT_SIZE, x)),
    y: Math.max(70, Math.min(window.innerHeight - MASCOT_SIZE, y)),
  };
}

export default function FloatingMascot({ tipsByStep, currentStep }: Props) {
  const [pos, setPos] = useState(defaultMascotPosition);
  const [showTip, setShowTip] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const userMovedRef = useRef(false);

  const tips = tipsByStep[currentStep] || [];

  useEffect(() => {
    setPos(defaultMascotPosition());
  }, []);

  useEffect(() => {
    function handleResize() {
      setPos((current) => (userMovedRef.current ? clampMascotPosition(current.x, current.y) : defaultMascotPosition()));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setTipIndex(0);
    setShowTip(true);
    const timer = window.setTimeout(() => setShowTip(false), 6000);
    return () => window.clearTimeout(timer);
  }, [currentStep]);

  function startDrag(e: PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    };
  }

  function onDragMove(e: PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    setPos(clampMascotPosition(dragRef.current.origX + dx, dragRef.current.origY + dy));
  }

  function endDrag() {
    if (!dragRef.current) return;
    const wasClick = !dragRef.current.moved;
    if (dragRef.current.moved) userMovedRef.current = true;
    dragRef.current = null;

    if (!wasClick) return;
    if (showTip) {
      if (tipIndex < tips.length - 1) {
        setTipIndex((index) => index + 1);
      } else {
        setShowTip(false);
        setTipIndex(0);
      }
      return;
    }
    setShowTip(true);
    setTipIndex(0);
  }

  if (hidden) {
    return (
      <button
        type="button"
        className="v2-mascot-revive"
        onClick={() => setHidden(false)}
        aria-label="ガイドを戻す"
        title="ガイドを戻す"
      >
        ?
      </button>
    );
  }

  return (
    <div className="v2-mascot" style={{ left: pos.x, top: pos.y }}>
      {showTip && tips.length > 0 && (
        <div className="v2-mascot-bubble">
          <button
            type="button"
            className="v2-mascot-bubble-close"
            onClick={(e) => {
              e.stopPropagation();
              setShowTip(false);
            }}
            aria-label="ヒントを閉じる"
          >
            x
          </button>
          <div className="v2-mascot-bubble-text">{tips[tipIndex]}</div>
          <div className="v2-mascot-bubble-foot">
            <span className="v2-mascot-bubble-counter">
              {tipIndex + 1} / {tips.length}
            </span>
            {tipIndex < tips.length - 1 && (
              <span className="v2-mascot-bubble-hint">クリックで次のヒントへ</span>
            )}
          </div>
        </div>
      )}
      <div
        className="v2-mascot-avatar"
        onPointerDown={startDrag}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img src="/stamp-v2-guide/pomeranian.png" alt="ガイドのポメちゃん" draggable={false} />
      </div>
      <button
        type="button"
        className="v2-mascot-hide"
        onClick={() => setHidden(true)}
        aria-label="ガイドを隠す"
        title="ガイドを隠す"
      >
        -
      </button>
    </div>
  );
}
