// 검색엔진 노출용 서버 렌더링 페이지 템플릿 (종목 상세, 청약 일정, 사이트맵, 홈 링크 블록)
export const SITE = 'https://gongmoju.pages.dev';
const SITE_NAME = '공모주 청약 현황';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => Number(n).toLocaleString('ko-KR');
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

function fmtDate(iso) {
  if (!iso) return '미정';
  const [y, m, d] = iso.split('-').map(Number);
  const w = WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일(${w})`;
}
const fmtDot = (s) => (s ? s.replace(/\./g, '-').replace(/-$/, '') : null);
const marketName = (m) => (m === 'kospi' ? '코스피' : '코스닥');
const STATUS = { ongoing: '청약 진행 중', new: '청약 예정', closed: '청약 마감' };

function offerPrice(ipo) {
  if (ipo.price) return ipo.price;
  const m = /([\d,]+)\s*$/.exec(ipo.price_range || '');
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

const CSS = `
*{margin:0;padding:0;box-sizing:border-box;}
:root{--bg:#0f1117;--surface:#1a1d27;--surface2:#222535;--border:#2e3148;--primary:#5b6af0;--primary-light:#7b8af5;--up:#ff5757;--down:#3db9ff;--text:#e8eaf6;--text2:#8b8fa8;--text3:#5c6080;--new:#f0a040;--ongoing:#50c96e;}
[data-theme="light"]{--bg:#f4f6fb;--surface:#ffffff;--surface2:#eef1f8;--border:#dde1ee;--primary:#4a58e0;--primary-light:#6270e8;--up:#e03535;--down:#1e9fd4;--text:#13172e;--text2:#4a5068;--text3:#8690a8;--new:#d47c10;--ongoing:#27a84e;}
body{background:var(--bg);color:var(--text);font-family:'Apple SD Gothic Neo','Noto Sans KR',-apple-system,sans-serif;min-height:100vh;line-height:1.7;}
a{color:var(--primary-light);}
header{background:var(--surface);border-bottom:1px solid var(--border);padding:0 24px;position:sticky;top:0;z-index:100;}
.header-inner{max-width:900px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;height:60px;}
.logo{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700;text-decoration:none;color:var(--text);}
.logo-icon{width:32px;height:32px;border-radius:8px;}
.header-right{display:flex;align-items:center;gap:16px;}
.nav-link{font-size:13px;color:var(--text2);text-decoration:none;}
.nav-link:hover{color:var(--primary);}
.page-wrap{max-width:900px;margin:0 auto;padding:36px 24px 72px;}
.crumb{font-size:12px;color:var(--text3);margin-bottom:14px;}
.crumb a{color:var(--text3);text-decoration:none;}
h1{font-size:28px;font-weight:800;line-height:1.35;margin-bottom:10px;}
.badges{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;}
.badge{font-size:12px;font-weight:700;padding:3px 12px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);}
.badge.ongoing{color:var(--ongoing);border-color:var(--ongoing);}
.badge.new{color:var(--new);border-color:var(--new);}
.lead{font-size:15px;color:var(--text2);margin-bottom:28px;}
h2{font-size:19px;font-weight:700;margin:36px 0 14px;padding-bottom:8px;border-bottom:2px solid var(--primary);}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 18px;}
.card .k{font-size:12px;color:var(--text3);margin-bottom:4px;}
.card .v{font-size:18px;font-weight:800;}
.card .s{font-size:11px;color:var(--text3);margin-top:2px;}
table{width:100%;border-collapse:collapse;font-size:14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--border);}
th{background:var(--surface2);font-size:12px;color:var(--text2);}
tr:last-child td{border-bottom:0;}
td.r,th.r{text-align:right;}
.prose{font-size:14px;color:var(--text2);line-height:1.85;}
.prose p{margin-bottom:12px;}
.faq h3{font-size:15px;font-weight:700;margin:18px 0 6px;color:var(--text);}
.note{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--new);border-radius:0 12px 12px 0;padding:14px 18px;font-size:12.5px;color:var(--text2);margin-top:28px;}
.list{list-style:none;}
.list li{border-bottom:1px solid var(--border);}
.list a{display:flex;justify-content:space-between;gap:12px;padding:12px 4px;text-decoration:none;color:var(--text);}
.list a:hover .nm{color:var(--primary-light);}
.list .nm{font-weight:700;}
.list .mt{font-size:13px;color:var(--text2);text-align:right;}
.cal-nav{display:flex;align-items:center;justify-content:space-between;margin:6px 0 14px;}
.cal-nav a{font-size:13px;text-decoration:none;padding:6px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text2);}
.cal-nav .dis{opacity:.35;pointer-events:none;}
.cal-nav b{font-size:18px;}
.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-top:1px solid var(--border);border-left:1px solid var(--border);background:var(--surface);}
.cal .dow{background:var(--surface2);font-size:12px;font-weight:700;color:var(--text2);text-align:center;padding:8px 0;border-right:1px solid var(--border);border-bottom:1px solid var(--border);}
.cal .dow.sun,.cal .day.sun .dn{color:var(--up);}
.cal .dow.sat,.cal .day.sat .dn{color:var(--down);}
.cal .day{min-height:92px;padding:6px 5px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);overflow:hidden;}
.cal .day.out{background:var(--bg);opacity:.45;}
.cal .day.today{box-shadow:inset 0 0 0 2px var(--primary);}
.cal .dn{font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text2);}
.chip{display:block;font-size:11px;line-height:1.3;padding:2px 5px;margin-bottom:3px;border-radius:4px;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--surface2);color:var(--text);border-left:3px solid var(--text3);}
.chip.ongoing{border-left-color:var(--ongoing);}
.chip.new{border-left-color:var(--new);}
.chip i{font-style:normal;font-size:9px;color:var(--text3);margin-right:3px;}
.legend{display:flex;gap:14px;font-size:12px;color:var(--text2);margin-top:10px;flex-wrap:wrap;}
@media(max-width:600px){.cal .day{min-height:64px;padding:3px;}.chip{font-size:10px;padding:1px 3px;}.chip i{display:none;}}
@media(max-width:640px){header{padding:0 14px;position:static;}.header-inner{height:auto;flex-wrap:wrap;padding:10px 0 4px;row-gap:4px;}.logo{font-size:16px;white-space:nowrap;}.header-right{width:100%;overflow-x:auto;gap:18px;padding-bottom:8px;scrollbar-width:none;}.header-right::-webkit-scrollbar{display:none;}.nav-link{white-space:nowrap;font-size:14px;padding:6px 0;flex-shrink:0;}}
footer{border-top:1px solid var(--border);padding:24px;text-align:center;}
.footer-inner{max-width:900px;margin:0 auto;display:flex;justify-content:center;gap:16px;flex-wrap:wrap;}
.footer-link,.footer-text{font-size:12px;color:var(--text3);text-decoration:none;}
@media(max-width:600px){h1{font-size:22px;}.page-wrap{padding:24px 16px 56px;}th,td{padding:8px 10px;font-size:13px;}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}.card{padding:12px 14px;}.card .v{font-size:16px;word-break:keep-all;}h2{font-size:17px;margin-top:28px;}.list a{flex-direction:column;gap:2px;}.list .mt{text-align:left;}.lead{font-size:14px;}}
`;

function layout({ title, desc, path, body, jsonld = [], noindex = false }) {
  const url = `${SITE}${path}`;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow'}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${SITE}/icon-512.png" />
<meta name="twitter:card" content="summary" />
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<style>${CSS}</style>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
<script>try{if(localStorage.getItem('theme')==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}</script>
</head>
<body>
<header><div class="header-inner">
  <a href="/" class="logo"><img class="logo-icon" src="/icon-192.png" alt="로고" width="32" height="32" />${SITE_NAME}</a>
  <div class="header-right">
    <a href="/" class="nav-link">홈</a>
    <a href="/schedule" class="nav-link">청약 일정</a>
    <a href="/calendar" class="nav-link">캘린더</a>
    <a href="/guide" class="nav-link">이용 가이드</a>
    <a href="/contact" class="nav-link">문의</a>
  </div>
</div></header>
<main class="page-wrap">
${body}
</main>
<footer><div class="footer-inner">
  <span class="footer-text">© ${SITE_NAME}</span>
  <a href="/" class="footer-link">홈</a>
  <a href="/schedule" class="footer-link">청약 일정</a>
  <a href="/calendar" class="footer-link">월간 캘린더</a>
  <a href="/guide" class="footer-link">이용 가이드</a>
  <a href="/about" class="footer-link">사이트 소개</a>
  <a href="/privacy" class="footer-link">개인정보처리방침</a>
  <a href="/contact" class="footer-link">문의하기</a>
</div></footer>
</body>
</html>`;
}

const crumbLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${path}` })),
});

// ── 종목 상세 ────────────────────────────────────────────────────────────────

export function renderIpoPage(ipo, d, current) {
  const mk = marketName(ipo.market);
  const price = offerPrice(ipo);
  const priceFixed = !!ipo.price;
  const rate = ipo.rate || d.sub_rate;
  const subscribe = d.schedule['청약일'] || (ipo.date_start ? `${fmtDot(ipo.date_start)} ~ ${fmtDot(ipo.date_end)}` : null);
  const minDeposit = price ? Math.round(price * 10 * 0.5) : null;
  const pool = d.general_shares ? Math.floor(d.general_shares * 0.5) : null;
  const ret = current && price && priceFixed ? Math.round(((current - price) / price) * 1000) / 10 : null;

  const items = [
    ['청약 기간', subscribe ? esc(subscribe) : '미정', fmtDate(ipo.date_start)],
    [priceFixed ? '확정 공모가' : '희망 공모가', price ? `${num(price)}원` : '미정', priceFixed ? null : esc(ipo.price_range || '')],
    ['청약 경쟁률', rate ? `${num(rate)}:1` : '집계 전', rate ? '일반청약 기준' : null],
    ['기관 경쟁률', esc(d.institutional || '—'), '수요예측 결과'],
    ['의무보유확약', esc(d.lockup || '—'), '기관 확약 비율'],
    ['상장 예정일', esc(d.listing_date || '미정'), mk],
    ['총 공모주식수', d.total_shares ? `${esc(d.total_shares)}주` : '—', d.public_amount ? `공모금액 ${esc(d.public_amount)}백만원` : null],
    ['주간사', esc(ipo.underwriter || '—'), null],
  ];
  if (current) items.push(['현재가', `${num(current)}원`, ret !== null ? `공모가 대비 ${ret > 0 ? '+' : ''}${ret}%` : null]);

  const statusLine = {
    ongoing: `${ipo.name}은(는) 현재 청약이 진행 중입니다. 청약은 ${subscribe || '—'}이며 마감일 16시에 종료됩니다.`,
    new: `${ipo.name}의 청약은 ${fmtDate(ipo.date_start)}부터 시작할 예정입니다.`,
    closed: `${ipo.name}의 청약은 마감되었습니다.${rate ? ` 최종 청약 경쟁률은 ${num(rate)}:1을 기록했습니다.` : ''}`,
  }[ipo.status];

  const equal = pool
    ? `<h2>균등배정 예상 수량</h2>
<div class="prose"><p>일반청약자 배정 물량 ${num(d.general_shares)}주의 50%(${num(pool)}주)를 균등 방식으로 배정한다고 가정했을 때, 청약 참여 인원별 1인당 예상 배정 수량입니다. 최소 청약 단위(10주)를 증거금 50%로 청약한 경우를 기준으로 합니다.</p></div>
<div class="grid">${[10000, 30000, 100000, 300000]
        .map((n) => {
          const s = Math.floor(pool / n);
          return `<div class="card"><div class="k">${num(n)}명 참여 시</div><div class="v">${s > 0 ? `${s}주` : '추첨(미배정 가능)'}</div></div>`;
        })
        .join('')}</div>`
    : '';

  const brokers = d.brokers.length
    ? `<h2>증권사별 배정 물량</h2>
<table><thead><tr><th>증권사</th><th class="r">배정 주식수</th><th class="r">청약 한도</th><th>구분</th></tr></thead><tbody>${d.brokers
        .map((b) => `<tr><td>${esc(b.name)}</td><td class="r">${esc(b.shares || '—')}</td><td class="r">${esc(b.limit || '—')}</td><td>${esc(b.role || '')}</td></tr>`)
        .join('')}</tbody></table>`
    : '';

  const faqs = [
    [`${ipo.name} 청약일은 언제인가요?`, subscribe ? `${ipo.name}의 공모 청약 기간은 ${subscribe}입니다. 청약은 증권사별 영업시간 내에 진행되며 마감일에는 16시에 종료됩니다.` : `${ipo.name}의 청약 일정은 아직 확정되지 않았습니다.`],
    [`${ipo.name} 공모가는 얼마인가요?`, priceFixed ? `${ipo.name}의 확정 공모가는 ${num(price)}원입니다.${ipo.price_range ? ` (희망 공모가 범위 ${ipo.price_range}원)` : ''}` : `${ipo.name}의 공모가는 아직 확정되지 않았으며 희망 공모가 범위는 ${ipo.price_range || '미정'}원입니다.`],
    [`${ipo.name} 최소 청약 증거금은 얼마인가요?`, minDeposit ? `최소 청약 단위인 10주를 청약하려면 증거금 50% 기준으로 약 ${num(minDeposit)}원이 필요합니다${priceFixed ? '' : '(희망 공모가 상단 기준 추정치)'}.` : '공모가가 확정되면 안내됩니다.'],
    [`${ipo.name} 상장일은 언제인가요?`, d.listing_date ? `${ipo.name}의 상장 예정일은 ${d.listing_date}이며 ${mk} 시장에 상장됩니다.` : `${ipo.name}의 상장일은 아직 공개되지 않았습니다.`],
  ];

  const sentences = [statusLine];
  if (price) sentences.push(`${priceFixed ? '확정' : '희망'} 공모가는 ${num(price)}원${minDeposit ? `, 최소 청약 증거금은 약 ${num(minDeposit)}원` : ''}입니다.`);
  if (d.institutional) sentences.push(`기관 수요예측 경쟁률은 ${d.institutional}${d.lockup ? `, 의무보유확약 비율은 ${d.lockup}` : ''}입니다.`);

  const path = `/ipo/${ipo.no}`;
  const title = `${ipo.name} 공모주 청약일정·경쟁률·균등배정 | ${SITE_NAME}`;
  const desc = `${ipo.name}(${mk}) ${STATUS[ipo.status]}. ${subscribe ? `청약 ${subscribe}, ` : ''}${price ? `공모가 ${num(price)}원, ` : ''}${rate ? `경쟁률 ${num(rate)}:1. ` : ''}균등배정 예상 수량과 증권사별 배정 물량을 확인하세요.`;

  const body = `<div class="crumb"><a href="/">홈</a> › <a href="/schedule">청약 일정</a> › ${esc(ipo.name)}</div>
<h1>${esc(ipo.name)} 공모주 청약 정보</h1>
<div class="badges"><span class="badge ${ipo.status}">${STATUS[ipo.status]}</span><span class="badge">${mk}</span>${ipo.underwriter ? `<span class="badge">주간사 ${esc(ipo.underwriter)}</span>` : ''}</div>
<p class="lead">${esc(sentences.join(' '))}</p>
<h2>핵심 정보</h2>
<div class="grid">${items.map(([k, v, s]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`).join('')}</div>
${equal}
${brokers}
<h2>자주 묻는 질문</h2>
<div class="faq">${faqs.map(([q, a]) => `<h3>${esc(q)}</h3><div class="prose"><p>${esc(a)}</p></div>`).join('')}</div>
<p style="margin-top:28px"><a href="/schedule">← 전체 공모주 청약 일정 보기</a></p>
<div class="note">본 페이지는 38커뮤니케이션(www.38.co.kr) 등 공개 자료를 자동 수집한 참고 정보이며, 수집 시점에 따라 지연·오류가 있을 수 있습니다. 투자 판단과 그에 따른 손익은 투자자 본인의 책임입니다. 청약 전 반드시 해당 증권사와 공식 공시(투자설명서)를 확인하세요.</div>`;

  return layout({
    title,
    desc,
    path,
    body,
    jsonld: [
      crumbLd([['홈', '/'], ['청약 일정', '/schedule'], [ipo.name, path]]),
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      },
    ],
  });
}

export function renderNotFound() {
  return layout({
    title: `종목을 찾을 수 없습니다 | ${SITE_NAME}`,
    desc: '요청하신 공모주 종목 정보를 찾을 수 없습니다.',
    path: '/schedule',
    noindex: true,
    body: `<h1>종목을 찾을 수 없습니다</h1><p class="lead">이미 목록에서 내려갔거나 잘못된 주소입니다.</p><p><a href="/schedule">← 청약 일정으로 이동</a></p>`,
  });
}

// ── 청약 일정 ────────────────────────────────────────────────────────────────

function ipoList(list) {
  return `<ul class="list">${list
    .map((x) => {
      const p = offerPrice(x);
      const meta = [
        x.date_start ? `${fmtDate(x.date_start)}${x.date_end && x.date_end !== x.date_start ? ` ~ ${fmtDate(x.date_end)}` : ''}` : '일정 미정',
        p ? `${x.price ? '' : '희망 상단 '}${num(p)}원` : null,
        x.rate ? `${num(x.rate)}:1` : null,
      ].filter(Boolean);
      const inner = `<span class="nm">${esc(x.name)} <span style="font-weight:400;color:var(--text3);font-size:12px">${marketName(x.market)}</span></span><span class="mt">${esc(meta.join(' · '))}</span>`;
      return x.no ? `<li><a href="/ipo/${x.no}">${inner}</a></li>` : `<li><a href="#" style="pointer-events:none">${inner}</a></li>`;
    })
    .join('')}</ul>`;
}

export function renderSchedule(data, todayIso) {
  const addDays = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
  const weekEnd = addDays(todayIso, 7);
  const thisWeek = data.new.filter((x) => x.date_start && x.date_start <= weekEnd);
  const later = data.new.filter((x) => !x.date_start || x.date_start > weekEnd);
  const [, m, d] = todayIso.split('-').map(Number);
  const path = '/schedule';
  const names = [...data.ongoing, ...thisWeek].slice(0, 4).map((x) => x.name).join(', ');
  const title = `공모주 청약 일정 (${m}월 ${d}일 기준) — 이번 주 청약 종목 | ${SITE_NAME}`;
  const desc = `${m}월 ${d}일 기준 공모주 청약 일정입니다.${names ? ` ${names} 등 진행·예정 종목의 청약일, 공모가, 경쟁률, 균등배정 예상 수량을 한눈에 확인하세요.` : ' 진행·예정 종목의 청약일, 공모가, 경쟁률을 확인하세요.'}`;

  const section = (h, list, empty) => `<h2>${h}</h2>${list.length ? ipoList(list) : `<div class="prose"><p>${empty}</p></div>`}`;
  const body = `<div class="crumb"><a href="/">홈</a> › 청약 일정</div>
<h1>공모주 청약 일정 <span style="font-size:15px;font-weight:600;color:var(--text3)">${m}월 ${d}일 기준</span></h1>
<p class="lead">진행 중인 공모주와 앞으로 청약이 시작될 종목을 청약일 순으로 정리했습니다. 종목을 누르면 청약 기간, 공모가, 최소 증거금, 균등배정 예상 수량, 증권사별 배정 물량을 볼 수 있습니다. 데이터는 3분마다 갱신됩니다.</p>
${section('청약 진행 중', data.ongoing, '현재 청약이 진행 중인 종목이 없습니다.')}
${section('이번 주 청약 예정 (7일 이내)', thisWeek, '7일 이내에 청약이 시작되는 종목이 없습니다.')}
${section('이후 청약 예정', later, '이후 청약 예정 종목이 아직 없습니다.')}
${section('최근 청약 마감', data.closed, '최근 마감된 종목이 없습니다.')}
<p style="margin-top:20px"><a href="/calendar">월간 캘린더로 보기 →</a></p>
<div class="note">공모주 청약 일정은 증권사·발행사 사정에 따라 변경될 수 있습니다. 청약 전 해당 증권사의 공지와 공식 공시를 반드시 확인하세요.</div>`;

  return layout({ title, desc, path, body, jsonld: [crumbLd([['홈', '/'], ['청약 일정', path]])] });
}

// ── 월간 캘린더 ──────────────────────────────────────────────────────────────

export function calendarRange(todayIso) {
  const [y, m] = todayIso.split('-').map(Number);
  const key = (off) => {
    const d = new Date(Date.UTC(y, m - 1 + off, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  return { min: key(-2), max: key(3), current: key(0), shift: (ym, n) => {
    const [yy, mm] = ym.split('-').map(Number);
    const d = new Date(Date.UTC(yy, mm - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  } };
}

export function renderCalendar(data, ym, todayIso) {
  const [y, m] = ym.split('-').map(Number);
  const range = calendarRange(todayIso);
  const prev = range.shift(ym, -1);
  const next = range.shift(ym, 1);
  const pad = (n) => String(n).padStart(2, '0');
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const all = [...data.ongoing, ...data.new, ...data.closed].filter((x) => x.date_start);
  const inMonth = (iso) => iso.slice(0, 7) === ym;
  const monthIpos = all
    .filter((x) => inMonth(x.date_start) || inMonth(x.date_end || x.date_start))
    .sort((a, b) => a.date_start.localeCompare(b.date_start));

  const dow = WEEK.map((w, i) => `<div class="dow ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('');
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<div class="day out"></div>');
  for (let d = 1; d <= dim; d++) {
    const iso = `${ym}-${pad(d)}`;
    const wd = (first + d - 1) % 7;
    const chips = all
      .filter((x) => x.date_start <= iso && iso <= (x.date_end || x.date_start))
      .map((x) => {
        const tag = iso === x.date_start && x.date_end !== x.date_start ? '시작' : iso === (x.date_end || x.date_start) ? '마감' : '';
        const label = `${tag ? `<i>${tag}</i>` : ''}${esc(x.name)}`;
        return x.no
          ? `<a class="chip ${x.status}" href="/ipo/${x.no}" title="${esc(x.name)} ${STATUS[x.status]}">${label}</a>`
          : `<span class="chip ${x.status}">${label}</span>`;
      })
      .join('');
    cells.push(`<div class="day ${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''} ${iso === todayIso ? 'today' : ''}"><div class="dn">${d}</div>${chips}</div>`);
  }
  while (cells.length % 7) cells.push('<div class="day out"></div>');

  const path = `/calendar/${ym}`;
  const names = monthIpos.slice(0, 5).map((x) => x.name).join(', ');
  const title = `${y}년 ${m}월 공모주 청약 캘린더 | ${SITE_NAME}`;
  const desc = monthIpos.length
    ? `${y}년 ${m}월 공모주 청약 일정 캘린더입니다. ${names}${monthIpos.length > 5 ? ' 등' : ''} ${monthIpos.length}개 종목의 청약 시작·마감일을 한눈에 확인하세요.`
    : `${y}년 ${m}월 공모주 청약 일정 캘린더입니다.`;

  const body = `<div class="crumb"><a href="/">홈</a> › <a href="/schedule">청약 일정</a> › 월간 캘린더</div>
<h1>${y}년 ${m}월 공모주 청약 캘린더</h1>
<p class="lead">${monthIpos.length ? `${m}월에는 ${monthIpos.length}개 종목의 청약이 진행되거나 예정되어 있습니다.` : `${m}월에 등록된 청약 일정이 아직 없습니다.`} 종목을 누르면 공모가, 최소 증거금, 균등배정 예상 수량을 확인할 수 있습니다.</p>
<div class="cal-nav">
  <a href="/calendar/${prev}" class="${prev < range.min ? 'dis' : ''}">← ${Number(prev.slice(5))}월</a>
  <b>${y}년 ${m}월</b>
  <a href="/calendar/${next}" class="${next > range.max ? 'dis' : ''}">${Number(next.slice(5))}월 →</a>
</div>
<div class="cal">${dow}${cells.join('')}</div>
<div class="legend"><span style="color:var(--ongoing)">■ 청약 진행 중</span><span style="color:var(--new)">■ 청약 예정</span><span>■ 청약 마감</span><span>표시는 청약 기간(마감일 16시 종료)입니다.</span></div>
<h2>${m}월 청약 종목 목록</h2>
${monthIpos.length ? ipoList(monthIpos) : '<div class="prose"><p>등록된 종목이 없습니다.</p></div>'}
<p style="margin-top:24px"><a href="/schedule">← 이번 주 청약 일정 보기</a></p>
<div class="note">청약 일정은 증권사·발행사 사정에 따라 변경될 수 있습니다. 38커뮤니케이션 등 공개 자료를 자동 수집한 참고 정보이며 투자 판단은 본인 책임입니다.</div>`;

  return layout({
    title,
    desc,
    path,
    body,
    noindex: monthIpos.length === 0,
    jsonld: [crumbLd([['홈', '/'], ['청약 일정', '/schedule'], [`${y}년 ${m}월 캘린더`, path]])],
  });
}

// ── 사이트맵 / 홈 링크 블록 ──────────────────────────────────────────────────

export function renderSitemap(data, todayIso) {
  const url = (loc, freq, pri, last) =>
    `  <url>\n    <loc>${SITE}${loc}</loc>\n${last ? `    <lastmod>${last}</lastmod>\n` : ''}    <changefreq>${freq}</changefreq>\n    <priority>${pri}</priority>\n  </url>`;
  const all = [...data.ongoing, ...data.new, ...data.closed].filter((x) => x.no);
  const entries = [
    url('/', 'hourly', '1.0', todayIso),
    url('/schedule', 'daily', '0.9', todayIso),
    ...[...new Set(all.map((x) => x.date_start).filter(Boolean).map((d) => d.slice(0, 7)))].sort().map((ym) => url(`/calendar/${ym}`, 'daily', '0.7', todayIso)),
    url('/guide', 'monthly', '0.6'),
    url('/about', 'monthly', '0.4'),
    url('/privacy', 'yearly', '0.3'),
    url('/contact', 'yearly', '0.3'),
    ...all.map((x) => url(`/ipo/${x.no}`, x.status === 'closed' ? 'weekly' : 'daily', x.status === 'closed' ? '0.5' : '0.8', todayIso)),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

export function homeLinksBlock(data) {
  const all = [...data.ongoing, ...data.new, ...data.closed].filter((x) => x.no);
  if (!all.length) return '';
  const links = all.map((x) => `<a href="/ipo/${x.no}" style="color:var(--text2);text-decoration:none;font-size:12px;margin:0 10px 6px 0;display:inline-block">${esc(x.name)} 청약</a>`).join('');
  return `<section aria-label="공모주 종목별 청약 정보" style="max-width:1100px;margin:24px auto 0;padding:20px 24px;border-top:1px solid var(--border)">
<h2 style="font-size:14px;font-weight:700;color:var(--text2);margin-bottom:10px">종목별 공모주 청약 정보 · <a href="/schedule" style="color:var(--primary-light);text-decoration:none">전체 청약 일정</a> · <a href="/calendar" style="color:var(--primary-light);text-decoration:none">월간 캘린더</a></h2>
<div>${links}</div></section>`;
}
