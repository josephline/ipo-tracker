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
CACHE_TTL = 180  # 3분 캐시

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0',
    'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'http://www.38.co.kr/',
}

BASE_URL = 'http://www.38.co.kr/html/fund/?o=k'


def parse_date(s: str):
    """'2026.05.29' → date 객체"""
    try:
        return datetime.strptime(s.strip(), '%Y.%m.%d').date()
    except Exception:
        return None


def classify(start: date | None, end: date | None, rate: str) -> str:
    today = date.today()
    if start is None or end is None:
        return 'new'
    if today < start:
        return 'new'
    if start <= today <= end:
        return 'ongoing'
    return 'closed'


def parse_rate(raw: str) -> float | None:
    """'1194.94:1' → 1194.94"""
    m = re.search(r'([\d,]+\.?\d*)\s*:\s*1', raw)
    if m:
        return float(m.group(1).replace(',', ''))
    return None


async def fetch_page(url: str) -> str:
    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as c:
        r = await c.get(url, headers=HEADERS)
        return r.content.decode('euc-kr', errors='replace')


def scrape_ipos(html: str) -> list[dict]:
    soup = BeautifulSoup(html, 'lxml')
    tables = soup.find_all('table')

    # Table 15 contains the main IPO schedule (confirmed by test)
    target = None
    for t in tables:
        text = t.get_text()
        if '청약경쟁률' in text and '희망공모가' in text and '확정공모가' in text:
            target = t
            break

    if not target:
        return []

    results = []
    rows = target.find_all('tr')

    for row in rows:
        cells = [td.get_text(strip=True) for td in row.find_all('td')]
        if len(cells) < 5:
            continue

        # Row pattern: 종목명, 청약일정, 확정공모가, 희망공모가, 경쟁률, 주간사, ...
        # First cell should be company name (contains date pattern in 2nd cell)
        name = cells[0].strip()
        date_raw = cells[1].strip() if len(cells) > 1 else ''
        confirmed_price = cells[2].strip() if len(cells) > 2 else ''
        hope_price = cells[3].strip() if len(cells) > 3 else ''
        rate_raw = cells[4].strip() if len(cells) > 4 else ''
        underwriter = cells[5].strip() if len(cells) > 5 else ''

        # Validate: date cell should match pattern YYYY.MM.DD~MM.DD
        if not re.match(r'\d{4}\.\d{2}\.\d{2}', date_raw):
            continue
        if not name or name.isdigit():
            continue

        # Parse dates: '2026.05.26~05.27' or '2026.05.26~2026.05.27'
        date_parts = re.findall(r'(\d{4}\.\d{2}\.\d{2})', date_raw)
        if len(date_parts) == 1:
            # end might be MM.DD only
            m = re.search(r'~(\d{2}\.\d{2})$', date_raw)
            if m:
                year = date_parts[0][:4]
                end_str = f"{year}.{m.group(1)}"
                date_parts.append(end_str)

        start_date = parse_date(date_parts[0]) if date_parts else None
        end_date = parse_date(date_parts[1]) if len(date_parts) > 1 else start_date

        rate = parse_rate(rate_raw)
        status = classify(start_date, end_date, rate_raw)

        # Parse underwriter — remove 분석 link text etc
        underwriter = re.sub(r'분석$', '', underwriter).strip()

        # Determine market: 종목명 끝에 (유가) 표시가 있으면 KOSPI
        market = 'kospi' if '(유가)' in name or '(유가)' in date_raw else 'kosdaq'
        name_clean = name.replace('(유가)', '').strip()

        # Confirmed price (원)
        price = None
        if confirmed_price and confirmed_price != '-':
            price_str = confirmed_price.replace(',', '').replace('원', '').strip()
            try:
                price = int(price_str)
            except Exception:
                pass

        results.append({
            'name': name_clean,
            'market': market,
            'date_start': start_date.isoformat() if start_date else None,
            'date_end': end_date.isoformat() if end_date else None,
            'price': price,
            'price_range': hope_price if hope_price and hope_price != '-' else None,
            'rate': rate,
            'rate_raw': rate_raw if rate_raw and rate_raw != '-' else None,
            'underwriter': underwriter if underwriter and underwriter != '-' else None,
            'status': status,
        })

    return results


async def get_data() -> dict:
    now = time.time()
    if CACHE['data'] and now - CACHE['ts'] < CACHE_TTL:
        return CACHE['data']

    try:
        html = await fetch_page(BASE_URL)
        ipos = scrape_ipos(html)

        ongoing = [x for x in ipos if x['status'] == 'ongoing']
        new = [x for x in ipos if x['status'] == 'new']
        closed = [x for x in ipos if x['status'] == 'closed']

        # Sort
        ongoing.sort(key=lambda x: -(x['rate'] or 0))
        new.sort(key=lambda x: x['date_start'] or '')
        closed.sort(key=lambda x: -(x['rate'] or 0))

        result = {
            'ongoing': ongoing,
            'new': new,
            'closed': closed,
            'updated_at': datetime.now().isoformat(timespec='seconds'),
            'source': '38커뮤니케이션',
        }
        CACHE['data'] = result
        CACHE['ts'] = now
        return result

    except Exception as e:
        if CACHE['data']:
            return CACHE['data']
        raise e


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


@app.route('/')
def index():
    return app.send_static_file('index.html')


if __name__ == '__main__':
    print('Server running: http://localhost:5000')
    app.run(debug=False, port=5000, threaded=True)
