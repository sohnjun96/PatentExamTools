# 심사데스크 MVP

KIPRIS Plus의 특허·실용신안 데이터를 출원번호 기준으로 모아, 심사관이 사건 상태와 원문을 빠르게 검토할 수 있도록 정리한 대시보드입니다.

## 현재 구현 범위

- 출원번호 검색과 샘플 사건(`10-2020-0093844`) 즉시 체험
- 서지 핵심정보, 초록, 주 CPC·전체 CPC와 전문 명세서 읽기 화면
- 전문 XML의 기술분야·배경기술·발명의 내용·실시예·부호 설명·전체 청구항 구성
- 서지상세정보에 포함된 행정처리 이력과 의견제출통지서 자동 표시
- 의견제출통지서 발견 시 PDF_V2 원문을 서버 프록시로 검증한 뒤 인라인 표시
- 대표도면 확대 보기
- 패밀리 관할청·문헌 목록과 빈 응답 시 `패밀리 없음` 상태
- Cloudflare Access 로그인과 사용자별 데이터 분리
- KIPRIS Plus·OpenAI API 키의 AES-GCM 암호화 저장
- D1 사건 캐시·AI 요약 캐시·KIPRIS API 누적 호출 수 표시
- OpenAI Responses API 기반 발명·청구범위·심사 포인트 구조화 요약
- 선택한 가공 데이터를 검토용 ZIP으로 다운로드
- KRDS 색상 토큰·공식 배너·건너뛰기 링크·페이지 내부 목차를 반영한 정부 서비스형 UI
- 모바일·태블릿 반응형 화면

샘플 사건 화면은 제공된 전문 XML과 저장된 API 응답 구조를 기반으로 만들었습니다. 원본 XML을 공개 폴더에 복사하지 않고 기술 본문·초록·청구항·도면 개수만 비식별 샘플 데이터로 추출합니다. 패밀리처럼 응답이 비어 있는 항목은 임의 값을 만들지 않고 `패밀리 없음`으로 표시합니다.

## API 흐름

`GET /api/patent?applicationNumber=출원번호`가 초기 대시보드에 필요한 API 4개만 병렬 호출합니다.

| 화면 데이터 | KIPRIS Plus 오퍼레이션 |
|---|---|
| 서지·초록·청구항 | `getBibliographyDetailInfoSearch` |
| CPC | `patentCpcInfo` |
| 대표도면 | `getReprsntFloorPlanInfoSearch` |
| 패밀리 | `patentFamilyInfo` |

행정처리는 서지상세 응답의 `legalStatusInfoArray`에서 구성하므로 별도의 통합이력·행정처리 API를 호출하지 않습니다. 문서명이 `의견제출통지서`인 행은 `receiptNumber`를 정규화해 PDF_V2의 `sendNumber`로 전달합니다.

- `GET /api/patent/fulltext?applicationNumber=...`: 사용자가 전문을 열 때만 전문파일정보에서 XML 경로를 받은 뒤 EUC-KR/UTF-8 원문을 해석해 전체 명세서와 청구항을 반환합니다.
- `GET /api/patent/pdf?applicationNumber=...&sendNumber=...`: 사용자가 통지서를 열 때만 PDF_V2의 파일경로를 서버에서 검증하고 `application/pdf`로 인라인 스트리밍합니다.
- `GET /api/patent/usage`: 로그인 사용자별 KIPRIS API 호출 총계와 오퍼레이션별 횟수를 D1에서 반환합니다. 파일 다운로드 경로인 `fileToss.jsp`는 할당량용 API 호출 수에서 제외합니다.
- `GET|POST /api/patent/summary?applicationNumber=...`: D1에 저장된 사건을 근거로 AI 요약을 조회하거나 생성합니다. 동일 원문 요약은 재사용하며 `force=true`일 때만 다시 생성합니다.
- `GET|PUT /api/settings`: 사용자별 KIPRIS Plus·OpenAI 키와 요약 모델을 관리합니다. API 키 원문은 조회 응답에 포함하지 않습니다.
- 두 파일 라우트는 `plus.kipris.or.kr`의 허용된 `fileToss.jsp` 경로만 요청하도록 제한합니다.

사건 조회 결과는 사용자·출원번호 기준으로 D1에 캐시합니다. 같은 사건을 다시 조회하면 KIPRIS Plus를 재호출하지 않고 저장 결과를 반환하므로 제한된 호출량을 절약합니다. API 호출 이력과 OpenAI 요약도 D1에 영구 저장됩니다.

```text
출원번호
  ├─ 서지상세(행정처리 포함) / CPC / 대표도면 / 패밀리
  ├─ 전문 열기 → 전문파일정보
  └─ 의견제출통지서 열기 → PDF_V2
```

## 로컬 실행

Node.js 22 LTS 또는 24.19 이상을 권장합니다.

1. `.env.example`을 프로젝트 루트의 `.env`로 복사합니다.
2. `ALLOW_DEV_AUTH=true`를 설정합니다.
3. 아래 명령으로 32바이트 암호화 키를 만들고 `APP_ENCRYPTION_KEY`에 넣습니다.
4. `npm run dev`로 실행한 뒤 화면의 `API 키 · 모델 설정`에서 개인 키를 등록합니다.

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

API 키를 설정하지 않아도 샘플 사건의 전체 전문 UI와 ZIP 내보내기를 확인할 수 있습니다. 실 PDF는 유효한 KIPRIS Plus accessKey가 있을 때 조회됩니다. 키는 서버 라우트에서만 사용하며 브라우저 번들에는 포함하지 않습니다.

## Cloudflare Git 배포

이 프로젝트는 서버 API 라우트에서 KIPRIS Plus 키를 사용하므로 정적 Pages 프로젝트가 아니라 **Cloudflare Workers**로 배포해야 합니다. Cloudflare 대시보드의 `Workers & Pages`에서 저장소를 가져온 뒤 다음과 같이 설정합니다.

| 항목 | 값 |
|---|---|
| 프로덕션 브랜치 | `main` |
| 루트 디렉터리 | `/` |
| 빌드 명령 | `npm run build` |
| 배포 명령 | `npm run deploy` |
| 비프로덕션 배포 명령 | `npm run deploy:preview` |

첫 배포에서는 `DB` D1 바인딩이 자동 프로비저닝됩니다. 이미 만든 D1을 사용하려면 빌드 환경변수 `CLOUDFLARE_D1_DATABASE_ID`에 데이터베이스 ID를 지정합니다. `migrations/0001_initial.sql`과 런타임 초기화가 동일한 스키마를 보장합니다.

런타임 `Variables and Secrets`에는 다음 값을 등록합니다.

- Secret: `APP_ENCRYPTION_KEY` (위 PowerShell 명령으로 생성, 운영 전용 값을 새로 사용)
- Variable: `CF_ACCESS_TEAM_DOMAIN` (예: `https://조직명.cloudflareaccess.com`)
- Variable: `CF_ACCESS_AUD` (Access 애플리케이션의 Application Audience 태그)
- Variable: `NEXT_PUBLIC_SITE_URL` (실제 HTTPS 주소)

공용 KIPRIS 키를 사용자 키의 대체값으로 유지하려는 경우에만 `KIPRIS_API_KEY`와 `KIPRIS_SERVICE_KEY`를 Worker Secret으로 추가합니다.

## Cloudflare Access 로그인 설정

1. Cloudflare Zero Trust의 `Access → Applications`에서 `Self-hosted` 애플리케이션을 추가합니다.
2. 배포된 Worker 도메인(예: `patentexamtools.pages.dev`)을 애플리케이션 도메인으로 등록합니다.
3. `Allow` 정책에 허용할 이메일 또는 조직 도메인을 지정하고, 로그인 방식으로 이메일 일회용 PIN이나 Google/Microsoft를 선택합니다.
4. 애플리케이션의 `Application Audience (AUD)` 값을 `CF_ACCESS_AUD`에, 팀 도메인을 `CF_ACCESS_TEAM_DOMAIN`에 저장한 뒤 다시 배포합니다.

Access가 적용되면 사이트 진입 시 Cloudflare 로그인 화면이 먼저 표시되고, 검증된 JWT의 사용자 식별자와 이메일로 D1 데이터가 분리됩니다. API 라우트도 JWT를 다시 검증하므로 UI를 우회한 호출은 허용되지 않습니다.

`.node-version`으로 Cloudflare 빌드 환경의 Node.js를 22로 고정합니다. 빌드 후 생성되는 `dist/server/wrangler.json`이 Worker 엔트리와 정적 에셋 경로를 정의하며, `dist` 자체는 저장소에 커밋하지 않습니다.

## 공개 배포 전 확인

- `APP_ENCRYPTION_KEY`를 Cloudflare Worker Secret으로 저장하고 별도 백업
- Cloudflare Access 허용 정책과 세션 만료시간 검토
- `NEXT_PUBLIC_SITE_URL`을 실제 HTTPS 주소로 설정해 소셜 미리보기 절대경로 확정
- 외부 공개 전 Cloudflare Rate Limiting 적용
- 원문 XML/PDF에 포함될 수 있는 개인정보의 열람·보관·다운로드 정책 확정
- ZIP에 원문 바이너리를 포함할지, 단기 다운로드 링크만 제공할지 정책 확정

OpenAI 요청에는 `store: false`를 사용하며, AI 요약은 심사 결론이 아니라 원문 확인을 돕는 보조자료로 표시합니다.
