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
- 현재 서버 실행 이후의 KIPRIS Plus API 누적 호출 수 표시
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
- `GET /api/patent/usage`: 현재 서버 실행 이후의 API 호출 총계와 오퍼레이션별 횟수를 반환합니다. 파일 다운로드 경로인 `fileToss.jsp`는 할당량용 API 호출 수에서 제외합니다.
- 두 파일 라우트는 `plus.kipris.or.kr`의 허용된 `fileToss.jsp` 경로만 요청하도록 제한합니다.

현재 사용량 집계는 MVP의 실행 메모리에 저장되므로 개발 서버 재시작 또는 Cloudflare 런타임 교체 시 초기화됩니다. 배포 후 장기·전역 사용량이 필요하면 D1 또는 별도 분석 저장소에 기록하도록 확장해야 합니다.

```text
출원번호
  ├─ 서지상세(행정처리 포함) / CPC / 대표도면 / 패밀리
  ├─ 전문 열기 → 전문파일정보
  └─ 의견제출통지서 열기 → PDF_V2
```

## 로컬 실행

Node.js 22 LTS 또는 24.19 이상을 권장합니다.

1. `.env.example`을 프로젝트 루트의 `.env`로 복사합니다.
2. `KIPRIS_API_KEY`에 KIPRIS Plus accessKey를 설정합니다.
3. 공공데이터포털 연계형 ServiceKey가 별도라면 `KIPRIS_SERVICE_KEY`도 설정합니다.
4. `npm run dev`로 실행합니다.

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

런타임 `Variables and Secrets`에는 다음 값을 등록합니다.

- Secret: `KIPRIS_API_KEY`
- Secret: `KIPRIS_SERVICE_KEY` (별도 키가 있을 때만)
- Variable: `NEXT_PUBLIC_SITE_URL` (실제 HTTPS 주소)

`.node-version`으로 Cloudflare 빌드 환경의 Node.js를 22로 고정합니다. 빌드 후 생성되는 `dist/server/wrangler.json`이 Worker 엔트리와 정적 에셋 경로를 정의하며, `dist` 자체는 저장소에 커밋하지 않습니다.

## 공개 배포 전 확인

- `KIPRIS_API_KEY`와 필요 시 `KIPRIS_SERVICE_KEY`를 Cloudflare의 암호화된 환경변수로 저장
- `NEXT_PUBLIC_SITE_URL`을 실제 HTTPS 주소로 설정해 소셜 미리보기 절대경로 확정
- 외부 공개 전 조직 인증, 사용자별 권한, Cloudflare Rate Limiting 적용
- 원문 XML/PDF에 포함될 수 있는 개인정보의 열람·보관·다운로드 정책 확정
- ZIP에 원문 바이너리를 포함할지, 단기 다운로드 링크만 제공할지 정책 확정

현재 MVP는 API 라우트 입력 검증과 기본 요청 제한을 포함하지만, 공개 서비스용 인증·감사로그·영구저장은 아직 포함하지 않습니다.
