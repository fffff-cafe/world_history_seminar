// スライドをページ単位で Jev (TypeSafe Noul / Choice) にタグ付けさせ、tags/<document>.json に保存する。
// 人手修正はレコードの `manual` に HistoryTags を書く。manual があるページは --force 以外で再処理しない。
// 通常実行はタグ付け済みファイルをスキップ。変更ページの再タグ付けはファイル指定 (pnpm tag -- slides/x.md) か --force で。
import crypto from "crypto"
import fs from "fs"
import path from "path"
import { globSync } from "glob"
import {
  CANDIDATE_CRITERIA, CANDIDATE_INSTRUCTIONS, HistoryTags, MODEL, NONE, NOUL_QUESTIONS, NoulAxis,
  PERIOD_QUESTIONS, PERIODS, TAG_SCHEMA_VERSION, buildState,
} from "./schema"

const API_URL = "https://api.typesafe.ai/v1/systemone"
const TAGS_DIR = "tags"
const ERROR_LOG = path.join(TAGS_DIR, "_errors.jsonl")
const CONCURRENCY = 4
// 「明らかな場合のみ」付与するため Noul は yes 確率 0.7 以上、Choice は選ばれた選択肢の確率 0.5 以上で採用
const NOUL_THRESHOLD = 0.7
const CHOICE_THRESHOLD = 0.5
const MAX_CANDIDATES = 30

export type Page = {
  id: string
  page: number // Marp のスライド番号 (1始まり、空ページも数える)
  hash: string
  document: string
  chapter: string
  title: string
  context: string
  content: string
}

export type TaggingRecord = {
  page_id: string
  content_hash: string
  tag_schema_version: string
  tags: HistoryTags
  manual?: HistoryTags
  processed_at: string
  model?: string
}

type Store = Record<string, TaggingRecord>

type ChoiceAnswer = { type: "choice"; choice: string; probabilities: Record<string, number> }
type Answers = Record<string, { type?: string; choice?: unknown; probabilities?: unknown; noul?: unknown }>

export const normalize = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim()
const uniq = (xs: string[]) => [...new Set(xs.map(normalize).filter(Boolean))]
const slug = (s: string) => normalize(s).replace(/[\s/#?]+/g, "-").slice(0, 60) || "untitled"

const stripFrontmatter = (content: string) => content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")

const pageTitle = (page: string) => {
  const heading = page.match(/^\s*#{1,6}\s+(.+)$/m)
  if (heading) return { title: normalize(heading[1]), level1: /^\s*#\s/m.test(page.split(/\r?\n/).find(l => l.trim()) ?? "") }
  const first = page.split(/\r?\n/).map(normalize).find(Boolean) ?? ""
  return { title: first.slice(0, 40), level1: false }
}

// document → chapter (H1 で始まるページが章の区切り) → page。page_id は章・ページ見出しから決定的に作る
export const splitDocument = (documentId: string, markdown: string): { chapters: number; pages: Page[] } => {
  const raw = stripFrontmatter(markdown)
    .split(/\r?\n---\r?\n/)
    .map((p, i) => ({ content: p.trim(), page: i + 1 }))
    .filter(p => p.content)
  const infos = raw.map(p => pageTitle(p.content))
  const document = infos[0]?.title || documentId
  const seen = new Map<string, number>()
  let chapter = document
  let chapters = 1
  const pages = raw.map(({ content, page }, i) => {
    if (i > 0 && infos[i].level1) {
      chapter = infos[i].title
      chapters++
    }
    const base = `${documentId}/${slug(chapter)}/${slug(infos[i].title)}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return {
      id: n === 1 ? base : `${base}~${n}`,
      page,
      hash: "sha256:" + crypto.createHash("sha256").update(content).digest("hex"),
      document,
      chapter,
      title: infos[i].title,
      context: `前のページ: ${infos[i - 1]?.title ?? "(なし)"}\n次のページ: ${infos[i + 1]?.title ?? "(なし)"}`,
      content,
    }
  })
  return { chapters, pages }
}

// entities / tags の候補語。Choice は自由抽出できないので本文から拾ってモデルに選別させる
export const extractCandidates = (p: Page) => {
  const out: string[] = []
  const add = (s: string) => {
    const t = normalize(s.replace(/[（(][^）)]*[）)]/g, "").replace(/[*`_#]/g, "")).replace(/^[・･]+|[・･]+$/g, "")
    if (t.length >= 2 && t.length <= 30) out.push(t)
  }
  add(p.title)
  const body = p.content.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  for (const m of body.matchAll(/\*\*(.+?)\*\*/g)) add(m[1])
  for (const m of body.matchAll(/「([^」]+)」/g)) add(m[1])
  for (const m of body.matchAll(/^\s*[-*+]\s+([^：:\n]+)[：:]/gm)) add(m[1])
  for (const m of body.matchAll(/[ァ-ヶー・]{3,}/g)) add(m[0])
  return uniq(out).slice(0, MAX_CANDIDATES)
}

export const needsTagging = (
  p: Page,
  rec: TaggingRecord | undefined,
  opts: { force: boolean; onlyVersion?: string },
) => {
  if (opts.onlyVersion !== undefined) return rec?.tag_schema_version === opts.onlyVersion
  if (opts.force) return true
  if (rec?.manual) return false
  return !(rec && rec.content_hash === p.hash && rec.tag_schema_version === TAG_SCHEMA_VERSION)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const callJev = async (state: string, questions: Record<string, unknown>) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ state, model: MODEL, questions }),
    })
    if ((res.status === 429 || res.status === 529) && attempt < 4) {
      await sleep(1000 * 2 ** attempt)
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return (await res.json()) as { model?: string; answers?: Answers }
  }
}

const asChoice = (answers: Answers | undefined, id: string): ChoiceAnswer => {
  const a = answers?.[id]
  if (a?.type !== "choice" || typeof a.choice !== "string" || typeof a.probabilities !== "object") {
    throw new Error(`invalid answer for ${id}`)
  }
  return a as ChoiceAnswer
}

export const pickNouls = (answers: Answers | undefined) => {
  const out: Record<NoulAxis, string[]> = { era: [], topic: [], culture: [], region: [] }
  for (const q of NOUL_QUESTIONS) {
    const a = answers?.[q.id]
    if (a?.type !== "noul" || typeof a.noul !== "number") throw new Error(`invalid answer for ${q.id}`)
    if (a.noul >= NOUL_THRESHOLD) out[q.axis].push(q.option)
  }
  return out
}

// 開始〜終了の世紀を範囲で返す。片方だけ分かればその1つ
export const pickPeriod = (answers: Answers | undefined, pageId: string) => {
  const index = (id: string) => {
    const a = asChoice(answers, id)
    if (a.choice === NONE || (a.probabilities[a.choice] ?? 0) < CHOICE_THRESHOLD) return -1
    const i = (PERIODS as readonly string[]).indexOf(normalize(a.choice))
    if (i < 0) console.warn(`[${pageId}] ${id}: 不正な値を除外 ${JSON.stringify(a.choice)}`)
    return i
  }
  let s = index("period_start")
  let e = index("period_end")
  if (s < 0) s = e
  if (e < 0) e = s
  if (s < 0) return []
  return PERIODS.slice(Math.min(s, e), Math.max(s, e) + 1)
}

const tagPage = async (p: Page) => {
  const candidates = extractCandidates(p)
  const questions: Record<string, unknown> = { ...PERIOD_QUESTIONS }
  for (const q of NOUL_QUESTIONS) questions[q.id] = q.question
  candidates.forEach((term, i) => {
    questions[`c${i}`] = { type: "choice", instructions: CANDIDATE_INSTRUCTIONS(term), criteria: CANDIDATE_CRITERIA }
  })
  const state = buildState({ document: p.document, chapter: p.chapter, page: p.title, context: p.context, content: p.content })
  const res = await callJev(state, questions)

  const entities: string[] = []
  const tags: string[] = []
  candidates.forEach((term, i) => {
    const a = asChoice(res.answers, `c${i}`)
    if ((a.probabilities[a.choice] ?? 0) < CHOICE_THRESHOLD) return
    if (a.choice === "entity") entities.push(term)
    if (a.choice === "concept") tags.push(term)
  })
  const tagsOut: HistoryTags = {
    ...pickNouls(res.answers),
    period: pickPeriod(res.answers, p.id),
    entities: uniq(entities),
    tags: uniq(tags),
  }
  return { tags: tagsOut, model: res.model ?? MODEL }
}

const storePath = (documentId: string) => path.join(TAGS_DIR, `${documentId}.json`)

export const loadStore = (documentId: string): Store => {
  try {
    return JSON.parse(fs.readFileSync(storePath(documentId), "utf-8"))
  } catch {
    return {}
  }
}

// 現存ページ順に並べ、消えたページは manual があるものだけ残す
const saveStore = (documentId: string, pages: Page[], store: Store) => {
  const ids = new Set(pages.map(p => p.id))
  const ordered: Store = {}
  for (const p of pages) if (store[p.id]) ordered[p.id] = store[p.id]
  for (const [id, rec] of Object.entries(store)) if (!ids.has(id) && rec.manual) ordered[id] = rec
  const json = JSON.stringify(ordered, null, 2) + "\n"
  const file = storePath(documentId)
  if (!Object.keys(ordered).length && !fs.existsSync(file)) return
  if (fs.existsSync(file) && fs.readFileSync(file, "utf-8") === json) return
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, json)
}

const main = async () => {
  try {
    process.loadEnvFile()
  } catch {} // .env が無ければ環境変数のみ
  const args = process.argv.slice(2)
  const force = args.includes("--force")
  const dryRun = args.includes("--dry-run")
  const svIdx = args.indexOf("--schema-version")
  const onlyVersion = svIdx >= 0 ? args[svIdx + 1] : undefined
  const files = args.filter((a, i) => !a.startsWith("--") && !(svIdx >= 0 && i === svIdx + 1))
  const targets = (files.length ? files : globSync("slides/*.md")).sort()

  if (!dryRun && !process.env.TYPESAFE_API_KEY) {
    console.error("TYPESAFE_API_KEY が未設定")
    process.exit(1)
  }

  const docs = targets.map(file => {
    const id = path.basename(file, ".md")
    const { chapters, pages } = splitDocument(id, fs.readFileSync(file, "utf-8"))
    return { id, chapters, pages, store: loadStore(id) }
  })
  // ファイル指定なしの通常実行では、タグ付け済みのファイルを丸ごとスキップ (本文を直しても再タグ付けしない)
  const skipTaggedFiles = !files.length && !force && onlyVersion === undefined
  const todo = docs
    .filter(d => !(skipTaggedFiles && Object.keys(d.store).length))
    .flatMap(d => d.pages.filter(p => needsTagging(p, d.store[p.id], { force, onlyVersion })).map(p => ({ d, p })))
  const totalPages = docs.reduce((n, d) => n + d.pages.length, 0)
  const stats = { tagged: 0, failed: 0, requests: 0 }

  if (!dryRun) {
    // todo は page_id が一意なので、キューから取り出す方式なら同一ページを二重処理しない
    const queue = [...todo]
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const { d, p } = job
        stats.requests++
        try {
          const { tags, model } = await tagPage(p)
          d.store[p.id] = {
            page_id: p.id,
            content_hash: p.hash,
            tag_schema_version: TAG_SCHEMA_VERSION,
            tags,
            ...(d.store[p.id]?.manual && { manual: d.store[p.id].manual }),
            processed_at: new Date().toISOString(),
            model,
          }
          saveStore(d.id, d.pages, d.store)
          stats.tagged++
          console.log(`tagged ${p.id}`)
        } catch (e) {
          stats.failed++
          const error = e instanceof Error ? e.message : String(e)
          console.error(`failed ${p.id}: ${error}`)
          fs.mkdirSync(TAGS_DIR, { recursive: true })
          fs.appendFileSync(ERROR_LOG, JSON.stringify({
            page_id: p.id, content_hash: p.hash, tag_schema_version: TAG_SCHEMA_VERSION, error, occurred_at: new Date().toISOString(),
          }) + "\n")
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    for (const d of docs) saveStore(d.id, d.pages, d.store)
  }

  const fmt = (n: number) => n.toLocaleString("en-US")
  console.log(`
Documents: ${fmt(docs.length)}
Chapters: ${fmt(docs.reduce((n, d) => n + d.chapters, 0))}
Pages: ${fmt(totalPages)}
${dryRun ? `\nTo tag: ${fmt(todo.length)}` : `\nTagged: ${fmt(stats.tagged)}`}
Skipped: ${fmt(totalPages - todo.length)}${dryRun ? "" : `\nFailed: ${fmt(stats.failed)}\n\nJev requests: ${fmt(stats.requests)}`}`)
}

if (require.main === module) main()
