import type { ReactNode } from "react";

// ======================================================================
// GuideBubble ―  各ステップでポメちゃんが操作を案内する吹き出し
// ======================================================================

interface Props {
  children: ReactNode;
}

export default function GuideBubble({ children }: Props) {
  return (
    <div className="v2-guide-bubble">
      <div className="v2-guide-bubble-avatar">
        <img src="/stamp-v2-guide/pomeranian.png" alt="ガイドのポメちゃん" />
      </div>
      <div className="v2-guide-bubble-text">{children}</div>
    </div>
  );
}
