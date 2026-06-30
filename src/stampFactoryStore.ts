// スタンプ量産工房の台帳ストア（localStorage）。
// 無料・ローカル完結。将来 Cloudflare KV(Worker) へ差し替え可能なよう、
// 入出力を Project[] のロード/セーブに集約している。

import type { Project, ProjectStatus, StampSlot } from "./stampFactoryData";
import { STATUS_FLOW } from "./stampFactoryData";

const STORAGE_KEY = "aiko_stamp_factory_projects_v1";

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asStatus(v: unknown): ProjectStatus {
  return STATUS_FLOW.includes(v as ProjectStatus) ? (v as ProjectStatus) : "idea";
}

// 1スロットを検証・補完（壊れ/旧スキーマでも落ちないように）
function normalizeSlot(raw: unknown, index: number): StampSlot | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  return {
    id: typeof r.id === "number" ? r.id : index + 1,
    category: asString(r.category),
    usage: asString(r.usage),
    prompt: asString(r.prompt),
    done: r.done === true,
    edited: r.edited === true, // 旧データには無いので false 補完
  };
}

// 1案件を検証・補完。最低限 id があれば採用、無ければ捨てる。
function normalizeProject(raw: unknown): Project | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  const slotsRaw = Array.isArray(r.slots) ? r.slots : [];
  const slots = slotsRaw
    .map((s, i) => normalizeSlot(s, i))
    .filter((s): s is StampSlot => s !== null);
  const now = Date.now();
  return {
    id: r.id,
    niche: asString(r.niche),
    audience: asString(r.audience),
    character: asString(r.character),
    note: asString(r.note),
    status: asStatus(r.status),
    slots,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : now,
  };
}

// 任意の値（JSON/外部import）を安全に Project[] へ
export function normalizeProjects(data: unknown): Project[] {
  if (!Array.isArray(data)) return [];
  return data.map(normalizeProject).filter((p): p is Project => p !== null);
}

function safeParse(raw: string | null): Project[] {
  if (!raw) return [];
  try {
    return normalizeProjects(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

// 外部JSON文字列をimport（検証込み）。失敗時は null。
export function importProjectsJson(json: string): Project[] | null {
  try {
    const parsed = normalizeProjects(JSON.parse(json));
    return parsed;
  } catch {
    return null;
  }
}

export function saveProjects(projects: Project[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

// 簡易ID（crypto.randomUUID が無い環境向けフォールバック付き）
export function newId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `p_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// JSON書き出し（バックアップ/別PC移行用）
export function exportProjectsJson(projects: Project[]): string {
  return JSON.stringify(projects, null, 2);
}
