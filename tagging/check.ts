// pnpm tag:check — Jev を呼ばない部分の自己チェック
import assert from "assert"
import { NOUL_QUESTIONS, TAG_SCHEMA_VERSION } from "./schema"
import { buildGraph } from "../graph"
import { extractCandidates, needsTagging, normalize, pickNouls, pickPeriod, splitDocument } from "./tag"

const md = `---
marp: true
---

# 登山の歴史

---

## 登山とは

A

---

## 登山とは

B

---

# 近代登山

---

## 山岳信仰

- **修験道**：山で修行
- カイラス山（チベット）: 聖地
`
const { chapters, pages } = splitDocument("doc", md)
assert.strictEqual(chapters, 2)
assert.deepStrictEqual(pages.map(p => p.id), [
  "doc/登山の歴史/登山の歴史",
  "doc/登山の歴史/登山とは",
  "doc/登山の歴史/登山とは~2",
  "doc/近代登山/近代登山",
  "doc/近代登山/山岳信仰",
])
assert.strictEqual(pages[4].chapter, "近代登山")
assert.notStrictEqual(pages[1].hash, pages[2].hash)
assert.strictEqual(splitDocument("doc", md).pages[4].hash, pages[4].hash)

const c = extractCandidates(pages[4])
assert(c.includes("修験道") && c.includes("カイラス山"), JSON.stringify(c))

const p = pages[1]
const rec = { page_id: p.id, content_hash: p.hash, tag_schema_version: TAG_SCHEMA_VERSION, tags: {} as any, processed_at: "" }
assert.strictEqual(needsTagging(p, undefined, { force: false }), true)
assert.strictEqual(needsTagging(p, rec, { force: false }), false)
assert.strictEqual(needsTagging(p, { ...rec, content_hash: "x" }, { force: false }), true)
assert.strictEqual(needsTagging(p, { ...rec, tag_schema_version: "0" }, { force: false }), true)
assert.strictEqual(needsTagging(p, { ...rec, content_hash: "x", manual: rec.tags }, { force: false }), false)
assert.strictEqual(needsTagging(p, { ...rec, manual: rec.tags }, { force: true }), true)
assert.strictEqual(needsTagging(p, rec, { force: false, onlyVersion: TAG_SCHEMA_VERSION }), true)
assert.strictEqual(needsTagging(p, rec, { force: false, onlyVersion: "999" }), false)

const nouls = Object.fromEntries(NOUL_QUESTIONS.map(q => [q.id, { type: "noul", noul: 0.1 }]))
const yes = (axis: string, option: string) => (nouls[NOUL_QUESTIONS.find(q => q.axis === axis && q.option === option)!.id].noul = 0.9)
yes("era", "近世")
yes("era", "近代")
yes("topic", "科学・技術")
assert.deepStrictEqual(pickNouls(nouls), { era: ["近世", "近代"], topic: ["科学・技術"], culture: [], region: [] })
assert.throws(() => pickNouls({}))

const choice = (choice: string, p = 0.9) => ({ type: "choice", choice, probabilities: { [choice]: p } })
assert.deepStrictEqual(pickPeriod({ period_start: choice("17世紀"), period_end: choice("19世紀") }, "t"), ["17世紀", "18世紀", "19世紀"])
assert.deepStrictEqual(pickPeriod({ period_start: choice("該当なし"), period_end: choice("19世紀") }, "t"), ["19世紀"])
assert.deepStrictEqual(pickPeriod({ period_start: choice("17世紀", 0.3), period_end: choice("該当なし") }, "t"), [])
assert.deepStrictEqual(pickPeriod({ period_start: choice("捏造"), period_end: choice("該当なし") }, "t"), [])

assert.strictEqual(normalize("  ＡＢＣ　 "), "ABC")

const empty = { era: [], period: [], region: [], entities: [], topic: [], culture: [], tags: [] }
const g = buildGraph([
  ...Array(3).fill({ ...empty, era: ["近代"], entities: ["フランス"] }),
  { ...empty, era: ["近代"], tags: ["啓蒙思想"] },
])
assert.deepStrictEqual(g.nodes, [{ id: "近代", axis: "era", count: 4 }, { id: "フランス", axis: "entities", count: 3 }])
assert.deepStrictEqual(g.edges, [{ source: "フランス", target: "近代", weight: 3 }])

console.log("ok")
