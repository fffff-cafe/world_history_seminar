// タグ体系の定義。選択肢・説明文・判定ルールを変えたら TAG_SCHEMA_VERSION を上げる
export const TAG_SCHEMA_VERSION = "2"
export const MODEL = "jev-latest"

export const ERAS = ["先史", "古代", "中世", "近世", "近代", "現代"] as const
export const TOPICS = ["政治", "外交", "軍事", "経済", "社会", "宗教", "思想", "科学・技術", "文化", "地理"] as const
export const CULTURES = ["生活", "社会", "宗教", "芸術", "思想", "娯楽"] as const
// Jev は自由抽出できないため region / period も固定選択肢にする
export const REGIONS = [
  "日本", "東アジア", "東南アジア", "南アジア", "中央アジア", "西アジア", "北アフリカ", "サハラ以南アフリカ",
  "ヨーロッパ", "ロシア・東欧", "北アメリカ", "ラテンアメリカ", "オセアニア", "世界全体",
] as const
export const PERIODS = [
  "紀元前2千年紀以前", "紀元前1千年紀",
  ...Array.from({ length: 21 }, (_, i) => `${i + 1}世紀`),
] as const

export type HistoryTags = {
  era: string[]
  period: string[]
  region: string[]
  entities: string[]
  topic: string[]
  culture: string[]
  tags: string[]
}

export const NONE = "該当なし"

const RULES = [
  "明確に本文から判断できる場合だけ当てはまるとする。推測しない",
  "ページの主要テーマで判断する。単語が一度登場するだけ(参考文献など)では当てはまらない",
].join("。")

// 複数選択の軸: 選択肢ごとに Noul (yes/no) を1問ずつ聞く。値は選択肢の説明 (null なら説明なし)
export type NoulAxis = "era" | "topic" | "culture" | "region"
const NOUL_OPTIONS: Record<NoulAxis, Record<string, string | null>> = {
  era: {
    先史: "文字記録以前",
    古代: "古代文明〜古典古代(おおよそ5世紀頃まで)",
    中世: "おおよそ5〜15世紀",
    近世: "おおよそ16〜18世紀",
    近代: "おおよそ18世紀後半〜20世紀前半",
    現代: "第二次世界大戦後〜現在",
  },
  topic: {
    政治: "統治・政権・制度",
    外交: "国家間の関係・条約",
    軍事: "戦争・戦闘・軍隊",
    経済: "交易・産業・財政",
    社会: "階層・人口・社会構造",
    宗教: "信仰・宗派・宗教制度",
    思想: "哲学・学問・イデオロギー",
    "科学・技術": "発明・技術・自然科学",
    文化: "芸術・文学・風俗",
    地理: "地形・気候・自然環境",
  },
  culture: {
    生活: "衣食住・日常の暮らし",
    社会: "慣習・人間関係・共同体",
    宗教: "祭礼・信仰生活",
    芸術: "美術・音楽・文学・建築",
    思想: "価値観・世界観",
    娯楽: "遊び・スポーツ・余暇",
  },
  region: Object.fromEntries(REGIONS.map(r => [r, null])),
}

const NOUL_INSTRUCTIONS: Record<NoulAxis, (label: string) => string> = {
  era: l => `このページは主に${l}の時代を扱っているか。`,
  topic: l => `${l}はこのページの主要な分野か。`,
  culture: l => `文化・風俗がこのページの主要テーマであり、その中心が${l}か。`,
  region: l => `このページは主に${l}の地域を扱っているか。`,
}

export const NOUL_QUESTIONS = (Object.keys(NOUL_OPTIONS) as NoulAxis[]).flatMap(axis =>
  Object.entries(NOUL_OPTIONS[axis]).map(([option, desc], i) => ({
    id: `${axis}_${i}`,
    axis,
    option,
    question: {
      type: "noul",
      instructions: NOUL_INSTRUCTIONS[axis](desc ? `「${option}」(${desc})` : `「${option}」`) + RULES,
    },
  })),
)

// period は隣り合う世紀に確率が散るため、開始と終了の2つの Choice で範囲を聞く
const periodCriteria = { ...Object.fromEntries(PERIODS.map(p => [p, null])), [NONE]: "特定の年代を扱っていない" }
export const PERIOD_QUESTIONS = {
  period_start: { type: "choice", instructions: `このページが主に扱う年代の始まりはどれか。${RULES}`, criteria: periodCriteria },
  period_end: { type: "choice", instructions: `このページが主に扱う年代の終わりはどれか。${RULES}`, criteria: periodCriteria },
}

// entities / tags: 本文から抽出した候補ごとに分類させる
export const CANDIDATE_INSTRUCTIONS = (term: string) =>
  `語「${term}」はこのページでどう扱われているか。${RULES}`
export const CANDIDATE_CRITERIA = {
  entity: "ページの主要テーマである固有名詞(国家・人物・文明・事件・王朝・地名など)",
  concept: "ページの主要テーマである一般的な歴史概念(制度・思想・現象など)",
  [NONE]: "主要テーマではない、言及されるだけ、または歴史用語ではない",
}

export const buildState = (p: {
  document: string
  chapter: string
  page: string
  context: string
  content: string
}) => `以下の世界史資料を分類してください。

Document:
${p.document}

Chapter:
${p.chapter}

Page:
${p.page}

Context:
${p.context}

Content:
${p.content}`
