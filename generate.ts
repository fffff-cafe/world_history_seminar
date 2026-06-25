import fs from "fs"
import { glob } from "glob"

interface Section {
  page: number
  heading: string
  text: string
}

interface SlideInfo {
  title: string
  author: string
  date: string
  path: string
  filename: string
  sections: Section[]
}

const stripFrontmatter = (content: string): string => {
  if (!/^---\r?\n/.test(content)) return content
  const closeMatch = content.slice(4).match(/\r?\n---\r?\n/)
  if (!closeMatch || closeMatch.index === undefined) return content
  return content.slice(4 + closeMatch.index + closeMatch[0].length)
}

const extractSections = (body: string): Section[] => {
  const pages = body.split(/\r?\n---\r?\n/)

  return pages
    .map((page, index) => {
      let heading = ""
      const textLines: string[] = []

      for (const raw of page.split(/\r?\n/)) {
        const line = raw.trim()
        if (!heading && /^#{1,6}\s+/.test(line)) {
          heading = line.replace(/^#{1,6}\s+/, "").trim()
          continue
        }
        if (line === "" || line.startsWith("<!--")) continue
        textLines.push(line)
      }

      const text = textLines
        .join(" ")
        .replace(/<[^>]+>/g, "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[`*_#>]/g, "")
        .replace(/\s+/g, " ")
        .trim()

      return { page: index + 1, heading, text }
    })
    .filter(section => section.heading || section.text)
}

const extractSlideInfo = (filePath: string): SlideInfo => {
  const content = fs.readFileSync(filePath, "utf-8")
  const body = stripFrontmatter(content)
  const filename = filePath.replace(/^slides\//, "").replace(/\.md$/, "")
  const match = filename.match(/^(\d{8})_(.+)$/)

  const headerLines = body.split(/\r?\n/, 5).map(l => l.trim())

  let title = headerLines[0]?.replace(/^#+\s*/, "") || "無題"
  let author = ""
  let dateStr = ""

  if (match) {
    const [, rawDate, rawAuthor] = match
    dateStr = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
    author = rawAuthor
  }

  for (const line of headerLines.slice(1, 5)) {
    if (line.startsWith("@")) {
      author = line.replace("@", "")
    } else if (line.match(/^\d{4}-\d{1,2}-\d{1,2}/) || line.match(/^\d{4}\/\d{1,2}\/\d{1,2}/)) {
      dateStr = line
    }
  }
  if (dateStr.length > 0) {
    dateStr =  new Date(dateStr).toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      })
    }

  return {
    title,
    author,
    date: dateStr,
    path: filename,
    filename,
    sections: extractSections(body)
  }
}

const generateHTML = (slides: SlideInfo[]): string => {
  const sortedSlides = slides.sort((a, b) => b.date.localeCompare(a.date))
  
  const groupedByYear = sortedSlides.reduce((acc, slide) => {
    const year = slide.date.split(/[-\/]/)[0] || '不明'
    if (!acc[year]) acc[year] = []
    acc[year].push(slide)
    return acc
  }, {} as Record<string, SlideInfo[]>)
  
  const authors = [...new Set(slides.map(s => s.author))].filter(Boolean).sort()

  const sectionIndex = sortedSlides.flatMap(slide =>
    slide.sections.map(section => ({
      title: slide.title,
      author: slide.author,
      date: slide.date,
      path: slide.path,
      page: section.page,
      heading: section.heading,
      text: section.text
    }))
  )
  const sectionIndexJson = JSON.stringify(sectionIndex).replace(/</g, "\\u003c")

  const slideCards = sortedSlides.map(slide => `
    <div class="slide-card" data-author="${slide.author}" data-year="${slide.date.split(/[-\/]/)[0]}" data-path="${slide.path}">
      <a href="${slide.path}" class="slide-link">
        <div class="slide-title">${slide.title}</div>
        <div class="slide-meta">
          <span class="author">@${slide.author}</span>
          <span class="date">${slide.date}</span>
        </div>
      </a>
    </div>
  `).join('')
  
  const yearTabs = Object.keys(groupedByYear).sort().reverse().map(year => 
    `<button class="year-tab" data-year="${year}">${year}年 (${groupedByYear[year].length})</button>`
  ).join('')
  
  const authorFilters = authors.map(author => 
    `<button class="author-filter" data-author="${author}">@${author} (${slides.filter(s => s.author === author).length})</button>`
  ).join('')
  
  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>World History Seminar - Slides</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      color: #333;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }
    
    .header {
      text-align: center;
      margin-bottom: 3rem;
      color: white;
    }
    
    .header h1 {
      font-size: 3rem;
      margin-bottom: 0.5rem;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    
    .header p {
      font-size: 1.2rem;
      opacity: 0.9;
    }
    
    .controls {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 8px 32px rgba(0,0,0,0.1);
    }
    
    .search-box {
      width: 100%;
      padding: 1rem;
      border: 2px solid #e1e5e9;
      border-radius: 8px;
      font-size: 1rem;
      margin-bottom: 1.5rem;
      transition: border-color 0.3s;
    }
    
    .search-box:focus {
      outline: none;
      border-color: #667eea;
    }
    
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    
    .year-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    
    .year-tab, .author-filter {
      padding: 0.5rem 1rem;
      border: 2px solid #e1e5e9;
      background: white;
      border-radius: 20px;
      cursor: pointer;
      transition: all 0.3s;
      font-size: 0.9rem;
    }
    
    .year-tab:hover, .author-filter:hover,
    .year-tab.active, .author-filter.active {
      background: #667eea;
      color: white;
      border-color: #667eea;
    }
    
    .stats {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 1rem;
      font-size: 0.9rem;
      color: #666;
    }
    
    .slides-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.5rem;
    }
    
    .slide-card {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0,0,0,0.1);
      transition: all 0.3s;
      opacity: 1;
    }
    
    .slide-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    }
    
    .slide-card.hidden {
      display: none;
    }
    
    .slide-link {
      display: block;
      padding: 1.5rem;
      text-decoration: none;
      color: inherit;
    }
    
    .slide-title {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: #333;
      line-height: 1.4;
    }
    
    .slide-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.9rem;
      color: #666;
    }
    
    .author {
      background: #f1f3f4;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-weight: 500;
    }
    
    .date {
      color: #888;
    }
    
    .no-results {
      text-align: center;
      padding: 3rem;
      color: white;
      font-size: 1.2rem;
      display: none;
    }

    .section-results {
      display: none;
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid #e1e5e9;
      max-height: 360px;
      overflow-y: auto;
    }

    .section-results-title {
      font-size: 0.9rem;
      color: #666;
      margin-bottom: 0.75rem;
    }

    .section-result {
      display: block;
      padding: 0.6rem 0.75rem;
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      transition: background 0.2s;
    }

    .section-result:hover {
      background: #f1f3f4;
    }

    .section-result-heading {
      display: block;
      font-weight: 600;
      color: #333;
    }

    .section-result-meta {
      display: block;
      font-size: 0.8rem;
      color: #888;
      margin-top: 0.15rem;
    }

    @media (max-width: 768px) {
      .container {
        padding: 1rem;
      }
      
      .header h1 {
        font-size: 2rem;
      }
      
      .slides-grid {
        grid-template-columns: 1fr;
      }
      
      .stats {
        flex-direction: column;
        gap: 0.5rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌍 World History Seminar</h1>
      <p>世界史勉強会のスライド集</p>
    </div>
    
    <div class="controls">
      <input type="text" class="search-box" placeholder="スライド・各資料のセクションを検索...">

      <div class="year-tabs">
        <button class="year-tab active" data-year="all">すべて (${slides.length})</button>
        ${yearTabs}
      </div>

      <div class="filters">
        ${authorFilters}
      </div>

      <div class="stats">
        <span class="visible-count">表示中: ${slides.length}件</span>
        <span class="total-authors">発表者: ${authors.length}名</span>
      </div>

      <div class="section-results"></div>
    </div>
    
    <div class="slides-grid">
      ${slideCards}
    </div>
    
    <div class="no-results">
      検索結果が見つかりません
    </div>
  </div>
  
  <script>
    const sectionIndex = ${sectionIndexJson};
    const searchBox = document.querySelector('.search-box');
    const yearTabs = document.querySelectorAll('.year-tab');
    const authorFilters = document.querySelectorAll('.author-filter');
    const slideCards = document.querySelectorAll('.slide-card');
    const visibleCount = document.querySelector('.visible-count');
    const noResults = document.querySelector('.no-results');
    const sectionResults = document.querySelector('.section-results');

    let currentYear = 'all';
    let currentAuthors = new Set();
    let searchTerm = '';

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function renderSectionResults(matches) {
      if (matches.length === 0) {
        sectionResults.style.display = 'none';
        sectionResults.innerHTML = '';
        return;
      }

      sectionResults.style.display = 'block';
      sectionResults.innerHTML = \`<div class="section-results-title">セクション検索結果: \${matches.length}件</div>\` +
        matches.map(s => \`
          <a class="section-result" href="\${escapeHtml(s.path)}#\${s.page}">
            <span class="section-result-heading">\${escapeHtml(s.heading || s.title)}</span>
            <span class="section-result-meta">\${escapeHtml(s.title)} ・ @\${escapeHtml(s.author)} ・ \${escapeHtml(s.date)}</span>
          </a>
        \`).join('');
    }

    function filterSlides() {
      let visibleSlides = 0;
      const term = searchTerm.toLowerCase();

      const matchedSections = term
        ? sectionIndex.filter(s => s.heading.toLowerCase().includes(term) || s.text.toLowerCase().includes(term))
        : [];
      const matchedPaths = new Set(matchedSections.map(s => s.path));

      slideCards.forEach(card => {
        const title = card.querySelector('.slide-title').textContent.toLowerCase();
        const author = card.dataset.author;
        const year = card.dataset.year;
        const path = card.dataset.path;

        const matchesSearch = !term || title.includes(term) || matchedPaths.has(path);
        const matchesYear = currentYear === 'all' || year === currentYear;
        const matchesAuthor = currentAuthors.size === 0 || currentAuthors.has(author);

        if (matchesSearch && matchesYear && matchesAuthor) {
          card.classList.remove('hidden');
          visibleSlides++;
        } else {
          card.classList.add('hidden');
        }
      });

      visibleCount.textContent = \`表示中: \${visibleSlides}件\`;
      noResults.style.display = visibleSlides === 0 ? 'block' : 'none';
      renderSectionResults(matchedSections);
    }

    searchBox.addEventListener('input', (e) => {
      searchTerm = e.target.value;
      filterSlides();
    });
    
    yearTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        yearTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentYear = tab.dataset.year;
        filterSlides();
      });
    });
    
    authorFilters.forEach(filter => {
      filter.addEventListener('click', () => {
        const author = filter.dataset.author;
        if (currentAuthors.has(author)) {
          currentAuthors.delete(author);
          filter.classList.remove('active');
        } else {
          currentAuthors.add(author);
          filter.classList.add('active');
        }
        filterSlides();
      });
    });
  </script>
</body>
</html>`
}

const act = async () => {
  const files = await glob("slides/**/*")
  const slideFiles = files.filter(f => f.match(/^slides\/(.*?)\.md$/g))
  
  const slides = await Promise.all(
    slideFiles.map(extractSlideInfo)
  )
  
  const html = generateHTML(slides)
  fs.writeFileSync("dist/index.html", html)
  
  console.log(`Generated index with ${slides.length} slides`)
}

act()