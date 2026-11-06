// 공모주 청약률 Cloudflare Worker (app.py 이식)
// 데이터 출처: 38커뮤니케이션 (www.38.co.kr)
import { parse } from 'node-html-parser';
import { renderIpoPage, renderNotFound, renderSchedule, renderSitemap, homeLinksBlock, renderCalendar, calendarRange } from './pages.js';

// 요청당 subrequest 사용량 측정 (응답 헤더 X-Subrequests, 무료 플랜 한도 50)
let SUB = 0;
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (...args) => {
  SUB++;
  return realFetch(...args);
};

const CACHE_TTL = 180;
const DETAIL_CACHE_TTL = 600;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'http://www.38.co.kr/',
};
const BASE_URL = 'http://www.38.co.kr/html/fund/?o=k';
// 투자설명서 기준으로 확인된 최소 청약 수량 (38커뮤니케이션 원문에는 없음). 그 외 종목은 10주로 가정
const MIN_QTY_CONFIRMED = { 2325: 20, 2339: 20 };
const detailUrl = (no) => `http://www.38.co.kr/html/fund/?o=v&no=${no}`;

// ── 유틸 ──────────────────────────────────────────────────────────────────────

const KST_MS = 9 * 3600 * 1000;
const kstNow = () => new Date(Date.now() + KST_MS);
const todayKst = () => kstNow().toISOString().slice(0, 10); // YYYY-MM-DD

function parseDate(s) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec((s || '').trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function classify(start, end) {
  const today = todayKst();
  if (!start || !end) return 'new';
  if (today < start) return 'new';
  if (today <= end) return 'ongoing';
  return 'closed';
}

function parseRate(raw) {
  const m = /([\d,]+\.?\d*)\s*:\s*1/.exec(raw);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

// BeautifulSoup get_text(strip=True) 동등: 텍스트 노드를 각각 trim 후 이어붙임
function strippedText(node) {
  let out = '';
  for (const c of node.childNodes) {
    if (c.nodeType === 3) out += c.text.trim();
    else if (c.nodeType === 1) out += strippedText(c);
  }
  return out;
}

async function fetchPage(url) {
  const r = await fetch(url, { headers: HEADERS, redirect: 'follow' });
  const buf = await r.arrayBuffer();
  return new TextDecoder('euc-kr').decode(buf);
}

// 메모리 TTL 캐시: 같은 isolate 안에서만 유지되지만 subrequest 한도(요청당 50회)에 포함되지 않는다
const MEM = new Map();
async function memCached(key, ttl, producer, accept = () => true) {
  const now = Date.now();
  const hit = MEM.get(key);
  if (hit && hit.exp > now && accept(hit.data)) return hit.data;
  const data = await producer();
  if (accept(data)) MEM.set(key, { data, exp: now + ttl * 1000 });
  return data;
}

// Cache API 기반 TTL 캐시 (isolate가 바뀌어도 유지) + 메모리 1차 캐시
async function cached(key, ttl, producer, accept = () => true) {
  const now = Date.now();
  const mem = MEM.get(key);
  if (mem && mem.exp > now && accept(mem.data)) return mem.data;
  const cache = caches.default;
  const req = new Request(`https://cache.internal/${key}`);
  SUB++;
  const hit = await cache.match(req);
  if (hit) {
    const data = await hit.json();
    if (accept(data)) {
      MEM.set(key, { data, exp: now + ttl * 1000 });
      return data;
    }
  }
  const data = await producer();
  MEM.set(key, { data, exp: now + ttl * 1000 });
  SUB++;
  await cache.put(
    req,
    new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttl}` },
    }),
  );
  return data;
}

// ── 목록 스크래퍼 ─────────────────────────────────────────────────────────────

function scrapeIpos(html) {
  const root = parse(html);
  let target = null;
  for (const t of root.querySelectorAll('table')) {
    const text = t.text;
    if (text.includes('청약경쟁률') && text.includes('희망공모가') && text.includes('확정공모가')) {
      target = t;
      break;
    }
  }
  if (!target) return [];

  const results = [];
  for (const row of target.querySelectorAll('tr')) {
    const tds = row.querySelectorAll('td');
    const cells = tds.map((td) => strippedText(td));
    if (cells.length < 5) continue;

    const name = cells[0].trim();
    const dateRaw = (cells[1] || '').trim();
    const confPrice = (cells[2] || '').trim();
    const hopePrice = (cells[3] || '').trim();
    const rateRaw = (cells[4] || '').trim();
    let underwriter = (cells[5] || '').trim();

    if (!/^\d{4}\.\d{2}\.\d{2}/.test(dateRaw)) continue;
    if (!name || /^\d+$/.test(name)) continue;

    let detailNo = null;
    const link = tds[0] && tds[0].querySelector('a[href]');
    if (link) {
      const m = /no=(\d+)/.exec(link.getAttribute('href') || '');
      if (m) detailNo = m[1];
    }

    const dateParts = dateRaw.match(/\d{4}\.\d{2}\.\d{2}/g) || [];
    if (dateParts.length === 1) {
      const m = /~(\d{2}\.\d{2})$/.exec(dateRaw);
      if (m) dateParts.push(`${dateParts[0].slice(0, 4)}.${m[1]}`);
    }

    const start = dateParts[0] ? parseDate(dateParts[0]) : null;
    const end = dateParts.length > 1 ? parseDate(dateParts[1]) : start;
    const rate = parseRate(rateRaw);
    const status = classify(start, end);

    underwriter = underwriter.replace(/분석$/, '').trim();
    const market = name.includes('(유가)') || dateRaw.includes('(유가)') ? 'kospi' : 'kosdaq';
    const nameClean = name.replace('(유가)', '').trim();

    let price = null;
    if (confPrice && confPrice !== '-') {
      const n = parseInt(confPrice.replace(/,/g, '').replace('원', '').trim(), 10);
      if (!Number.isNaN(n)) price = n;
    }

    results.push({
      min_qty: MIN_QTY_CONFIRMED[detailNo] || 10,
      min_qty_confirmed: !!MIN_QTY_CONFIRMED[detailNo],
      no: detailNo,
      name: nameClean,
      market,
      date_start: start,
      date_end: end,
      price,
      price_range: hopePrice && hopePrice !== '-' ? hopePrice : null,
      rate,
      rate_raw: rateRaw && rateRaw !== '-' ? rateRaw : null,
      underwriter: underwriter && underwriter !== '-' ? underwriter : null,
      status,
    });
  }
  return results;
}

// ── 상세 스크래퍼 ─────────────────────────────────────────────────────────────

function scrapeDetail(html) {
  const root = parse(html);
  const tables = root.querySelectorAll('table');

  const result = {
    brokers: [],
    schedule: {},
    institutional: null,
    lockup: null,
    listing_date: null,
    current_price: null,
    total_shares: null,
    public_amount: null,
    general_shares: null,
    sub_rate: null,
    stock_code: null,
  };

  let m = /종목코드\s*([0-9A-Z]{6})/.exec(root.text);
  if (m) result.stock_code = m[1];

  const rowCells = (row, sel) => row.querySelectorAll(sel).map((td) => strippedText(td));

  // 증권사별 배정 테이블
  for (const t of tables) {
    const rows = t.querySelectorAll('tr');
    if (rows.length < 2 || rows.length > 20) continue;
    const header = rowCells(rows[0], 'td, th');
    if (header.includes('인수회사') && header.includes('주식수')) {
      for (const row of rows.slice(1)) {
        const cells = rowCells(row, 'td');
        if (cells.length >= 2 && cells[0]) {
          result.brokers.push({
            name: cells[0],
            shares: cells[1] ?? null,
            limit: cells[2] ?? null,
            role: cells[3] ?? null,
          });
        }
      }
      break;
    }
  }

  for (const t of tables) {
    const text = t.text;

    if (text.includes('공모청약일') || text.includes('수요예측일')) {
      for (const row of t.querySelectorAll('tr')) {
        const txt = rowCells(row, 'td, th').join(' ');
        if ((m = /공모청약일\s*([\d.]+)\s*~\s*([\d.]+)/.exec(txt))) result.schedule['청약일'] = `${m[1]} ~ ${m[2]}`;
        if ((m = /수요예측일\s*([\d.]+)\s*~\s*([\d.]+)/.exec(txt))) result.schedule['수요예측일'] = `${m[1]} ~ ${m[2]}`;
        if ((m = /상장일\s*([\d.]+)/.exec(txt))) {
          result.listing_date = m[1];
          result.schedule['상장일'] = m[1];
        }
        if ((m = /납입일\s*([\d.]+)/.exec(txt))) result.schedule['납입일'] = m[1];
        if ((m = /기관경쟁률\s*([\d,.]+:\s*1)/.exec(txt))) result.institutional = m[1].trim();
        if ((m = /의무보유확약\s*([\d.]+%)/.exec(txt))) result.lockup = m[1];
        if ((m = /현재가\s*([\d,]+)\s*원/.exec(txt))) result.current_price = m[1].replace(/,/g, '');
      }
    }

    if (text.includes('총공모주식수')) {
      for (const row of t.querySelectorAll('tr')) {
        const txt = rowCells(row, 'td, th').join(' ');
        if ((m = /총공모주식수\s*([\d,]+)\s*주/.exec(txt))) result.total_shares = m[1];
        if ((m = /공모금액\s*([\d,]+)\s*\(백만원\)/.exec(txt))) result.public_amount = m[1];
      }
    }

    if (text.includes('일반청약자') && result.general_shares === null) {
      m = /일반청약자[^\d]*([\d,]+)\s*~?\s*([\d,]*)\s*주/.exec(text);
      if (m) result.general_shares = parseInt(m[1].replace(/,/g, ''), 10);
    }

    if (text.includes('청약경쟁률') && result.sub_rate === null) {
      m = /청약경쟁률\s*([\d,]+\.?\d*)\s*:\s*1/.exec(text);
      if (m) result.sub_rate = parseFloat(m[1].replace(/,/g, ''));
    }
  }
  return result;
}

// ── 데이터 조회 ───────────────────────────────────────────────────────────────

function listedButNoPrice(d) {
  const listing = d.listing_date;
  if (!listing || d.current_price) return false;
  const iso = parseDate(listing);
  return !!iso && iso <= todayKst();
}

const getDetail = (no) =>
  cached(`detail/${no}`, DETAIL_CACHE_TTL, async () => scrapeDetail(await fetchPage(detailUrl(no))), (d) => !listedButNoPrice(d));

const NAVER_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0' };
const normName = (s) => String(s || '').replace(/\s|\([^)]*\)/g, '').toLowerCase();

function naverIpoCodes() {
  return memCached('naver-ipo-codes', 1800, async () => {
    try {
      const r = await fetch('https://m.stock.naver.com/api/stocks/ipo?stockListSortType=IPO&pageSize=100', { headers: NAVER_HEADERS });
      const j = await r.json();
      const map = {};
      for (const x of j.ipoCoInfos || []) map[normName(x.itemName)] = x.itemCode;
      return map;
    } catch {
      return {};
    }
  });
}

// 목록에 없는(마감된) 종목은 검색 자동완성으로 코드를 찾는다
async function naverCodeFor(name) {
  const n = normName(name);
  const map = await naverIpoCodes();
  if (map[n]) return map[n];
  return memCached(
    `naver-code/${n}`,
    86400,
    async () => {
      try {
        const r = await fetch(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(name)}&target=stock,ipo`, { headers: NAVER_HEADERS });
        const j = await r.json();
        const hit = (j.items || []).find((x) => x.category === 'ipo' && normName(x.name) === n);
        return hit ? hit.code : null;
      } catch {
        return null;
      }
    },
    (v) => v !== null,
  );
}

// 네이버가 서버마다 값을 번갈아 주는 경우가 있어, 신청건수는 줄어들 수 없다는 점을 이용해 더 큰 쪽을 유지
const BEST = new Map();
async function mergeBest(code, fresh) {
  const prev = BEST.get(code) || null;
  let best = fresh;
  if (prev && prev.applications != null && (fresh.applications == null || prev.applications > fresh.applications)) best = prev;
  BEST.set(code, best);
  return best;
}

async function naverSubscription(name, ttl = 60) {
  const code = await naverCodeFor(name);
  if (!code) return null;
  return memCached(
    `naver-sub/${code}`,
    ttl,
    async () => {
      try {
        const r = await fetch(`https://m.stock.naver.com/front-api/ipo/detail?code=${code}`, { headers: NAVER_HEADERS });
        if (!r.ok) return null;
        const x = (await r.json()).result;
        if (!x) return null;
        const jm = x.joinManagers || [];
        const sum = (k) => jm.reduce((acc, m) => acc + (m[k] || 0), 0);
        const weight = (m) => (m.orgEqlShares || 0) + (m.orgPrtShares || 0);
        const wavg = (key) => {
          const ms = jm.filter((m) => m[key] != null);
          const tw = ms.reduce((acc, m) => acc + weight(m), 0);
          return ms.length && tw ? Math.round((ms.reduce((acc, m) => acc + m[key] * weight(m), 0) / tw) * 100) / 100 : null;
        };
        const demand = x.demandForecastingResult || {};
        const lcal = x.ipoInfo?.lcalDate;
        const out = {
          rate: x.confirmedInfo?.fnlCmptRatio ?? wavg('ttlCmptRatio'),
          prop_rate: jm.length === 1 ? jm[0].prtCmptRatio ?? null : wavg('prtCmptRatio'),
          applications: jm.some((m) => m.sbscNum != null) ? sum('sbscNum') : null,
          eql_shares: sum('orgEqlShares') || null,
          min_qty: jm.length ? Math.max(...jm.map((m) => m.sbscMinNum || 0)) || null : null,
          updated_at: jm.map((m) => m.updtTm).filter(Boolean).sort().pop() || null,
          institutional: demand.cmptnRate ? `${Number(demand.cmptnRate).toLocaleString('en-US')}:1` : null,
          confirmed_price: demand.fixPubPrice || null,
          listing_date: lcal ? lcal.replace(/-/g, '.') : null,
        };
        if (Object.values(out).every((v) => v == null)) return null;
        return await mergeBest(code, out);
      } catch {
        return null;
      }
    },
    (v) => v !== null,
  );
}

// 진행 중 종목의 경쟁률만 빠르게 갱신하는 경량 API (20초 캐시)
async function apiLive() {
  const data = await getData();
  const items = await Promise.all(
    data.ongoing.map(async (ipo) => {
      const nv = await naverSubscription(ipo.name, 20);
      return { no: ipo.no, name: ipo.name, rate: nv?.rate ?? null, prop_rate: nv?.prop_rate ?? null, applications: nv?.applications ?? null, eql_shares: nv?.eql_shares ?? null, naver_at: nv?.updated_at ? nv.updated_at.slice(11, 16) : null };
    }),
  );
  return json({ updated_at: kstNow().toISOString().slice(0, 19), items });
}

function naverFields(nv) {
  const f = { prop_rate: nv.prop_rate, applications: nv.applications, eql_shares: nv.eql_shares, naver_at: nv.updated_at ? nv.updated_at.slice(11, 16) : null };
  if (nv.min_qty) {
    f.min_qty = nv.min_qty;
    f.min_qty_confirmed = true;
  }
  return f;
}

async function getData() {
  return cached('list', CACHE_TTL, async () => {
    const ipos = scrapeIpos(await fetchPage(BASE_URL));
    const byRate = (a, b) => (b.rate || 0) - (a.rate || 0);
    let ongoing = ipos.filter((x) => x.status === 'ongoing').sort(byRate);
    const next = ipos.filter((x) => x.status === 'new').sort((a, b) => (a.date_start || '').localeCompare(b.date_start || ''));
    const closed = ipos.filter((x) => x.status === 'closed').sort(byRate);

    ongoing = await Promise.all(
      ongoing.map(async (ipo) => {
        let out = ipo;
        // 청약 진행 중에도 네이버 증권에는 종합 경쟁률·비례 경쟁률·신청 건수가 올라옴
        const nv = await naverSubscription(ipo.name);
        if (nv) {
          out = { ...out, ...naverFields(nv) };
          if (!out.price && nv.confirmed_price) out = { ...out, price: nv.confirmed_price };
          if (nv.rate != null && !out.rate) out = { ...out, rate: nv.rate, rate_raw: `${nv.rate}:1`, rate_src: 'naver' };
        }
        return out;
      }),
    );
    ongoing.sort(byRate);

    // 7일 이내 청약 예정 종목은 네이버에서 최소 청약 수량·확정 공모가를 보강
    const soonCutoff = new Date(Date.parse(todayKst()) + 7 * 86400000).toISOString().slice(0, 10);
    const nextEnriched = await Promise.all(
      next.map(async (ipo) => {
        if (!ipo.date_start || ipo.date_start > soonCutoff) return ipo;
        const nv = await naverSubscription(ipo.name, 600);
        if (!nv) return ipo;
        let o = { ...ipo };
        if (nv.min_qty) { o.min_qty = nv.min_qty; o.min_qty_confirmed = true; }
        if (!o.price && nv.confirmed_price) o.price = nv.confirmed_price;
        return o;
      }),
    );
    next.splice(0, next.length, ...nextEnriched);

    // 최근 3일 내 마감 종목도 네이버에서 비례 경쟁률·신청건수를 보강
    const closedCutoff = new Date(Date.parse(todayKst()) - 3 * 86400000).toISOString().slice(0, 10);
    const closedEnriched = await Promise.all(
      closed.map(async (ipo) => {
        if (!ipo.date_end || ipo.date_end < closedCutoff) return ipo;
        const nv = await naverSubscription(ipo.name);
        return nv ? { ...ipo, ...naverFields(nv) } : ipo;
      }),
    );
    closed.splice(0, closed.length, ...closedEnriched);

    return {
      ongoing,
      new: next,
      closed,
      updated_at: kstNow().toISOString().slice(0, 19),
      source: '38커뮤니케이션',
    };
  });
}

async function fetchNaverPrice(code) {
  try {
    const r = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.ok) {
      const j = await r.json();
      const p = j.closePrice || j.currentPrice || j.stockEndPrice;
      if (p) return parseInt(String(p).replace(/,/g, ''), 10);
    }
  } catch {}
  return null;
}

async function currentPriceOf(detail) {
  let cur = detail.current_price ? parseInt(detail.current_price, 10) : null;
  if (!cur && detail.stock_code) cur = await fetchNaverPrice(detail.stock_code);
  return cur;
}

// ── 라우트 ────────────────────────────────────────────────────────────────────

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
      'X-Subrequests': String(SUB),
    },
  });

async function apiIpos(url) {
  let data = await getData();
  if (url.searchParams.get('mock') === '1' && data.new.length) {
    const mock = { ...data.new[0], status: 'ongoing', rate: 1847.25, rate_raw: '1847.25:1' };
    if (!mock.price && mock.price_range) {
      const m = /([\d,]+)\s*$/.exec(mock.price_range);
      if (m) mock.price = parseInt(m[1].replace(/,/g, ''), 10);
    }
    data = { ...data, ongoing: [mock, ...data.ongoing] };
  }
  return json(data);
}

async function apiReturns() {
  const data = await getData();
  const top = data.closed.filter((x) => x.no && x.price).slice(0, 6);
  const out = await Promise.all(
    top.map(async (ipo) => {
      const d = await getDetail(ipo.no);
      const cur = await currentPriceOf(d);
      const offer = ipo.price;
      return {
        no: ipo.no,
        name: ipo.name,
        market: ipo.market,
        offer_price: offer,
        current_price: cur,
        return_pct: cur && offer ? Math.round(((cur - offer) / offer) * 10000) / 100 : null,
        listing_date: d.listing_date,
        rate: ipo.rate,
      };
    }),
  );
  return json(out);
}

async function apiTodayListed() {
  const data = await getData();
  const t = todayKst();
  const todayStr = t.replace(/-/g, '.');
  const cutoff = new Date(Date.parse(t) - 14 * 86400000).toISOString().slice(0, 10);
  const candidates = data.closed.filter((x) => x.no && x.date_end && x.date_end >= cutoff);
  const out = await Promise.all(
    candidates.map(async (ipo) => {
      const d = await getDetail(ipo.no);
      if (d.listing_date !== todayStr) return null;
      return {
        no: ipo.no,
        name: ipo.name,
        market: ipo.market,
        offer_price: ipo.price,
        current_price: await currentPriceOf(d),
        stock_code: d.stock_code,
        rate: ipo.rate,
      };
    }),
  );
  return json(out.filter(Boolean));
}

const html = (body, status = 200, maxAge = 300) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': `public, max-age=${maxAge}`, 'X-Subrequests': String(SUB) },
  });

// 38커뮤니케이션에 아직 없는 기관경쟁률·상장일은 네이버 증권에서 보충
async function getDetailFull(no) {
  const d = await getDetail(no);
  if (d.institutional && d.listing_date) return d;
  try {
    const data = await getData();
    const ipo = [...data.ongoing, ...data.new, ...data.closed].find((x) => x.no === no);
    if (!ipo) return d;
    const nv = await naverSubscription(ipo.name, 120);
    if (!nv) return d;
    const out = { ...d, schedule: { ...d.schedule } };
    if (!out.institutional && nv.institutional) out.institutional = nv.institutional;
    if (!out.listing_date && nv.listing_date) {
      out.listing_date = nv.listing_date;
      out.schedule['상장일'] = nv.listing_date;
    }
    return out;
  } catch {
    return d;
  }
}

async function ipoPage(no) {
  const data = await getData();
  const ipo = [...data.ongoing, ...data.new, ...data.closed].find((x) => x.no === no);
  if (!ipo) return html(renderNotFound(), 404, 60);
  const detail = await getDetailFull(no);
  const current = ipo.status === 'new' ? null : await currentPriceOf(detail);
  return html(renderIpoPage(ipo, detail, current));
}

async function homePage(request, env) {
  const res = await env.ASSETS.fetch(request);
  if (!res.ok || !(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  try {
    const block = homeLinksBlock(await getData());
    const text = await res.text();
    const out = block ? text.replace('</body>', `${block}\n</body>`) : text;
    return html(out, 200, 0);
  } catch {
    return env.ASSETS.fetch(request);
  }
}

async function apiChart(code) {
  const t = todayKst().replace(/-/g, '');
  const points = await cached(`chart/${code}/${t}`, 30, async () => {
    try {
      const r = await fetch(
        `https://api.stock.naver.com/chart/domestic/item/${code}/minute?startDateTime=${t}0900&endDateTime=${t}1530`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } },
      );
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? j.map((x) => [String(x.localDateTime).slice(8, 12), x.currentPrice]) : [];
    } catch {
      return [];
    }
  });
  return json(points);
}

export default {
  async fetch(request, env) {
    SUB = 0;
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === '/') return await homePage(request, env);
      if (path === '/schedule') return html(renderSchedule(await getData(), todayKst()));
      if (path === '/sitemap.xml')
        return new Response(renderSitemap(await getData(), todayKst()), {
          headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
        });
      const cal = /^\/calendar(?:\/(\d{4}-\d{2}))?\/?$/.exec(path);
      if (cal) {
        const today = todayKst();
        const range = calendarRange(today);
        const ym = cal[1] || range.current;
        if (ym < range.min || ym > range.max || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return html(renderNotFound(), 404, 60);
        return html(renderCalendar(await getData(), ym, today));
      }
      const ip = /^\/ipo\/(\d+)\/?$/.exec(path);
      if (ip) return await ipoPage(ip[1]);
      if (path === '/api/ipos') return await apiIpos(url);
      if (path === '/api/ipos/returns') return await apiReturns();
      if (path === '/api/ipos/today-listed') return await apiTodayListed();
      if (path === '/api/live') return await apiLive();
      const chart = /^\/api\/chart\/([0-9A-Z]{6})$/.exec(path);
      if (chart) return await apiChart(chart[1]);
      const m = /^\/api\/ipos\/(\d+)\/detail$/.exec(path);
      if (m) return json(await getDetailFull(m[1]));
      if (path.startsWith('/api/')) return json({ error: 'not found' }, 404);
      // 사이트 소유확인 파일은 .html 경로 그대로 200으로 응답해야 함 (Pages의 .html 리다이렉트 방지)
      const v = /^\/((?:google|naver)[0-9a-f]+)\.html$/.exec(path);
      if (v) {
        const r = await env.ASSETS.fetch(new Request(`${url.origin}/${v[1]}`));
        return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    } catch (e) {
      return json({ error: String(e && e.message ? e.message : e) }, 500);
    }
    return env.ASSETS.fetch(request);
  },
};
