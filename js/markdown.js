/* Мини-парсер Markdown для уроков. Безопасный: весь текст экранируется, ссылки только http(s). */
(function () {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function inline(text) {
    let s = esc(text);
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => "<code>" + codes[+i] + "</code>");
    return s;
  }

  const calloutClass = line => {
    if (/^(💡|✅)/.test(line)) return "tip";
    if (/^(⚠️|⚠|❌|🚫)/.test(line)) return "warn";
    if (/^(📌|🎯)/.test(line)) return "note";
    if (/^🧪/.test(line)) return "example";
    if (/^🇷🇺/.test(line)) return "yandex";
    return "plain";
  };

  function render(md) {
    const lines = String(md || "").replace(/\r/g, "").split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      let m;
      if (/^```/.test(line)) {
        const lang = line.replace(/^```/, "").trim();
        const buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push('<pre class="code"' + (lang ? ' data-lang="' + esc(lang) + '"' : "") + "><code>" + esc(buf.join("\n")) + "</code></pre>");
        continue;
      }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
        const lvl = Math.min(m[1].length + 1, 5);
        out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`); i++; continue;
      }
      if (/^---+\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
      if (/^>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
        out.push(`<div class="callout ${calloutClass(buf[0].trim())}">${render(buf.join("\n"))}</div>`);
        continue;
      }
      if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
        const cells = r => r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
        const head = cells(line); i += 2;
        const rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
        out.push('<div class="table-wrap"><table><thead><tr>' + head.map(h => `<th>${inline(h)}</th>`).join("") + "</tr></thead><tbody>" +
          rows.map(r => "<tr>" + head.map((_, k) => `<td>${inline(r[k] || "")}</td>`).join("") + "</tr>").join("") + "</tbody></table></div>");
        continue;
      }
      if (/^\s*[-*•]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && (/^\s*[-*•]\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
          if (/^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*[-*•]\s+/, "")); else items[items.length - 1] += " " + lines[i].trim();
          i++;
        }
        out.push("<ul>" + items.map(t => `<li>${inline(t)}</li>`).join("") + "</ul>"); continue;
      }
      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && (/^\s*\d+[.)]\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
          if (/^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); else items[items.length - 1] += " " + lines[i].trim();
          i++;
        }
        out.push("<ol>" + items.map(t => `<li>${inline(t)}</li>`).join("") + "</ol>"); continue;
      }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|---+\s*$|\s*[-*•]\s+|\s*\d+[.)]\s+|\|)/.test(lines[i])) buf.push(lines[i++]);
      if (!buf.length) { buf.push(lines[i++]); }
      out.push(`<p>${inline(buf.join(" "))}</p>`);
    }
    return out.join("\n");
  }
  window.MD = { render, inline, esc };
})();
