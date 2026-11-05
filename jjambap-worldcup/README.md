# 🍚 오늘의 짬밥 월드컵 (토스 미니앱)

이번 주 식단 메뉴로 1:1 토너먼트를 해서 "오늘의 최애 짬밥"을 뽑는 앱인토스(Apps in Toss) WebView 미니앱이에요.

## 기능
- **월드컵**: 4강 / 8강 / 16강 (메뉴가 32개 이상이면 32강) 중에서 골라 무작위 대진으로 진행해요.
- **결과 화면**: 우승 메뉴와 결승 상대를 보여주고 컨페티와 햅틱 효과가 나와요. 결과를 공유할 수 있어요.
- **명예의 전당**: 메뉴별 누적 우승 횟수와 1:1 승률 랭킹을 보여줘요.
- **식단 편집**: 이번 주 메뉴를 추가하거나 삭제할 수 있어요 (최소 4개).

## 토스 연동 (`src/bridge.ts`)
| 기능 | 토스 앱 안 | 일반 브라우저 |
|---|---|---|
| 저장 | `Storage` (SDK) | `localStorage` |
| 공유 | `Share.sendMessage` | `navigator.share` → 클립보드 |
| 진동 | `generateHapticFeedback` | `navigator.vibrate` |

SDK는 토스 앱 안에서만 동적으로 불러와요. 그래서 일반 브라우저에서도 그대로 테스트할 수 있어요.

## 실행
```bash
npm install
npm run dev:web      # 브라우저에서 바로 확인 (http://localhost:5173)
npm run dev          # granite 개발 서버 (토스 샌드박스 앱으로 확인)
npm run build        # .ait 번들 생성
npm run deploy       # 앱인토스 콘솔에 업로드 (콘솔 API 키 필요)
```

## 출시 전 체크리스트
1. [앱인토스 콘솔](https://apps-in-toss.toss.im)에서 앱을 등록하고, `granite.config.ts`의 `appName`을 콘솔에 등록한 이름과 맞춰 주세요.
2. 콘솔에서 앱 아이콘과 표시 이름을 등록해 주세요.
3. 검수 가이드에 맞춰 UI를 TDS(`@toss/tds-mobile`) 컴포넌트로 바꿀지 검토해 주세요. 지금은 토스 스타일을 흉내 낸 자체 CSS예요.
4. 기록은 **기기마다 따로** 저장돼요. 부대원 전체 투표 랭킹을 하려면 서버(예: Firebase, Supabase)가 추가로 필요해요.

## 보안 메모
부대명, 위치, 인원, 실제 식단표 같은 정보는 입력받거나 저장하지 않아요. 메뉴 이름만 기기 안에 저장해요.
