# 블로그 글 생성기

주제와 키워드를 넣으면 Claude가 SEO에 맞춘 블로그 글을 써 주는 웹앱입니다.
만든 글은 화면에서 고치고, 저장하고, 마크다운이나 HTML로 내보낼 수 있습니다.

## 기능

- **2단계 생성**: 제목 후보 5개와 목차를 먼저 만들고, 고르고 고친 목차로 본문을 생성합니다. 본문은 실시간 스트리밍으로 보여 줍니다.
- **메타 정보**: 메타 설명(150자 이내), 태그 10개, 썸네일 문구 3개, 세 줄 요약
- **부분 다시 쓰기**: 본문에서 문단을 선택해 다시 쓰기 / 더 길게 / 더 짧게 / 말투 바꾸기
- **글 관리**: 목록, 검색, 상태(초안/완료) 필터, 수정, 삭제
- **내보내기**: 마크다운 복사, HTML 복사, `.md` 파일 다운로드
- **SEO 체크**: 제목 길이, 키워드 위치와 밀도, 소제목 수, 글자 수를 점수로 표시
- **토큰 사용량**: 글마다 사용한 입력·출력 토큰을 누적해 보여 줍니다.
- 반응형 화면과 다크 모드를 지원합니다.

## 기술 스택

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Prisma + SQLite · Anthropic SDK (`claude-sonnet-5-5`) · Vitest

## 설치와 실행

```bash
cd blog-generator
npm install
cp .env.example .env      # ANTHROPIC_API_KEY 값을 채워 넣으세요
npm run db:push           # SQLite DB(prisma/dev.db) 생성
npm run dev               # http://localhost:3000
```

운영 빌드는 `npm run build && npm start` 입니다.

## 환경 변수

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | 예 | Claude API 키. 서버에서만 읽고 브라우저로 보내지 않습니다. |
| `DATABASE_URL` | 예 | 기본값 `file:./dev.db` (SQLite) |
| `CLAUDE_MODEL` | 아니요 | 사용할 모델. 기본값 `claude-sonnet-5-5` |

## 테스트

```bash
npm test        # 프롬프트 템플릿, SEO 점수, 입력 검증 단위 테스트
npm run lint    # 타입 검사
```

## 구조

```
app/
  page.tsx                대시보드 (목록·검색)
  new/page.tsx            생성 폼 → 제목·목차 → 본문 생성
  posts/[id]/page.tsx     에디터, 미리보기, 부분 다시 쓰기, SEO, 내보내기
  api/outline             1단계: 제목 후보·목차 (구조화 출력)
  api/generate            2단계: 본문 (NDJSON 스트리밍)
  api/meta                메타 설명·태그·썸네일 문구·요약 (구조화 출력)
  api/rewrite             부분 다시 쓰기 (NDJSON 스트리밍)
  api/posts[/id]          글 CRUD
lib/
  prompts.ts              시스템 프롬프트와 단계별 프롬프트 템플릿
  seo.ts                  SEO 점수 계산
  schemas.ts              zod 입력·출력 스키마
  claude.ts               Claude 클라이언트, 오류 메시지 변환, 토큰 집계
  stream.ts / events.ts   서버 스트리밍 / 브라우저 NDJSON 읽기
prisma/schema.prisma      Post 모델
```

## 참고

- **모델 호출**: 본문 생성은 `effort: "medium"`, 목차·메타·다시 쓰기는 `effort: "low"`로 호출합니다. 품질이나 비용에 맞게 `app/api/*/route.ts`에서 조정하세요.
- **거절 대비 fallback**: Claude가 안전 정책으로 요청을 거절하면 서버가 다른 모델로 자동 재시도하도록 `fallbacks: "default"`를 켜 두었습니다(`lib/claude.ts`). Claude API에서만 동작하므로, Amazon Bedrock이나 Vertex AI로 옮길 때는 이 설정을 빼야 합니다.
- **Postgres로 옮기기**: `prisma/schema.prisma`의 `provider`를 `"postgresql"`로 바꾸고 `DATABASE_URL`을 교체한 뒤 `npm run db:push`를 실행하세요. 검색은 대소문자를 구분하지 않도록 `mode: "insensitive"`를 추가하는 것이 좋습니다.
- **로그인 없음**: 현재는 혼자 쓰는 앱을 기준으로 만들었습니다. 여러 사람이 쓴다면 인증(NextAuth 등)과 사용자별 글 분리를 추가하세요.
