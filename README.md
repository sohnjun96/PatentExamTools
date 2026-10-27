# 선행기술 AI 검색 포털 · AI 검색 결과 평가

UI·UX는 공식 `krds-uiux@1.1.0` 컴포넌트·토큰과 Pretendard GOV를 적용했습니다. PDF 중복·해외 혼합 처리, 오류 복구, 역할별 진입, 작업 위치 복원과 키보드 조작을 보완했습니다. 요청한 Toss UX 라이팅 점검안도 모두 반영했습니다. 최신 문구·동작·검증 결과는 [UX 라이팅 적용 결과](docs/UX_WRITING_APPLIED.md), 앞선 디자인 변경은 [KRDS UI·UX 수정 결과](docs/KRDS_UI_UX_IMPLEMENTATION.md)에 있습니다. 이전 [UI·UX 점검 기록](docs/UI_UX_REVIEW.md)은 수정 전 상태를 기록한 문서입니다.

`AI 평가 시스템 설계`의 업무 규칙을 바탕으로 월별 평가 업무를 첫 화면에 추가했습니다. 기존 KIPRIS Plus 사건 조회·명세서·청구항·행정이력·패밀리·AI 요약은 `/patent`에 보존했습니다.

## 개편한 화면

심사국별 주소는 `/기획국`, `/융합국`, `/전기국`, `/화학국`, `/기계국`, `/반도체단`입니다. 각 주소 뒤에 `/rhksfl`을 붙이면 해당 심사국의 계정·AI 종류·월별 배정을 관리합니다. 계정과 평가 자료는 심사국별로 분리하며 기존 공용 자료는 보존합니다. AI 담당 업무의 목록에서는 대상별 공개공보 PDF를 바로 받고, 실패 시 오류 토스트를 확인할 수 있습니다. 자세한 사용법과 저장 범위는 [심사국별 업무 안내](docs/BUREAU_WORKSPACES.md)에 있습니다.

각 심사국 관리 페이지의 **공지사항 관리**에서 마크다운 공지를 작성하고 미리본 뒤 저장할 수 있습니다. 공지는 해당 심사국 메인 페이지와 사용자 업무 화면에 표시되며, 운영월에 관계없이 관리합니다. 내용을 비워 저장하거나 **공지 내리기**를 누르면 게시가 종료됩니다.

AI 검색 문헌에는 특허번호·논문 제목·서지정보·DOI·원문 URL을 등록할 수 있습니다. 국내 공개번호는 검색 링크에서 권리구분 `10`을 제외하고, 논문 제목은 학술 검색, DOI·URL은 원문 링크로 연결합니다. 입력한 문헌 정보는 그대로 저장합니다.

| 경로 | 용도 |
|---|---|
| `/` | 심사과·이름 선택, 내 심사 업무, AI 담당 업무 |
| `/admin` | 사용자 선택 없이 관리자 통계·현황, 사용자·그룹·조사 방식·월별 배정 관리 |
| `/documents` | 국내 문헌 전문 PDF 개별 저장·최대 50건 ZIP 저장 |
| `/patent` | 기존 KIPRIS 사건 조회 화면 (`?applicationNumber=...` 연결 지원) |
| `/fulltext` | 기존 전문 XML 읽기 화면 |

관리자 화면에서 사용자·그룹을 만든 다음 운영월의 참여 심사관·AI 담당자·비교 방식을 설정합니다. 일반사용자는 본인을 선택해 대상을 임시저장·선정 확정하고, AI 담당자는 맡은 그룹과 조사 방식에 문헌번호를 최대 7개 입력합니다. 입력 완료한 결과만 심사관에게 공개됩니다. 문헌별 평가와 품질 순위는 별도로 저장하며, 결과 변경 후에는 기존 평가를 최신 통계에서 제외하고 재확인을 표시합니다.

AI 담당 업무의 출원 옆에서 공개·등록공보 전문 PDF를 바로 저장할 수 있습니다. 검색 문헌은 ‘검색 문헌 PDF 모으기’로 전달한 후 **출원번호·공개번호·등록번호를 직접 구분**해 받습니다. PDF는 실제 KIPRIS 파일을 검증해 반환하며 XML을 PDF로 바꾸거나 확장자를 바꾸지 않습니다. PDF API와 실연동 확인 결과는 [연동 문서](docs/KIPRIS_PDF_INTEGRATION.md)에 기록했습니다.

엑셀은 실제 `.xlsx`이며, 번호·사용자 입력은 수식으로 실행되지 않는 텍스트로 보존합니다. 저장 대화상자를 지원하는 브라우저에서는 폴더와 파일명을 선택하고 취소할 수 있습니다. 미지원 브라우저에서는 파일명을 입력한 후 브라우저 다운로드 설정을 따르며, 화면에서도 전체 저장 경로를 확인할 수 없음을 안내합니다.

평가 자료는 D1의 `evaluation_workspace`에 저장합니다. 목록 확정·결과 공개·평가 저장은 한 번의 원자적 갱신으로 처리하며, 다른 화면의 저장과 충돌하면 409를 반환하고 입력을 유지합니다. 현재 충돌 검사는 전체 업무 공간의 revision 단위이므로 다른 출원을 동시에 저장한 경우에도 최신 자료 새로고침이 필요할 수 있습니다. 사용자 선택과 관리자 직접 진입은 요구사항에 따른 간편 업무 진입 방식이며 별도의 인증을 제공하지 않습니다.

## 검증

운영 자료가 없는 초기 상태에서는 관리자 운영 관리에서 가상 검증 자료를 명시적으로 불러올 수 있습니다. 가상 자료는 10명·2그룹·20출원·40결과 묶음·280문헌이며 실제 출원·검색 실적으로 표시하지 않습니다.

```powershell
node --experimental-strip-types scripts/test-evaluation.mjs
node scripts/test-evaluation-storage.mjs
node --test --experimental-strip-types scripts/test-patent-document.ts
node scripts/test-export-workbook.mjs
npx tsc --noEmit --incremental false
npm run build
```

빌드는 `package.json`의 지원 Node 버전(22.13 이상 22.x 또는 24.19 이상)이 필요합니다. 별도 UI 검증에는 `PATENT_DEV_STATE_PATH=.wrangler/evaluation-qa`를 지정하면 기존 로컬 D1 자료와 다른 저장소를 사용합니다.

## 기존 사건 조회 기능

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

`npm run build`는 먼저 잠금파일의 의존성 참조를 검사합니다. `npm run check:lockfile`로 별도 실행할 수도 있습니다. Cloudflare의 npm 10.9.2와 로컬 npm 버전이 다르면 설치된 `node_modules`를 바탕으로 갱신한 잠금파일에서 다른 플랫폼의 선택 의존성이 누락될 수 있습니다. 의존성을 변경할 때는 별도 빈 폴더에서 `package.json`과 `package-lock.json`만 복사해 CI와 같은 npm 버전으로 `npm install --package-lock-only`를 실행하고, `npm ci`로 확인한 잠금파일을 반영하세요.

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

관리 화면은 계정·AI 종류·그룹·월별 배정·대상 출원·운영 현황으로 나누었습니다. AI 담당 업무에서는 목록의 출원번호에 해당하는 공개공보 PDF를 받습니다. [관리 UX 개편과 검증 결과](docs/ADMIN_UX_REDESIGN.md)를 참고하세요.
