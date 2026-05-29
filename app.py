"""
공모주 청약률 Flask API
데이터 출처: 38커뮤니케이션 (www.38.co.kr)
"""
import asyncio
import re
import time
from datetime import datetime, date
from flask import Flask, jsonify
import httpx
from bs4 import BeautifulSoup

app = Flask(__name__, static_folder='.', static_url_path='')

CACHE = {'data': None, 'ts': 0}
DETAIL_CACHE = {}          # {no: {data, ts}}
CACHE_TTL = 180            # 목록 3분
DETAIL_CACHE_TTL = 600     # 상세 10분

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0',
    'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'http://www.38.co.kr/',
}

BASE_URL = 'http://www.38.co.kr/html/fund/?o=k'
DETAIL_URL = 'http://www.38.co.kr/html/fund/?o=v&no={no}'


# ── 공통 유틸 ─────────────────────────────────────────────────────────────────

def parse_date(s: str):
    try:
        return datetime.strptime(s.strip(), '%Y.%m.%d').date()
    except Exception:
        return None


def classify(start, end):
    today = date.today()
    if start is None or end is None:
        return 'new'
    if today < start:
        return 'new'
    if start <= today <= end:
        return 'ongoing'
    return 'closed'


def parse_rate(raw: str):
    m = re.search(r'([\d,]+\.?\d*)\s*:\s*1', raw)
    return float(m.group(1).replace(',', '')) if m else None


async def fetch_page(url: str) -> str:
    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as c:
        r = await c.get(url, headers=HEADERS)
        return r.content.decode('euc-kr', errors='replace')


# ── 목록 스크래퍼 ─────────────────────────────────────────────────────────────

def scrape_ipos(html: str) -> list:
    soup = BeautifulSoup(html, 'lxml')

    target = None
    for t in soup.find_all('table'):
        text = t.get_text()
        if '청약경쟁률' in text and '희망공모가' in text and '확정공모가' in text:
            target = t
            break
    if not target:
        return []

    results = []
    for row in target.find_all('tr'):
        tds = row.find_all('td')
        cells = [td.get_text(strip=True) for td in tds]
        if len(cells) < 5:
            continue

        name        = cells[0].strip()
        date_raw    = cells[1].strip() if len(cells) > 1 else ''
        conf_price  = cells[2].strip() if len(cells) > 2 else ''
        hope_price  = cells[3].strip() if len(cells) > 3 else ''
        rate_raw    = cells[4].strip() if len(cells) > 4 else ''
        underwriter = cells[5].strip() if len(cells) > 5 else ''

        if not re.match(r'\d{4}\.\d{2}\.\d{2}', date_raw):
            continue
        if not name or name.isdigit():
            continue

        # 종목 상세 no 추출
        detail_no = None
        link = tds[0].find('a', href=True) if tds else None
        if link:
            m = re.search(r'no=(\d+)', link['href'])
            if m:
                detail_no = m.group(1)

        date_parts = re.findall(r'(\d{4}\.\d{2}\.\d{2})', date_raw)
        if len(date_parts) == 1:
            m = re.search(r'~(\d{2}\.\d{2})$', date_raw)
            if m:
                date_parts.append(f"{date_parts[0][:4]}.{m.group(1)}")

        start_date = parse_date(date_parts[0]) if date_parts else None
        end_date   = parse_date(date_parts[1]) if len(date_parts) > 1 else start_date
        rate       = parse_rate(rate_raw)
        status     = classify(start_date, end_date)

        underwriter = re.sub(r'분석$', '', underwriter).strip()
        market      = 'kospi' if '(유가)' in name or '(유가)' in date_raw else 'kosdaq'
        name_clean  = name.replace('(유가)', '').strip()

        price = None
        if conf_price and conf_price != '-':
            try:
                price = int(conf_price.replace(',', '').replace('원', '').strip())
            except Exception:
                pass

        results.append({
            'no':          detail_no,
            'name':        name_clean,
            'market':      market,
            'date_start':  start_date.isoformat() if start_date else None,
            'date_end':    end_date.isoformat()   if end_date   else None,
            'price':       price,
            'price_range': hope_price  if hope_price  and hope_price  != '-' else None,
            'rate':        rate,
            'rate_raw':    rate_raw    if rate_raw    and rate_raw    != '-' else None,
            'underwriter': underwriter if underwriter and underwriter != '-' else None,
            'status':      status,
        })

    return results


# ── 상세 스크래퍼 ─────────────────────────────────────────────────────────────

def scrape_detail(html: str) -> dict:
    soup = BeautifulSoup(html, 'lxml')
    tables = soup.find_all('table')

    result = {
        'brokers':        [],   # 증권사별 배정 정보
        'schedule':       {},   # 주요 일정
        'institutional':  None, # 기관 경쟁률
        'lockup':         None, # 의무보유확약
        'listing_date':   None, # 상장일
        'current_price':  None, # 현재가 (상장 후)
        'total_shares':   None, # 총 공모주식수
        'public_amount':  None, # 공모금액
    }

    # ── 증권사별 배정 테이블 (인수회사|주식수|청약한도|기타) ──
    # 헤더 행에 '인수회사'+'주식수' 둘 다 있고, 전체 행 수가 적은 테이블을 찾는다
    for t in tables:
        rows = t.find_all('tr')
        if len(rows) < 2 or len(rows) > 20:
            continue
        header_cells = [td.get_text(strip=True) for td in rows[0].find_all(['td', 'th'])]
        if '인수회사' in header_cells and '주식수' in header_cells:
            for row in rows[1:]:
                cells = [td.get_text(strip=True) for td in row.find_all('td')]
                if len(cells) >= 2 and cells[0]:
                    result['brokers'].append({
                        'name':   cells[0],
                        'shares': cells[1] if len(cells) > 1 else None,
                        'limit':  cells[2] if len(cells) > 2 else None,
                        'role':   cells[3] if len(cells) > 3 else None,
                    })
            break

    # ── 주요 일정 / 기관경쟁률 / 상장 정보 ──
    for t in tables:
        text = t.get_text()

        if '공모청약일' in text or '수요예측일' in text:
            for row in t.find_all('tr'):
                cells = [td.get_text(strip=True) for td in row.find_all(['td','th'])]
                txt = ' '.join(cells)

                m = re.search(r'공모청약일\s*([\d.]+)\s*~\s*([\d.]+)', txt)
                if m:
                    result['schedule']['청약일'] = f"{m.group(1)} ~ {m.group(2)}"

                m = re.search(r'수요예측일\s*([\d.]+)\s*~\s*([\d.]+)', txt)
                if m:
                    result['schedule']['수요예측일'] = f"{m.group(1)} ~ {m.group(2)}"

                m = re.search(r'상장일\s*([\d.]+)', txt)
                if m:
                    result['listing_date'] = m.group(1)
                    result['schedule']['상장일'] = m.group(1)

                m = re.search(r'납입일\s*([\d.]+)', txt)
                if m:
                    result['schedule']['납입일'] = m.group(1)

                m = re.search(r'기관경쟁률\s*([\d,.]+:\s*1)', txt)
                if m:
                    result['institutional'] = m.group(1).strip()

                m = re.search(r'의무보유확약\s*([\d.]+%)', txt)
                if m:
                    result['lockup'] = m.group(1)

                m = re.search(r'현재가\s*([\d,]+)\s*원', txt)
                if m:
                    result['current_price'] = m.group(1).replace(',', '')

        if '총공모주식수' in text:
            for row in t.find_all('tr'):
                txt = ' '.join([td.get_text(strip=True) for td in row.find_all(['td','th'])])
                m = re.search(r'총공모주식수\s*([\d,]+)\s*주', txt)
                if m:
                    result['total_shares'] = m.group(1)
                m = re.search(r'공모금액\s*([\d,]+)\s*\(백만원\)', txt)
                if m:
                    result['public_amount'] = m.group(1)

    return result


# ── 목록 API ──────────────────────────────────────────────────────────────────

async def get_data() -> dict:
    now = time.time()
    if CACHE['data'] and now - CACHE['ts'] < CACHE_TTL:
        return CACHE['data']

    html    = await fetch_page(BASE_URL)
    ipos    = scrape_ipos(html)
    ongoing = sorted([x for x in ipos if x['status'] == 'ongoing'], key=lambda x: -(x['rate'] or 0))
    new     = sorted([x for x in ipos if x['status'] == 'new'],     key=lambda x: x['date_start'] or '')
    closed  = sorted([x for x in ipos if x['status'] == 'closed'],  key=lambda x: -(x['rate'] or 0))

    result = {
        'ongoing':    ongoing,
        'new':        new,
        'closed':     closed,
        'updated_at': datetime.now().isoformat(timespec='seconds'),
        'source':     '38커뮤니케이션',
    }
    CACHE['data'] = result
    CACHE['ts']   = now
    return result


# ── 상세 API ──────────────────────────────────────────────────────────────────

async def get_detail(no: str) -> dict:
    now = time.time()
    cached = DETAIL_CACHE.get(no)
    if cached and now - cached['ts'] < DETAIL_CACHE_TTL:
        return cached['data']

    html   = await fetch_page(DETAIL_URL.format(no=no))
    detail = scrape_detail(html)
    DETAIL_CACHE[no] = {'data': detail, 'ts': now}
    return detail


@app.route('/api/ipos')
def api_ipos():
    try:
        data = asyncio.run(get_data())
        resp = jsonify(data)
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Cache-Control'] = 'no-cache'
        return resp
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/ipos/<no>/detail')
def api_detail(no):
    if not re.match(r'^\d+$', no):
        return jsonify({'error': 'invalid no'}), 400
    try:
        data = asyncio.run(get_detail(no))
        resp = jsonify(data)
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Cache-Control'] = 'no-cache'
        return resp
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/')
def index():
    return app.send_static_file('index.html')


if __name__ == '__main__':
    print('Server running: http://localhost:5000')
    app.run(debug=False, port=5000, threaded=True)
