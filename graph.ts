// tags/*.json からタグの共起ネットワークを作り、dist/graph.json と dist/graph.html を出力する
// ノード = タグ (大きさ = 付いたページ数)、エッジ = 同じページに付いたタグ同士 (太さ = 共起ページ数)
import fs from "fs"
import { globSync } from "glob"
import { HistoryTags } from "./tagging/schema"
import { TaggingRecord } from "./tagging/tag"

const MIN_NODE_COUNT = 3
const MIN_EDGE_WEIGHT = 2
// ponytail: 描画が重くなるので上位ノードだけ。全体が要るなら graph.json を Gephi などで開く
const MAX_NODES = 300

type Axis = keyof HistoryTags
const AXES: { axis: Axis; label: string; color: string }[] = [
  { axis: "era", label: "時代", color: "#667eea" },
  { axis: "period", label: "年代", color: "#9f7aea" },
  { axis: "region", label: "地域", color: "#38a169" },
  { axis: "topic", label: "分野", color: "#dd6b20" },
  { axis: "culture", label: "文化", color: "#d53f8c" },
  { axis: "entities", label: "固有名詞", color: "#3182ce" },
  { axis: "tags", label: "概念", color: "#718096" },
]

export const buildGraph = (pages: HistoryTags[]) => {
  const count = new Map<string, number>()
  const axisOf = new Map<string, Axis>()
  const weight = new Map<string, number>()
  for (const page of pages) {
    const labels = new Set<string>()
    for (const { axis } of AXES) {
      for (const tag of page[axis] ?? []) {
        if (!axisOf.has(tag)) axisOf.set(tag, axis)
        labels.add(tag)
      }
    }
    const sorted = [...labels].sort()
    sorted.forEach((a, i) => {
      count.set(a, (count.get(a) ?? 0) + 1)
      for (const b of sorted.slice(i + 1)) weight.set(`${a}\t${b}`, (weight.get(`${a}\t${b}`) ?? 0) + 1)
    })
  }
  const nodes = [...count]
    .filter(([, n]) => n >= MIN_NODE_COUNT)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_NODES)
    .map(([id, n]) => ({ id, axis: axisOf.get(id)!, count: n }))
  const ids = new Set(nodes.map(n => n.id))
  const edges = [...weight]
    .map(([key, w]) => {
      const [source, target] = key.split("\t")
      return { source, target, weight: w }
    })
    .filter(e => e.weight >= MIN_EDGE_WEIGHT && ids.has(e.source) && ids.has(e.target))
  return { nodes, edges }
}

const loadPages = (): HistoryTags[] =>
  globSync("tags/*.json").flatMap(file => {
    const store: Record<string, TaggingRecord> = JSON.parse(fs.readFileSync(file, "utf-8"))
    return Object.values(store).map(r => r.manual ?? r.tags)
  })

const generateHTML = (graph: ReturnType<typeof buildGraph>) => `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>タグネットワーク - World History Seminar</title>
  <script src="https://cdn.jsdelivr.net/npm/vis-network@10.1.2/standalone/umd/vis-network.min.js" integrity="sha384-RDdG1CLOxjNlTHh4JYx/rnAueaMHbkBHmeHwrEyljMQw3LF0it4SkuNotIY/FPxD" crossorigin="anonymous"></script>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f8fc; color: #333; }
    header { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; padding: 0.75rem 1rem; background: white; border-bottom: 1px solid #e1e5e9; }
    header a { color: #667eea; text-decoration: none; }
    .axes { display: flex; flex-wrap: wrap; gap: 0.75rem; font-size: 0.85rem; }
    .axes label { display: inline-flex; align-items: center; gap: 0.25rem; cursor: pointer; }
    .swatch { width: 0.7rem; height: 0.7rem; border-radius: 50%; display: inline-block; }
    .note { font-size: 0.8rem; color: #888; }
    #graph { height: calc(100vh - 3.5rem); }
  </style>
</head>
<body>
  <header>
    <a href="./">← スライド一覧</a>
    <div class="axes"></div>
    <span class="note">ノード ${graph.nodes.length} ・ エッジ ${graph.edges.length} ・ ダブルクリックでそのタグのセクションを検索</span>
  </header>
  <div id="graph"></div>
  <script>
    const graph = ${JSON.stringify(graph).replace(/</g, "\\u003c")};
    const AXES = ${JSON.stringify(AXES)};
    const labelOf = Object.fromEntries(AXES.map(a => [a.axis, a.label]));
    const hidden = new Set();

    const nodes = new vis.DataSet(graph.nodes.map(n => ({
      id: n.id, label: n.id, value: n.count, group: n.axis, title: labelOf[n.axis] + ': ' + n.count + 'ページ'
    })));
    const edges = new vis.DataSet(graph.edges.map((e, i) => ({
      id: i, from: e.source, to: e.target, value: e.weight, title: e.weight + 'ページで共起'
    })));
    const nodeView = new vis.DataView(nodes, { filter: n => !hidden.has(n.group) });

    const network = new vis.Network(document.getElementById('graph'), { nodes: nodeView, edges }, {
      groups: Object.fromEntries(AXES.map(a => [a.axis, { color: { background: a.color, border: a.color } }])),
      nodes: { shape: 'dot', scaling: { min: 6, max: 40, label: { enabled: true, min: 10, max: 28 } } },
      edges: { color: { color: '#d5d9e6', highlight: '#667eea', hover: '#667eea' }, scaling: { min: 0.5, max: 6 }, smooth: false },
      physics: { solver: 'forceAtlas2Based', stabilization: { iterations: 200 } },
      interaction: { hover: true, tooltipDelay: 100 }
    });

    network.on('doubleClick', params => {
      if (params.nodes.length) location.href = './?tag=' + encodeURIComponent(params.nodes[0]);
    });

    const axesEl = document.querySelector('.axes');
    for (const a of AXES) {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = true;
      box.addEventListener('change', () => {
        box.checked ? hidden.delete(a.axis) : hidden.add(a.axis);
        nodeView.refresh();
      });
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = a.color;
      label.append(box, swatch, a.label);
      axesEl.append(label);
    }
  </script>
</body>
</html>`

if (require.main === module) {
  const graph = buildGraph(loadPages())
  fs.mkdirSync("dist", { recursive: true })
  fs.writeFileSync("dist/graph.json", JSON.stringify(graph, null, 2) + "\n")
  fs.writeFileSync("dist/graph.html", generateHTML(graph))
  console.log(`Generated graph with ${graph.nodes.length} nodes, ${graph.edges.length} edges`)
}
