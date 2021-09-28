const glob = require("glob")
const fs = require("fs")

glob("slides/**/*", (err, files) => {
  const links = files
    .flatMap(f => f.match(/^slides\/(.*?)\.md$/g))
    .filter(f => !!f)
    .map(f => f.replace(/^slides\//g, "").replace(/\.md$/g, ""))
    .map(f => `<p><a href="${f}">${f}</a></p>`)
    .join("\n")
  fs.writeFileSync("dist/index.html", links)
})