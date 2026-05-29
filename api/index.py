"""
공모주 청약률 API — Vercel Serverless (Flask)
데이터 출처: 38커뮤니케이션 (www.38.co.kr)
"""
import asyncio
import re
import time
from datetime import datetime, date
from flask import Flask, jsonify, send_from_directory, Response
import httpx
from bs4 import BeautifulSoup
import os

app = Flask(__name__)

# Vercel 서버리스는 인스턴스가 재활용되므로 간단한 인메모리 캐시 유효
CACHE = {'data': None, 'ts': 0}
CACHE_TTL = 180  # 3분

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0',
    'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'http://www.38.co.kr/',
}

BASE_URL = 'http://www.38.co.kr/html/fund/?o=k'


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
    if m:
        return float(m.group(1).replace(',', ''))
    return None


async def fetch_page(url: str) -> str:
    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as c:
        r = await c.get(url, headers=HEADERS)
        return r.content.decode('euc-kr', errors='replace')


def scrape_ipos(html: str) -> list:
    soup = BeautifulSoup(html, 'lxml')
    tables = soup.find_all('table')

    target = None
    for t in tables:
        text = t.get_text()
        if '청약경쟁률' in text and '희망공모가' in text and '확정공모가' in text:
            target = t
            break

    if not target:
        return []

    results = []
    for row in target.find_all('tr'):
        cells = [td.get_text(strip=True) for td in row.find_all('td')]
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
        market = 'kospi' if '(유가)' in name or '(유가)' in date_raw else 'kosdaq'
        name_clean = name.replace('(유가)', '').strip()

        price = None
        if conf_price and conf_price != '-':
            try:
                price = int(conf_price.replace(',', '').replace('원', '').strip())
            except Exception:
                pass

        results.append({
            'name':        name_clean,
            'market':      market,
            'date_start':  start_date.isoformat() if start_date else None,
            'date_end':    end_date.isoformat()   if end_date   else None,
            'price':       price,
            'price_range': hope_price if hope_price and hope_price != '-' else None,
            'rate':        rate,
            'rate_raw':    rate_raw   if rate_raw  and rate_raw  != '-' else None,
            'underwriter': underwriter if underwriter and underwriter != '-' else None,
            'status':      status,
        })

    return results


def get_data_sync() -> dict:
    now = time.time()
    if CACHE['data'] and now - CACHE['ts'] < CACHE_TTL:
        return CACHE['data']

    html  = asyncio.run(fetch_page(BASE_URL))
    ipos  = scrape_ipos(html)

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


@app.route('/api/ipos')
def api_ipos():
    try:
        data = get_data_sync()
        resp = jsonify(data)
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Cache-Control'] = 'no-cache'
        return resp
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/')
def index():
    # index.html은 프로젝트 루트에 있음
    root = os.path.join(os.path.dirname(__file__), '..')
    return send_from_directory(root, 'index.html')


# Vercel handler
app = app
