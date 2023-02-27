import fs from "fs"
import glob from "glob-promise"
import readline from "readline"

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
  const links =  (await Promise.all(files
    .filter(f => f.match(/^slides\/(.*?)\.md$/g))
    .map(async (f) => {
      const reader = readline.createInterface({ input: fs.createReadStream(f) })
      const line: string = await new Promise((resolve) => {
        reader.on('line', (line) => {
          reader.close()
          resolve(line)
        })
      })
      const path = f.replace(/^slides\//g, "").replace(/\.md$/g, "")
      return `<li><a href="${path}">${line.replace(/^\#\s/g, "")}&nbsp;<small>${path}</small></a></li>`
    }))).join("\n")
  fs.writeFileSync("dist/index.html", `${styles}<h1>Slides</h1><ul>${links}</ul>`)

}

act()