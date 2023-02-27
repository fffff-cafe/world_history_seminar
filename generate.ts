import fs from "fs"
import glob from "glob-promise"

const styles = `
<style>
body {
padding: 1rem;
}
li {
padding: 0.25rem;
list-style: none;
}
a {
text-decoration: none;
color: #666;
}
a:hover {
color: #c66;
background: #fcfcfc;
display: block;
text-decoration: underline;
}
</style>
`
const act = async () => {
  const files = await glob.promise("slides/**/*")
  const links = files
    .filter(f => f.match(/^slides\/(.*?)\.md$/g))
    .map(f => f.replace(/^slides\//g, "").replace(/\.md$/g, ""))
    .map(f => `<li><a href="${f}">${f.replace("_", " ")}</a></li>`)
    .join("\n")
  fs.writeFileSync("dist/index.html", `${styles}<h1>Slides</h1><ul>${links}</ul>`)

}

act()