/* Resume PDF: renders the résumé as a standalone US-Letter HTML page in the
   "Jake Ryan" LaTeX template format (the reference is cv_format.pdf). Every size
   and offset below was measured from that PDF: Computer Modern, 11pt body,
   0.5in margins, small-caps 12pt section headings over a 0.4pt full-width
   rule, two-row subheadings indented 0.15in, 10pt bullets.
   Pure functions, no DOM: also loaded by node for tests. */
(function (root) {
  const FONT = 'https://cdn.jsdelivr.net/npm/computer-modern@0.1.2/fonts/cmu-serif-';
  const RS_CATS = ['projects', 'internships', 'positions', 'courses', 'research', 'achievements'];
  const PAGE_H_PT = 792;   // 11in

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const clean = (s) => String(s == null ? '' : s).trim();

  // Spacing is in pt, tuned so baselines land where the reference PDF puts them.
  const CSS = `
@font-face{font-family:'Grid CMU';font-style:normal;font-weight:400;src:url(${FONT}500-roman.woff2) format('woff2')}
@font-face{font-family:'Grid CMU';font-style:italic;font-weight:400;src:url(${FONT}500-italic.woff2) format('woff2')}
@font-face{font-family:'Grid CMU';font-style:normal;font-weight:700;src:url(${FONT}700-roman.woff2) format('woff2')}
@font-face{font-family:'Grid CMU';font-style:italic;font-weight:700;src:url(${FONT}700-italic.woff2) format('woff2')}
@page{size:letter;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rp{width:612pt;min-height:792pt;padding:36pt 36pt 36pt 36pt;color:#000;background:#fff;
  font-family:'Grid CMU','CMU Serif','Latin Modern Roman',Georgia,'Times New Roman',serif;
  font-size:10.91pt;line-height:13.6pt;font-kerning:normal;font-variant-ligatures:common-ligatures}
.rp b{font-weight:700;line-height:0}
.rp i{font-style:italic;line-height:0}
.rp a{line-height:0}
.rp-name{text-align:center;font-weight:700;font-size:24.79pt;line-height:24pt;margin:-2.3pt 0 0}
.rp-contact{text-align:center;font-size:9.96pt;line-height:12pt;margin-top:0.65pt}
.rp-contact a{color:inherit;text-decoration:underline;text-decoration-thickness:0.4pt;text-underline-offset:2.6pt}
.rp-sec{font-variant:small-caps;font-weight:400;font-size:11.96pt;line-height:14pt;margin:0;
  padding-bottom:1.1pt;border-bottom:0.4pt solid #000}
.rp-list{margin-left:10.8pt;width:523.8pt}
.rp-ent{break-inside:avoid}
.rp-row{display:flex;justify-content:space-between;align-items:baseline;gap:12pt}
.rp-row>span:last-child{white-space:nowrap;text-align:right;flex:none}
.rp-r1{line-height:13.6pt}
.rp-r2{font-size:9.96pt;line-height:12pt;font-style:italic}
.rp-pr>span:first-child{font-size:9.96pt}
.rp-bul{list-style:none;margin:0;padding:0 0 0 24pt}
.rp-bul li{font-size:9.96pt;line-height:12pt;margin-top:2pt}
.rp-bul li::before{content:'';display:inline-block;width:2.8pt;height:2.8pt;border-radius:50%;background:#000;
  margin-left:-9.3pt;margin-right:6.5pt;vertical-align:1.1pt}
.rp-skills{font-size:9.96pt;line-height:11.95pt}
.rp-empty{font-family:Georgia,serif;color:#777;text-align:center;padding:120pt 40pt;font-size:11pt}
/* vertical rhythm */
.rp-contact+.rp-sec{margin-top:14.2pt}
.rp-sec+.rp-list{margin-top:2pt}
.rp-sec+.rp-list>.rp-ent:first-child>.rp-pr{margin-top:4pt}
.rp-r1+.rp-r2{margin-top:1.55pt}
.rp-r2+.rp-bul>li:first-child{margin-top:1.7pt}
.rp-pr+.rp-bul>li:first-child{margin-top:0.95pt}
.rp-ent+.rp-ent{margin-top:5.6pt}
.rp-pr+.rp-bul{margin-top:0}
.rp-ent.has-bul+.rp-ent{margin-top:4.5pt}
.rp-ent.is-proj+.rp-ent{margin-top:6.9pt}
.rp-list+.rp-sec{margin-top:6.7pt}
.rp-list.ends-bul+.rp-sec{margin-top:10.5pt}
.rp-sec+.rp-skills{margin-top:3.6pt;margin-left:10.8pt}
@media screen{.rp-pagebreak{position:absolute;left:0;right:0;top:792pt;border-top:1px dashed #d33;
  font:9px/1 'Space Mono',monospace;color:#d33;text-align:left;padding:3px 0 0 6px;pointer-events:none}
  .rp{position:relative}}
@media print{.rp-pagebreak{display:none}}
`;

  /** One bullet per line. Older entries were written as a paragraph, so a single
   *  line is split into sentences (that is how they rendered before). */
  function bullets(item) {
    const raw = clean(item && (item.fullDesc || item.desc));
    if (!raw) return [];
    const strip = (s) => s.replace(/^\s*(?:[•\-*–·]|\d+[.)])\s+/, '').trim();
    const lines = raw.split(/\r?\n/).map(strip).filter(Boolean);
    if (lines.length > 1) return lines;
    return lines[0].split(/(?<=[.!?])\s+(?=[A-Z(])/).map((s) => s.trim()).filter(Boolean);
  }

  /** linkedin.com/in/jake from https://www.linkedin.com/in/jake/ */
  const linkLabel = (url) => clean(url).replace(/^mailto:/i, '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
  const linkHref = (url) => {
    const u = clean(url);
    if (!u) return '';
    if (/^mailto:/i.test(u) || /^https?:\/\//i.test(u)) return u;
    if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(u)) return 'mailto:' + u;
    return 'https://' + u;
  };

  const SKILL_ROWS = [['languages', 'Languages'], ['frameworks', 'Frameworks'], ['tools', 'Developer Tools'], ['libraries', 'Libraries']];

  /**
   * Grid's portfolio -> the template's sections. picked(cat, idx) says whether a
   * node is ticked in the PDF panel. Education <- courses, Experience <-
   * internships + positions, Projects <- projects; research and achievements
   * have no section in the template and are appended in the same style only
   * when ticked. Skills come from the profile's four rows; with none filled in,
   * the tags of the ticked work fall back into a single row.
   */
  function fromGrid({ tabs, picked, profile }) {
    tabs = tabs || {}; profile = profile || {};
    const take = (cat) => (Array.isArray(tabs[cat]) ? tabs[cat] : []).filter((_, i) => picked(cat, i));
    const sections = [];
    const add = (title, kind, items) => { if (items.length) sections.push({ title, kind, items }); };
    add('Education', 'education', take('courses'));
    add('Experience', 'experience', [...take('internships'), ...take('positions')]);
    add('Projects', 'projects', take('projects'));
    add('Research', 'experience', take('research'));
    add('Achievements', 'experience', take('achievements'));

    const sk = profile.skills || {};
    let skills = SKILL_ROWS.map(([k, label]) => ({ label, value: clean(sk[k]) })).filter((r) => r.value);
    if (!skills.length) {
      const tags = new Set();
      ['internships', 'positions', 'projects', 'research'].forEach((cat) =>
        take(cat).forEach((it) => (it.tags || []).forEach((t) => { t = clean(t).replace(/_/g, ' '); if (t) tags.add(t); })));
      if (tags.size) skills = [{ label: 'Skills', value: [...tags].join(', '), fallback: true }];
    }
    return { header: profile, sections, skills };
  }

  function entry(kind, it) {
    const name = esc(clean(it.name)), date = esc(clean(it.date)), loc = esc(clean(it.location));
    if (kind === 'education') {
      const sub = esc(clean(it.org) || clean(it.desc));
      return `<div class="rp-ent"><div class="rp-row rp-r1"><span><b>${name}</b></span><span>${loc}</span></div>` +
        (sub || date ? `<div class="rp-row rp-r2"><span>${sub}</span><span>${date}</span></div>` : '') + '</div>';
    }
    const bl = bullets(it), ul = bl.length ? `<ul class="rp-bul">${bl.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
    const cls = 'rp-ent' + (bl.length ? ' has-bul' : '');
    if (kind === 'projects') {
      const stack = clean(it.org) || (it.tags || []).map(clean).filter(Boolean).join(', ');
      return `<div class="${cls} is-proj"><div class="rp-row rp-pr"><span><b>${name}</b>${stack ? ` | <i>${esc(stack)}</i>` : ''}</span><span>${date}</span></div>${ul}</div>`;
    }
    const org = esc(clean(it.org));
    return `<div class="${cls}"><div class="rp-row rp-r1"><span><b>${name}</b></span><span>${date}</span></div>` +
      (org || loc ? `<div class="rp-row rp-r2"><span>${org}</span><span>${loc}</span></div>` : '') + ul + '</div>';
  }

  function body(doc) {
    const h = doc.header || {};
    const contact = [];
    if (clean(h.phone)) contact.push(esc(clean(h.phone)));
    ['email', 'linkedin', 'github', 'website'].forEach((k) => {
      const v = clean(h[k]);
      if (v) contact.push(`<a href="${esc(linkHref(v))}" target="_blank" rel="noopener noreferrer">${esc(linkLabel(v))}</a>`);
    });
    let out = `<div class="rp-name">${esc(clean(h.name) || 'Your Name')}</div>`;
    if (contact.length) out += `<div class="rp-contact">${contact.join(' | ')}</div>`;
    (doc.sections || []).forEach((s) => {
      const last = s.items[s.items.length - 1];
      const endsBul = s.kind !== 'education' && bullets(last).length > 0;
      out += `<h2 class="rp-sec">${esc(s.title)}</h2><div class="rp-list${endsBul ? ' ends-bul' : ''}">${s.items.map((it) => entry(s.kind, it)).join('')}</div>`;
    });
    if (doc.skills && doc.skills.length) {
      out += `<h2 class="rp-sec">Technical Skills</h2><div class="rp-skills">${doc.skills.map((r) => `<div><b>${esc(r.label)}</b>: ${esc(r.value)}</div>`).join('')}</div>`;
    }
    if (!(doc.sections || []).length && !(doc.skills || []).length) {
      out += '<div class="rp-empty">Tick entries above to build your resume.</div>';
    }
    return out;
  }

  /** The full standalone page, used for both the preview iframe and printing. */
  function html(doc) {
    const title = clean(doc.header && doc.header.name) ? clean(doc.header.name) + ' Resume' : 'Resume';
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head>` +
      `<body><div class="rp">${body(doc)}<div class="rp-pagebreak" hidden>page 1 ends here</div></div></body></html>`;
  }

  const api = { RS_CATS, PAGE_H_PT, CSS, bullets, linkLabel, linkHref, fromGrid, html, esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Grid = root.Grid || {}).resumePdf = api;
})(typeof window !== 'undefined' ? window : globalThis);
