"""イージングと、LINE仕様に合わせたタイムライン。"""
from __future__ import annotations

import math

# LINE Creators Market（ポップアップ／エフェクト）: 5〜20フレーム、1〜3ループ、合計3秒以内
MAX_FRAMES = 20
MAX_TOTAL_MS = 3000


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease_out_cubic(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_out_back(x, s=2.2):
    x = clamp(x)
    x -= 1
    return 1 + (s + 1) * x ** 3 + s * x ** 2


def ease_out_elastic(x):
    x = clamp(x)
    if x in (0, 1):
        return x
    return 2 ** (-10 * x) * math.sin((x * 10 - 0.75) * (2 * math.pi) / 3) + 1


def ease_out_bounce(x):
    x = clamp(x)
    n, d = 7.5625, 2.75
    if x < 1 / d:
        return n * x * x
    if x < 2 / d:
        x -= 1.5 / d
        return n * x * x + 0.75
    if x < 2.5 / d:
        x -= 2.25 / d
        return n * x * x + 0.9375
    x -= 2.625 / d
    return n * x * x + 0.984375


def tri(x):
    """0→1→0 の三角波（周期1）。"""
    x %= 1.0
    return 1 - abs(2 * x - 1)


class PopupTimeline:
    """ポップアップ: 1回再生。前半を速いコマで「飛び出し」、後半はゆったり動かす。

    既定: 登場6コマ×60ms + 動き14コマ×110ms + 最終コマ+300ms 余韻 = 約2.2秒
    """

    def __init__(self, intro_frames=6, intro_ms=60, idle_frames=14, idle_ms=110, hold_ms=300):
        self.intro_frames = intro_frames
        self.delays = [intro_ms] * intro_frames + [idle_ms] * idle_frames
        self.delays[-1] += hold_ms
        self.intro_s = intro_frames * intro_ms / 1000
        self.loops = 1
        assert len(self.delays) <= MAX_FRAMES and sum(self.delays) <= MAX_TOTAL_MS

    def __iter__(self):
        t = 0.0
        for i, d in enumerate(self.delays):
            if i < self.intro_frames:
                q = (i + 1) / self.intro_frames
            else:
                q = 1.0
            yield i, t, q
            t += d / 1000


class LoopTimeline:
    """エフェクト: つなぎ目のないループ。既定 14コマ×100ms = 1.4秒 ×2ループ = 2.8秒。

    ポップアップの「登場後の動き」と同じコマ撮りのリズム。コマ数を抑えて大きな粒でも1MB以内に収める。
    """

    def __init__(self, frames=14, ms=100, loops=2):
        self.delays = [ms] * frames
        self.loops = loops
        self.period_s = frames * ms / 1000
        assert frames <= MAX_FRAMES and sum(self.delays) * loops <= MAX_TOTAL_MS

    def __iter__(self):
        n = len(self.delays)
        for i in range(n):
            yield i, i / n
