# 심사데스크 MVP

KIPRIS Plus의 특허·실용신안 데이터를 출원번호 기준으로 모아 심사관이 사건 상태와 원문을 빠르게 검토할 수 있도록 정리한 대시보드입니다.

## 구현 범위

- 출원번호 검색과 샘플 사건(`10-2020-0093844`) 체험
- 서지정보, 초록, 주 CPC·전체 CPC, 대표도면, 패밀리 상태
- 전문 XML의 명세서 장·문단과 전체 청구항 읽기 화면
- 서지상세정보에 포함된 행정처리 이력과 의견제출통지서 표시
- 의견제출통지서 PDF_V2 원문 인라인 조회
- OpenAI Responses API 기반 발명·청구범위·심사 포인트 구조화 요약
- D1 사건 캐시·AI 요약 캐시·KIPRIS API 누적 호출량 저장
- 선택한 가공 데이터를 검토용 ZIP으로 다운로드
- KRDS 디자인 원칙을 반영한 정부 서비스형 반응형 UI

로그인 기능은 사용하지 않습니다. KIPRIS와 OpenAI 키는 Cloudflare Worker Secret으로만 관리하며 브라우저나 D1에 저장하지 않습니다.

## API 호출과 캐시

`GET /api/patent?applicationNumber=출원번호`가 초기 대시보드에 필요한 API 4개를 병렬 호출합니다.

| 화면 데이터 | KIPRIS Plus 오퍼레이션 |
|---|---|
| 서지·초록·청구항 | `getBibliographyDetailInfoSearch` |
| CPC | `patentCpcInfo` |
| 대표도면 | `getReprsntFloorPlanInfoSearch` |
| 패밀리 | `patentFamilyInfo` |

행정처리는 서지상세 응답의 `legalStatusInfoArray`에서 구성하므로 별도의 통합이력 API를 호출하지 않습니다. 같은 출원번호는 D1 캐시를 우선 사용해 KIPRIS 호출량을 줄입니다.

- `GET /api/patent/fulltext?applicationNumber=...`: 전문을 열 때만 전문파일정보와 XML 원문을 조회합니다.
- `GET /api/patent/pdf?applicationNumber=...&sendNumber=...`: 통지서를 열 때만 PDF_V2를 조회합니다.
- `GET|POST /api/patent/summary?applicationNumber=...`: 저장된 AI 요약을 조회하거나 OpenAI로 생성합니다.
- `GET /api/patent/usage`: D1에 누적된 KIPRIS 호출량을 반환합니다.

OpenAI 요청에는 `store: false`를 사용합니다. AI 결과는 심사 결론이 아니라 원문 확인을 돕는 보조자료로 표시합니다.

## 로컬 실행

Node.js 22 LTS 또는 24.19 이상을 권장합니다.

1. `.env.example`을 프로젝트 루트의 `.env`로 복사합니다.
2. `KIPRIS_API_KEY`와 `OPENAI_API_KEY`를 입력합니다.
3. `npm run dev`로 실행합니다.

```env
KIPRIS_API_KEY=...
KIPRIS_SERVICE_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
```

## Cloudflare Git 배포

Cloudflare의 `Workers & Pages`에서 이 저장소를 가져오고 다음 값을 사용합니다.

| 항목 | 값 |
|---|---|
| 프로덕션 브랜치 | `main` |
| 루트 디렉터리 | `/` |
| 빌드 명령 | `npm run build` |
| 배포 명령 | `npm run deploy` |
| 비프로덕션 배포 명령 | `npm run deploy:preview` |

런타임 `Variables and Secrets`에 다음 값을 등록합니다.

- Secret: `KIPRIS_API_KEY`
- Secret: `KIPRIS_SERVICE_KEY` (별도 키가 있을 때만)
- Secret: `OPENAI_API_KEY`
- Variable: `OPENAI_MODEL` (선택, 기본값 `gpt-5-mini`)
- Variable: `NEXT_PUBLIC_SITE_URL`

첫 배포에서는 `DB` D1 바인딩의 `patent-examiner-db`가 자동 프로비저닝됩니다. 이미 만든 D1을 사용하면 빌드 환경변수 `CLOUDFLARE_D1_DATABASE_ID`에 데이터베이스 ID를 지정합니다. `migrations/0001_initial.sql`과 런타임 초기화가 동일한 스키마를 보장합니다.

`.node-version`으로 Cloudflare 빌드 환경의 Node.js를 22로 고정합니다. 빌드 후 생성되는 `dist/server/wrangler.json`이 Worker 엔트리와 정적 에셋 경로를 정의하며 `dist`는 저장소에 커밋하지 않습니다.

## 공개 배포 전 확인

- 사이트가 공개되어도 API 키는 서버 Secret에서만 사용됩니다.
- 공개 사용자가 KIPRIS·OpenAI 호출을 발생시킬 수 있으므로 Cloudflare Rate Limiting을 적용하는 것이 좋습니다.
- 원문 XML/PDF의 열람·보관·다운로드 정책을 확인해야 합니다.
