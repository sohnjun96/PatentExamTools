# 심사데스크 MVP

KIPRIS Plus의 특허·실용신안 데이터를 출원번호 기준으로 모아 심사관이 사건 상태와 원문을 빠르게 검토할 수 있도록 정리한 대시보드입니다.

## 구현 범위

- 출원번호 검색과 샘플 사건(`10-2020-0093844`) 체험
- 서지정보, 초록, 주 CPC·전체 CPC, 대표도면, 패밀리 상태
- 전문 XML의 명세서 장·문단과 전체 청구항 읽기 화면
- 서지상세정보에 포함된 행정처리 이력과 의견제출통지서 표시
- 보정서 접수문서번호와 청구항 변동이력을 연결한 신규·수정·삭제 및 보정 전후 비교
- 의견제출통지서 PDF_V2 원문, 표 보존 마크다운과 AI 요약 조회
- OpenAI Responses API 기반 발명·청구범위·심사 포인트 구조화 요약
- D1 사건·원문 XML/PDF·AI 요약 캐시와 KIPRIS API 누적 호출량 저장
- 원문 근거 위치 이동·인용문 강조와 사건별 작업 위치 복원
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

화면을 열 때는 저장된 청구항 변동이력만 확인합니다. 청구범위·명세서 보정이 확인된 사건의 AI 일괄분석 또는 명시적인 조회 버튼에서만 `ClaimsChangeHistoryService/amendmentHistoryDetailInfo`를 호출합니다. 응답은 D1에 캐시합니다. `[출원서 등 보완]보정서` 등 절차·서지 보완은 청구항 보정으로 취급하지 않습니다. 제목만으로 보정 대상을 알 수 없는 문서는 실제 변동이력이 확인되기 전까지 분석에서 제외합니다.

행정처리는 서지상세 응답의 `legalStatusInfoArray`에서 구성하므로 별도의 통합이력 API를 호출하지 않습니다. 같은 출원번호는 D1 캐시를 우선 사용해 KIPRIS 호출량을 줄입니다.

- `GET /api/patent/fulltext?applicationNumber=...`: 최초 열람/분석 시 전문파일정보를 1회 호출하고 XML 원문을 D1에 보관합니다. 반복 열람은 원문 캐시를 현재 파서로 재해석합니다. `raw=true`는 저장된 XML을 내려받고, `refresh=true`는 명시적으로 최신 원문을 조회합니다.
- `GET /api/patent/pdf?applicationNumber=...&sendNumber=...`: 최초 열람/분석 시 PDF_V2를 1회 호출하고 PDF 원문을 D1에 보관합니다. 이후에는 캐시를 반환하며, `refresh=true`일 때만 다시 조회합니다.
- `GET /api/patent/claim-changes?applicationNumber=...`: 청구항 변동이력을 D1에서 우선 반환합니다. `cachedOnly=true`는 캐시만 확인하며 없으면 404를 반환합니다. `refresh=true`는 API 1회를 사용해 갱신합니다.
- `GET|POST /api/patent/notice-analysis?applicationNumber=...&sendNumber=...`: 저장된 통지서 마크다운·요약을 조회하거나 새로 생성합니다.
- `GET|POST /api/patent/summary?applicationNumber=...`: 저장된 AI 요약을 조회하거나 OpenAI로 생성합니다.
- `GET /api/patent/usage`: D1에 누적된 KIPRIS 호출량을 반환합니다.

OpenAI 요청에는 `store: false`를 사용합니다. AI 결과는 심사 결론이 아니라 원문 확인을 돕는 보조자료로 표시합니다.

### 분석 기준과 원문 확인

- 사건을 열거나 원문 패널을 열었다고 AI 분석을 새로 실행하지 않습니다. AI 일괄분석·재분석은 명시적인 버튼으로 실행합니다.
- AI 생성일, 서지 조회일, 전문 조회일, 원문 해시와 프롬프트 버전을 구분합니다. 이력 또는 저장된 전문이 바뀌면 기존 분석을 변경 전 자료 기반으로 표시합니다. 긴 명세서의 입력 범위가 잘렸다면 부분 분석임을 표시합니다.
- 조회한 XML 청구항이 어느 보정 시점의 청구범위인지 확인되지 않으면 이를 현재 청구항이라고 단정하지 않습니다. 통지서의 등록가능항도 통지 당시의 정보로 표시합니다.
- 근거를 누르면 현재 작업 화면을 유지한 채 사건자료 패널이 해당 청구항·문단으로 이동합니다. 인용문이 실제 원문과 일치할 때만 강조하고, 일치하지 않는 경우 명확히 알립니다.
- 통지서 텍스트는 `[심사결과]` 위의 서지사항과 말미 안내를 제외합니다. 기존 분석에도 같은 정제가 적용되며 추가 OpenAI 호출은 없습니다. 셀 내부 개행은 `<br/>`로 복원하고, 표의 열 수가 맞지 않으면 임의로 채우지 않고 PDF 대조 경고와 추출 순서 목록을 표시합니다.
- 모바일 패널은 전체 화면·안전영역을 사용하고 뒤로가기/Esc 닫기, 배경 스크롤 잠금, 포커스 복원을 지원합니다. 사건별 메뉴·선택 청구항·회차·검색 역할·스크롤 위치는 브라우저에 보관합니다.

원문은 SHA-256 검증과 1.5MB 단위 BLOB 분할로 D1에 저장합니다. 추가 스토리지 바인딩은 필요하지 않습니다. 동시 요청 병합은 같은 Worker 인스턴스 안에서 적용되며, 별도 인스턴스 간의 전역 잠금은 아닙니다. 원문 캐시는 자동 만료하지 않으므로 사건 수가 늘면 D1 용량과 보관 정책을 관리해야 합니다.

### kordoc 연동

`kordoc`은 PDF 표 복원에 적합하지만 패키지의 PDF 진입점이 `onnxruntime-node`, `fs`, `child_process` 등 Node 전용 모듈을 함께 참조하므로 현재 Cloudflare Worker 번들에 직접 포함하지 않습니다. 기본 배포에서는 OpenAI PDF 입력으로 마크다운과 요약을 생성합니다.

별도의 Node.js kordoc 파서 서비스를 배포한 경우 `KORDOC_API_URL`과 선택 Secret `KORDOC_API_TOKEN`을 설정하면 kordoc 마크다운을 우선 사용하고 OpenAI는 요약만 수행합니다. 파서 서비스는 `Content-Type: application/pdf` 요청을 받아 다음 중 하나를 반환해야 합니다.

```json
{ "success": true, "markdown": "# 의견제출통지서\n..." }
```

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
- Variable: `KORDOC_API_URL` (별도 Node 파서 서비스를 사용할 때만)
- Secret: `KORDOC_API_TOKEN` (파서 서비스 인증을 사용할 때만)
- Variable: `NEXT_PUBLIC_SITE_URL`

첫 배포에서는 `DB` D1 바인딩의 `patent-examiner-db`가 자동 프로비저닝됩니다. 이미 만든 D1을 사용하면 빌드 환경변수 `CLOUDFLARE_D1_DATABASE_ID`에 데이터베이스 ID를 지정합니다. `migrations/0001_initial.sql`부터 `0005_original_documents.sql`까지의 마이그레이션과 런타임 초기화가 동일한 스키마를 보장합니다. 원문 캐시 테이블은 기존 DB에서도 런타임 초기화로 생성됩니다.

`.node-version`으로 Cloudflare 빌드 환경의 Node.js를 22로 고정합니다. 빌드 후 생성되는 `dist/server/wrangler.json`이 Worker 엔트리와 정적 에셋 경로를 정의하며 `dist`는 저장소에 커밋하지 않습니다.

## 공개 배포 전 확인

- 사이트가 공개되어도 API 키는 서버 Secret에서만 사용됩니다.
- 공개 사용자가 KIPRIS·OpenAI 호출을 발생시킬 수 있으므로 Cloudflare Rate Limiting을 적용하는 것이 좋습니다.
- 원문 XML/PDF의 열람·보관·다운로드 정책을 확인해야 합니다.

## 검증

```powershell
npm run lint
npm exec tsc -- --noEmit
npm run test:claims
npm run test:summary
npm run test:workflow
npm run test:api
npm run build
```

`test:api`는 Miniflare의 임시 D1과 모의 응답만 사용합니다. 외부 네트워크를 차단하고 전문/PDF 캐시·동시 조회·원문 다운로드·기존 통지서 정제·절차 보정서 제외·3.1MB 원문 분할 복원을 확인합니다. 실제 API 키나 운영 DB를 사용하지 않습니다. 테스트 의존성은 Wrangler/Vite의 개발 의존성으로 설치됩니다.

Node.js 24.13은 프로젝트의 지원 범위 밖입니다. 이 버전에서 빌드가 진단 없이 종료될 경우 Node.js 22 LTS 또는 24.19 이상으로 실행하세요.
