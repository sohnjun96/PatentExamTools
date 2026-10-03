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
- 기술요약·통지 요약·보정 판단·근거·검색식·후보문헌을 HTML/마크다운 보고서 및 JSON ZIP으로 다운로드
- 심사 회차의 문서 연결 직접 확인·저장, 후보문헌 번호 수동 추가·제외·복원
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

화면을 열 때는 저장된 청구항 변동이력만 확인합니다. 청구범위·명세서 보정이 확인된 사건의 AI 분석 또는 명시적인 조회 버튼에서만 `ClaimsChangeHistoryService/amendmentHistoryDetailInfo`를 호출합니다. 응답은 D1에 캐시합니다. `[출원서 등 보완]보정서` 등 절차·서지 보완은 청구항 보정으로 취급하지 않습니다. 제목만으로 보정 대상을 알 수 없는 문서는 실제 변동이력이 확인되기 전까지 분석에서 제외합니다.

행정처리는 서지상세 응답의 `legalStatusInfoArray`에서 구성하므로 별도의 통합이력 API를 호출하지 않습니다. 같은 출원번호는 D1 캐시를 우선 사용해 KIPRIS 호출량을 줄입니다.

- `GET /api/patent/fulltext?applicationNumber=...`: 최초 열람/분석 시 전문파일정보를 1회 호출하고 XML 원문을 D1에 보관합니다. 반복 열람은 원문 캐시를 현재 파서로 재해석합니다. `raw=true`는 저장된 XML을 내려받고, `refresh=true`는 명시적으로 최신 원문을 조회합니다.
- `GET /api/patent/pdf?applicationNumber=...&sendNumber=...`: 최초 열람/분석 시 PDF_V2를 1회 호출하고 PDF 원문을 D1에 보관합니다. 이후에는 캐시를 반환하며, `refresh=true`일 때만 다시 조회합니다.
- `GET /api/patent/claim-changes?applicationNumber=...`: 청구항 변동이력을 D1에서 우선 반환합니다. `cachedOnly=true`는 캐시만 확인하며 없으면 404를 반환합니다. `refresh=true`는 API 1회를 사용해 갱신합니다.
- `GET|POST /api/patent/notice-analysis?applicationNumber=...&sendNumber=...`: 저장된 통지서 마크다운·요약을 조회하거나 새로 생성합니다.
- `GET|POST /api/patent/summary?applicationNumber=...`: 저장된 AI 요약을 조회하거나 OpenAI로 생성합니다.
- `GET /api/patent/usage`: D1에 누적된 KIPRIS 호출량을 반환합니다.
- `GET|PUT /api/patent/round-links?applicationNumber=...`: 통지 회차별 의견서·청구항 보정서·결정의 사용자 연결을 D1에 저장합니다. 접수 이력이 바뀌면 이전 연결을 자동 적용하지 않습니다.
- `GET|POST|DELETE /api/patent/candidates?applicationNumber=...`: 수동 입력한 후보문헌을 저장·제외합니다. 같은 번호로 다시 추가하면 복원되며 자동 검색·구성 대응 판정은 하지 않습니다.

OpenAI 요청에는 `store: false`를 사용합니다. AI 결과는 심사 결론이 아니라 원문 확인을 돕는 보조자료로 표시합니다.

### 분석 기준과 원문 확인

- 사건을 열거나 원문 패널을 열었다고 AI 분석을 새로 실행하지 않습니다. AI 분석·재분석은 명시적인 버튼으로 실행합니다.
- AI 생성일, 서지 조회일, 전문 조회일, 원문 해시와 프롬프트 버전을 구분합니다. 이력 또는 저장된 전문이 바뀌면 기존 분석을 변경 전 자료 기반으로 표시합니다. 긴 명세서의 입력 범위가 잘렸다면 부분 분석임을 표시합니다.
- 조회한 XML 청구항이 어느 보정 시점의 청구범위인지 확인되지 않으면 이를 현재 청구항이라고 단정하지 않습니다. 통지서의 등록가능항도 통지 당시의 정보로 표시합니다.
- 근거를 누르면 현재 작업 화면을 유지한 채 사건자료 패널이 해당 청구항·문단으로 이동합니다. 인용문이 실제 원문과 일치할 때만 강조하고, 일치하지 않는 경우 명확히 알립니다.
- 통지서 텍스트는 `[심사결과]` 위의 서지사항과 말미 안내를 제외합니다. 기존 분석에도 같은 정제가 적용되며 추가 OpenAI 호출은 없습니다. 셀 내부 개행은 `<br/>`로 복원하고, 표의 열 수가 맞지 않으면 임의로 채우지 않고 PDF 대조 경고와 추출 순서 목록을 표시합니다.
- 모바일 패널은 전체 화면·안전영역을 사용하고 뒤로가기/Esc 닫기, 배경 스크롤 잠금, 포커스 복원을 지원합니다. 사건별 메뉴·선택 청구항·회차·검색 역할·스크롤 위치는 브라우저에 보관합니다.
- 과거 청구항은 청구항 변동이력을 시간순으로 재구성합니다. 현재 XML 문언을 과거 버전의 초기값으로 사용하지 않습니다. 최초 출원서가 확인되지 않거나 일부 문언만 확보되면 변경된 항만 비교하고 전체 인용 구조를 만들지 않습니다.
- 분석 완료 여부는 실제 원문 해시, 통지서 PDF, 보정 문언과 연결 상태를 기준으로 결정합니다. 같은 문서번호여도 내용이 달라지면 종속 분석은 다시 확인합니다. 보정 해소 검토는 연결된 모든 보정 자료와 최신 통지 분석이 확보된 경우에만 실행합니다.
- 검색 방향은 청구항별로 용어와 직접 편집한 검색식을 보관합니다. 제외·확인 필요 구성의 관련 용어는 자동 검색식에서 빠지며, 발명의 명칭과 CPC는 기본 강제 조건이 아닌 선택 조건입니다.
- 검토결과 내려받기는 추가 AI 호출을 하지 않습니다. 원문 포함을 선택하면 이미 저장된 XML·PDF만 포함하고 미확보 파일은 포함내역에 표시합니다.

원문은 SHA-256 검증과 1.5MB 단위 BLOB 분할로 D1에 저장합니다. 추가 스토리지 바인딩은 필요하지 않습니다. 원문 동시 요청 병합은 같은 Worker 인스턴스 안에서 적용됩니다. AI 요청은 같은 인스턴스에서는 결과를 공유하고, 다른 인스턴스에서는 D1 잠금으로 중복 실행을 차단합니다. 원문 캐시는 자동 만료하지 않으므로 사건 수가 늘면 D1 용량과 보관 정책을 관리해야 합니다.

### 공개 API 호출 보호

일일 상한과 분당 상한은 D1의 원자적 카운터를 사용합니다. 상한을 초과하면 외부 요청 전에 429를 반환하고, 이미 저장된 자료 열람은 계속 허용합니다. 실패·출력 부족 재시도를 포함해 실제 외부 요청마다 계산합니다.

| 런타임 Variable | 기본값 | 의미 |
|---|---|---|
| `OPENAI_DAILY_LIMIT` | `80` | 하루 OpenAI 요청 상한 |
| `KIPRIS_DAILY_LIMIT` | `500` | 하루 KIPRIS 오퍼레이션 호출 상한 |
| `AI_REANALYZE_COOLDOWN_SECONDS` | `30` | 같은 AI 입력 재실행 대기시간 |

일일 기준은 한국시간 00시입니다. 각 일일 상한은 0으로 설정하면 신규 호출을 중지합니다. 분당 상한은 OpenAI 12회, KIPRIS 60회입니다. 오늘 사용량은 더보기 메뉴에 표시합니다. 값은 Worker 런타임 Variables에 설정하며 API Secret과는 별개입니다.

브라우저의 교차 출처 변경 요청도 거절합니다. 다만 로그인 없는 공개 서비스이므로 호출 상한과 출처 확인은 인증·접근권한을 대신하지 않습니다. 필요하다면 별도의 Cloudflare WAF/Rate Limiting으로 접근을 제한하세요.

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
- Variable: `OPENAI_DAILY_LIMIT`, `KIPRIS_DAILY_LIMIT`, `AI_REANALYZE_COOLDOWN_SECONDS` (선택, 위 기본값 적용)

첫 배포에서는 `DB` D1 바인딩의 `patent-examiner-db`가 자동 프로비저닝됩니다. 이미 만든 D1을 사용하면 빌드 환경변수 `CLOUDFLARE_D1_DATABASE_ID`에 데이터베이스 ID를 지정합니다. `migrations/0001_initial.sql`부터 `0006_workflow_controls.sql`까지의 마이그레이션과 런타임 초기화가 동일한 스키마를 보장합니다. 원문 캐시·문서 연결·호출 보호 테이블은 기존 DB에서도 런타임 초기화로 생성됩니다. 기존 D1을 삭제할 필요가 없습니다.

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
npm run test:review
npm run test:design
npm run test:text
npm run build
```

`test:api`는 Miniflare의 임시 D1과 모의 응답만 사용합니다. 외부 네트워크를 차단하고 원문 캐시·PDF 버전 검증·수동 문서 연결·후보문헌 저장 및 복원·일일 상한·AI 동시 요청 병합과 재실행 대기·3.1MB 원문 복원을 확인합니다. `test:review`는 과거 청구항 복원·검색 제외·분석 무효화·근거 위치·보고서 내용 및 HTML 이스케이프를 확인합니다. 실제 API 키나 운영 DB를 사용하지 않습니다. 테스트 의존성은 Wrangler/Vite의 개발 의존성으로 설치됩니다.

`test:design`은 렌더링된 HTML과 스타일을 통해 AI 실행 버튼의 우선 배치, 경고 노출, 분석 상세 펼침 조건, 청구항 트리 진입점, 모바일 본문 크기와 메뉴의 스크롤·접근성 구조를 확인합니다. 작동 흐름 1~5단계의 긴 문장·복수 근거·근거 누락도 검사합니다. 실제 API를 호출하지 않으며, 실기기 화면·터치 검증은 별도로 필요합니다.

빌드 후 `npm run test:design -- --preview`를 실행하면 실제 빌드 CSS와 모의자료로 작동 흐름을 확인하는 로컬 주소가 출력됩니다. 단계 수와 영역 폭을 바꿔 확인할 수 있으며, KIPRIS·OpenAI API나 운영 DB는 사용하지 않습니다.

`test:text`는 원문의 `<sup>`·`<sub>`와 인코딩된 태그, 개행, 검색·근거 하이라이트, 보정문 삽입·삭제 서식 및 안전한 HTML 출력을 검증합니다. 10-2023-0100001의 저장된 원문에서 추출한 9개 공개 청구항을 회귀 자료로 포함해 위첨자 위치와 인용관계도 검사합니다. 빌드 후 `npm run test:text -- --preview`로 이 사건의 수정된 청구항을 확인할 수 있습니다.

전문은 순서 보존 XML 파서(`fulltext-xml-v4`)로 처리합니다. 사건을 복원할 때는 저장된 XML만 조회해 기존 청구항을 다시 파싱하며, 캐시가 없으면 외부 API를 자동 호출하지 않습니다. 원문 다운로드와 원문 해시는 변경하지 않습니다. 이전 파서 기반 AI 분석은 갱신 필요로 표시하고, 구형 파싱 결과를 입력한 AI 요청은 호출 전에 차단합니다. 새 AI 분석은 사용자 실행 시에만 생성됩니다.

Node.js 24.13은 프로젝트의 지원 범위 밖입니다. 이 버전에서 빌드가 진단 없이 종료될 경우 Node.js 22 LTS 또는 24.19 이상으로 실행하세요.
