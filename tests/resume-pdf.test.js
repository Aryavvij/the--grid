const GRID = require('path').resolve(__dirname, '..');
const R = require(GRID + '/js/resume-pdf.js');
const a = (n, x) => { if (!x) { console.error('FAIL', n); process.exitCode = 1; } else console.log('ok', n); };

// bullets: one per line, list markers stripped; a single paragraph splits into sentences
a('bullets one per line, markers stripped', JSON.stringify(R.bullets({ fullDesc: '• Built A\n- Cut B by 40%\n\n3) Wrote C' })) === '["Built A","Cut B by 40%","Wrote C"]');
a('paragraph splits into sentences', R.bullets({ fullDesc: 'Built A. Cut B by 4.5%. (Also) C.' }).length === 3);
a('falls back to the one-line summary', R.bullets({ desc: 'Only a summary' })[0] === 'Only a summary');
a('no text, no bullets', R.bullets({}).length === 0);

// contact links
a('link label strips scheme, www and trailing slash', R.linkLabel('https://www.linkedin.com/in/jake/') === 'linkedin.com/in/jake');
a('bare domain gets https', R.linkHref('github.com/jake') === 'https://github.com/jake');
a('email gets mailto', R.linkHref('jake@su.edu') === 'mailto:jake@su.edu');

// mapping onto the template's sections
const tabs = {
  courses: [{ name: 'Uni', org: 'B.Tech CS', location: 'Pune', date: '2021 – 2025' }],
  internships: [{ name: 'Intern', org: 'Acme', location: 'Remote', date: '2024', fullDesc: 'x\ny', tags: ['GO_LANG'] }],
  positions: [{ name: 'Lead', date: '2023', fullDesc: 'z' }],
  projects: [{ name: 'Proj', tags: ['Python', 'Flask'], date: '2024', fullDesc: 'p' }, { name: 'Skip', date: '2020' }],
  research: [{ name: 'Paper', date: '2024' }],
  achievements: [],
};
const all = () => true;
let doc = R.fromGrid({ tabs, picked: (cat, i) => !(cat === 'projects' && i === 1) && cat !== 'research', profile: {} });
a('section order is Education, Experience, Projects', doc.sections.map(s => s.title).join() === 'Education,Experience,Projects');
a('internships and positions both land in Experience', doc.sections[1].items.length === 2);
a('unticked entries are left out', doc.sections[2].items.length === 1);
a('no skills set: tags fall back to one row, underscores cleaned', doc.skills.length === 1 && doc.skills[0].fallback && doc.skills[0].value.includes('GO LANG'));
doc = R.fromGrid({ tabs, picked: all, profile: { skills: { languages: 'Go', tools: 'Git' } } });
a('ticked research becomes an extra section', doc.sections.some(s => s.title === 'Research'));
a('skills rows keep template labels and order, empty rows dropped', doc.skills.map(r => r.label).join() === 'Languages,Developer Tools');

// rendered page
const html = R.html(R.fromGrid({ tabs, picked: all, profile: { name: 'Jo <b>', phone: '555', email: 'jo@x.io', github: 'github.com/jo', skills: { languages: 'Go' } } }));
a('page is US Letter with no browser margins', /@page\{size:letter;margin:0\}/.test(html));
a('0.5in margins and 11pt body', html.includes('padding:36pt 36pt 36pt 36pt') && html.includes('font-size:10.91pt'));
a('headings are small caps over a rule', /\.rp-sec\{font-variant:small-caps[^}]*font-size:11\.96pt/.test(html) && html.includes('border-bottom:0.4pt solid #000'));
a('contact line is phone | email | github', html.includes('555 | <a href="mailto:jo@x.io"') && html.includes('>github.com/jo</a>'));
a('user text is escaped', html.includes('Jo &lt;b&gt;') && !html.includes('Jo <b>'));
a('project row is name | stack from tags', html.includes('<b>Proj</b> | <i>Python, Flask</i>'));
a('education has no bullets', !/<b>Uni<\/b>[\s\S]*?rp-bul[\s\S]*?Experience/.test(html.split('Experience</h2>')[0] + 'Experience'));
a('experience subheading row 2 is company + location', html.includes('<span>Acme</span><span>Remote</span>'));
a('skills row is bold label then colon', html.includes('<b>Languages</b>: Go'));
