// 공모주 청약률 Cloudflare Worker (app.py 이식)
// 데이터 출처: 38커뮤니케이션 (www.38.co.kr)
import { parse } from 'node-html-parser';
import { renderIpoPage, renderNotFound, renderSchedule, renderSitemap, homeLinksBlock, renderCalendar, calendarRange } from './pages.js';

const CACHE_TTL = 180;
const DETAIL_CACHE_TTL = 600;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'http://www.38.co.kr/',
};
const BASE_URL = 'http://www.38.co.kr/html/fund/?o=k';
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

// Cache API 기반 TTL 캐시 (isolate가 바뀌어도 유지)
async function cached(key, ttl, producer, accept = () => true) {
  const cache = caches.default;
  const req = new Request(`https://cache.internal/${key}`);
  const hit = await cache.match(req);
  if (hit) {
    const data = await hit.json();
    if (accept(data)) return data;
  }
  const data = await producer();
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

async function getData() {
  return cached('list', CACHE_TTL, async () => {
    const ipos = scrapeIpos(await fetchPage(BASE_URL));
    const byRate = (a, b) => (b.rate || 0) - (a.rate || 0);
    let ongoing = ipos.filter((x) => x.status === 'ongoing').sort(byRate);
    const next = ipos.filter((x) => x.status === 'new').sort((a, b) => (a.date_start || '').localeCompare(b.date_start || ''));
    const closed = ipos.filter((x) => x.status === 'closed').sort(byRate);

    ongoing = await Promise.all(
      ongoing.map(async (ipo) => {
        if (!ipo.no) return ipo;
        try {
          const d = await getDetail(ipo.no);
          if (d.sub_rate && !ipo.rate) return { ...ipo, rate: d.sub_rate, rate_raw: `${d.sub_rate}:1` };
        } catch {}
        return ipo;
      }),
    );
    ongoing.sort(byRate);

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
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': `public, max-age=${maxAge}` },
  });

async function ipoPage(no) {
  const data = await getData();
  const ipo = [...data.ongoing, ...data.new, ...data.closed].find((x) => x.no === no);
  if (!ipo) return html(renderNotFound(), 404, 60);
  const detail = await getDetail(no);
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

export default {
  async fetch(request, env) {
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
      const m = /^\/api\/ipos\/(\d+)\/detail$/.exec(path);
      if (m) return json(await getDetail(m[1]));
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
