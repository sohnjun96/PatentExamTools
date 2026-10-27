# 전문 PDF 화면 UI·UX 점검

> 이 문서는 수정 전 점검 기록이다. 제안 적용을 완료했으며 최신 상태는 [UX 라이팅 적용 결과](UX_WRITING_APPLIED.md)를 참고한다.

검토일: 2026-10-27. 대상은 `/documents`, 개별 PDF 버튼, 저장 대화상자, 이 화면에 전달되는 전문 PDF API 오류다. [Toss ux-writing 지침](https://github.com/toss/apps-in-toss-harness/blob/main/packages/agent-plugin/shared/skills/ux-writing/SKILL.md)의 문구 기준을 적용했다. 생산 코드와 문구는 수정하지 않았다. 아래 전후 문구는 적용 전 확인을 위한 제안이다.

점검 방법은 소스 전수 확인과 현재 코드의 번호 중복·일괄 검증 식을 그대로 실행한 읽기 전용 재현이다. 브라우저의 실제 저장창·모바일 화면·보조기기 동작은 이 하위 점검에서 실행하지 않았다. 기능 문제와 문자열 문제를 구분하며, 기능 변경이 필요한 항목은 문구만 바꿔 해결했다고 보지 않는다.

## 우선 수정 제안

| 우선순위·항목 | 현재 동작·문구와 근거 | 사용자에게 생기는 문제 | 수정 전 → 수정 후 제안 | 필요한 변경 |
|---|---|---|---|---|
| P1 · D1 동일 번호의 표기 차이를 중복으로 인식하지 않음 | `app/documents/page.tsx:29`는 원문 문자열의 `Set`으로만 중복을 제거한다. `:51`의 ZIP 파일명은 공백을 삭제한다. 안내는 `:70`의 “중복 번호는 한 번만 요청합니다.”다. | `10-2020-0093844`, `1020200093844`, `10 2020 0093844`는 같은 출원인데 세 번 요청한다. 뒤의 두 파일명은 같아 ZIP에서 덮어쓰며, 성공 3건과 실제 파일 2개가 달라진다. | “중복 번호는 한 번만 요청합니다.” → **번호 정규화 후** “같은 문헌은 표기가 달라도 한 번만 받습니다.” 완료 안내는 “{전체}건 중 {성공}건 저장 · {실패}건 제외” | 조회 키를 번호 종류·정규화 번호로 만들고 원문 표기는 따로 보존한다. ZIP 파일명 충돌을 막고 실제 추가한 파일 수로 완료 건수를 센다. 문구 선변경 금지. |
| P1 · D2 혼합 문헌 중 해외 번호 하나가 국내 PDF 수집도 막음 | `app/evaluation/workspace.tsx:157`은 KR·US·EP 혼합 예시를 안내하고 같은 결과 전체를 `/documents?numbers=...`로 보낸다. `app/documents/page.tsx:36`은 한 번호라도 국내 정규식과 다르면 전체 다운로드를 반환 종료한다. | AI 담당자가 기존 결과의 “검색 문헌 PDF 모으기”를 누른 뒤 국내 문헌을 받으려 해도 해외 번호를 직접 찾아 지워야 한다. 어느 행이 문제인지 표시하지 않는다. | “국내 특허·실용신안 번호만 입력해 주세요. 번호 종류를 구분해 한 줄에 하나씩 입력합니다.” → **행 구분 후** “국내 문헌 {n}건을 받을 수 있습니다. 해외 문헌 {m}건은 원문 검색에서 확인해 주세요.” 버튼 “국내 문헌 {n}건 ZIP으로 받기” | 국내·해외·형식 오류를 행별로 나누고 국내 다운로드는 계속 허용한다. 해외 행에 기존 문헌 검색 경로를 제공한다. 한 번에 한 번호 종류만 처리한다면 선택·분리 방법을 설명한다. |
| P2 · D3 중단 버튼이 압축·저장 단계의 실제 동작과 다름 | `app/documents/page.tsx:61`에서 마지막 중단 검사를 한 뒤 `:65`에서 압축·쓰기를 진행한다. `:70`은 `busy` 동안 계속 “중단” 버튼을 표시한다. | 문헌 조회가 끝난 뒤 ZIP 생성 또는 저장 중 “중단”을 눌러도 이후 저장을 막는 검사가 없다. 버튼이 약속한 행동과 실제 결과가 다르다. | 일괄 “PDF를 모으는 중…” / “중단” → “PDF {완료}/{전체}건을 모으는 중…” / “수집 중단”; 압축 단계 “ZIP 파일을 만드는 중…”; 저장 단계 “ZIP 파일을 저장하는 중…” | 진행 단계를 구분한다. 중단 가능한 단계에만 중단을 제공하거나 압축 후 쓰기 전에도 취소를 확인한다. 쓰기 취소를 구현하지 않는다면 저장 단계에서는 중단을 제거·비활성화하고 이유를 안내한다. |
| P2 · D4 오류 메시지에 사용자 복구 방법이 부족하고 내부 설정을 노출함 | `app/components/pdf-download.tsx:21,25,43`은 서버 또는 네이티브 오류를 그대로 표시한다. 예: “정상적인 PDF 파일이 반환되지 않았습니다.”, `app/lib/patent-document.ts:77`의 “허용되지 않은 KIPRIS Plus 전문 PDF 경로입니다.”, `app/lib/secrets.ts:9`의 “Cloudflare Worker Secret에 KIPRIS_API_KEY를 설정해 주세요.” | AI 담당자는 HTTP 코드·파일 경로·서버 설정을 해결할 수 없다. 타임아웃·저장 실패도 `Error.message`에 따라 영어 문구가 노출될 수 있다. | 형식 오류 → “PDF 원문을 확인할 수 없습니다. 다시 시도해 주세요. 계속되면 관리자에게 문헌번호를 알려 주세요.” 키 미설정 → “원문 조회 연결이 준비되지 않았습니다. 관리자에게 연결 설정을 요청해 주세요.” 타임아웃 → “PDF를 불러오는 데 시간이 오래 걸립니다. 잠시 후 다시 시도해 주세요.” | 오류 종류별 한국어 매핑과 재시도 동작을 제공한다. 확인되지 않은 원인을 단정하지 않는다. 일반 화면에는 작업·다음 행동을, 관리자 진단에는 설정 상세를 분리한다. |
| P2 · D5 같은 이름의 개별 PDF 버튼을 문헌별로 구별하기 어려움 | `app/documents/page.tsx:70`은 모든 행에 “개별 PDF ↓”를 쓰고 `app/components/pdf-download.tsx:46`은 문헌번호가 포함된 접근성 이름을 제공하지 않는다. 버튼 최소 높이는 `pdf-download.css:2`의 36px다. | 버튼만 순서대로 탐색하는 사용자는 어느 문헌의 어떤 PDF인지 알기 어렵다. 반복 행에서 문헌번호와 동작을 연결해야 한다. | “개별 PDF ↓” → 시각 문구 “PDF 받기”; 접근성 이름 “{문헌번호} {공개/등록}공보 PDF 받기” | `aria-label` 또는 연결된 텍스트로 이름을 제공한다. 작은 화면의 실제 조작 영역을 확인하고 최소 44px 정도로 넓히는 방안을 검토한다. 화면 문구는 짧게 유지한다. |
| P3 · D6 영문 장식·내부 값과 전문 용어가 섞임 | `app/documents/page.tsx:70`의 “DOCUMENT WORKSPACE”, `:64`의 결과 파일 `번호 종류: application / 공보 종류: publication`, API의 “등록공고전문”과 화면의 “등록공보 PDF”가 혼재한다. | 사용자가 읽는 정보에 내부 enum과 영문 장식이 추가된다. 같은 자료를 가리키는 용어를 다시 해석해야 한다. | “DOCUMENT WORKSPACE” → “전문 PDF 다운로드”; `application / publication / registration` → `출원번호 / 공개번호 / 등록번호` 또는 `공개공보 / 등록공보`; 화면의 “등록공보 PDF”로 통일 | 화면 장식과 다운로드 결과 파일에 한국어 표시용 매핑을 쓴다. API 계약·내부 키는 유지한다. “검색에 필요한 전문, 한곳에서 내려받으세요.”를 “전문 PDF 다운로드”로 간결화한다면 같은 제목을 위아래 반복하지 않는다. |

## 기준별 판정

| 점검 축 | 판정 | 근거 |
|---|---|---|
| 사용자 작업 중심 | 대체로 통과 | 번호 입력→개별/ZIP 받기 흐름은 직접적이다. D4 내부 진단은 사용자 작업 중심으로 조정할 필요가 있다. |
| 손실·불안 자극 | 통과 | 재촉·불이익·거짓 희소성 문구를 찾지 못했다. |
| 확인 가능한 사실 | 조정 필요 | D1의 중복 처리 약속, D3의 중단 가능성은 현재 동작과 맞지 않는다. |
| 조건을 나눠 제시 | 조정 필요 | 국내 한정·번호 종류·제공 조건·해외 대안이 하단 한 문단에 몰려 있다. 입력 전 국내 한정을 먼저 보이고 제공 조건과 해외 대안을 나누는 편이 낫다. |
| 반복 최소화 | 조정 필요 | 제목·소개·하단·푸터가 국내 문헌/번호 종류/제공처를 여러 번 설명한다. 입력에 필요한 조건을 필드 곁에 모으고 푸터는 출처만 남길 수 있다. |
| 오류 원인·다음 행동 | 조정 필요 | D4. 확인 가능한 사실은 보존하되 사용자 역할에 맞는 다음 행동을 제시해야 한다. |
| 버튼의 결과 명확성 | 일부 조정 | “전문 PDF ZIP 다운로드”는 명확하다. “중단”, 반복 “개별 PDF”는 D3·D5 개선 대상이다. |
| 어투·단위 | 대체로 통과 | `합니다/해 주세요`의 업무용 존댓말을 유지한다. `1~50건`, `0 / 1` 같은 표기에는 의미(수집 완료/대상)를 붙이면 낫다. |
| 한국어 일관성 | 조정 필요 | D6. PDF·ZIP·KIPRIS Plus는 형식·제품 고유명으로 유지 가능하다. 내부 enum·장식 영어는 번역한다. |

## 전수 문구 목록

소스 줄은 `app/documents/page.tsx`의 렌더 JSX가 70번 한 줄에 모여 있어 같은 줄 번호가 반복된다. 위치 열의 요소 설명으로 구분한다. 동적 번호·건수·오류·파일명은 `{}`로 표기했다. `↓`, `↗`, `01`, `02` 등 장식 기호·순서는 별도 개선 대상이 아니며 해당 라벨에 포함했다.

| 화면·상태 | 위치 | 현재 문구 |
|---|---|---|
| PDF 화면/브랜드 | `app/documents/page.tsx:70` header | 심 / 선행기술 AI 검색 포털 / AI 검색 결과 평가 |
| PDF 화면/메뉴 | `app/documents/page.tsx:70` nav | 평가 업무로 돌아가기 ↗ / 기존 사건 조회 ↗ |
| PDF 화면/상단 | `app/documents/page.tsx:70` eyebrow | DOCUMENT WORKSPACE |
| PDF 화면/제목 | `app/documents/page.tsx:70` h1 | 검색에 필요한 전문, / 한곳에서 내려받으세요. |
| PDF 화면/소개 | `app/documents/page.tsx:70` intro | 대상 출원과 AI가 찾은 국내 문헌의 공개·등록공보 PDF를 모읍니다. |
| PDF 화면/입력 패널 | `app/documents/page.tsx:70` h2 | 01 / 문헌 번호 입력 |
| PDF 화면/입력 안내 | `app/documents/page.tsx:70` panel p | 번호 종류를 먼저 선택한 다음, 한 줄에 하나씩 붙여 넣으세요. |
| PDF 화면/종류 선택 | `app/documents/page.tsx:70` select | 입력 번호 종류 / 번호 종류를 선택하세요 / 출원번호 / 공개번호 / 등록번호 |
| PDF 화면/공보 선택 | `app/documents/page.tsx:70` select | 받을 전문 / 공개공보 PDF / 등록공보 PDF |
| PDF 화면/입력 접근성 | `app/documents/page.tsx:70` textarea aria-label | 내려받을 문헌 번호 |
| PDF 화면/출원번호 예시 | `app/documents/page.tsx:70` placeholder | 예: 10-2020-0093844 / 출원번호를 한 줄에 하나씩 입력 |
| PDF 화면/공개번호 예시 | `app/documents/page.tsx:70` placeholder | 예: KR10-2022-0014141A / 공개번호를 한 줄에 하나씩 입력 |
| PDF 화면/등록번호 예시 | `app/documents/page.tsx:70` placeholder | 등록번호를 한 줄에 하나씩 입력 |
| PDF 화면/건수 | `app/documents/page.tsx:70` input foot | {n}건 · 최대 50건 / 중복 번호는 한 번만 요청합니다. |
| PDF 화면/기본 CTA | `app/documents/page.tsx:70` button | 전문 PDF ZIP 다운로드 ↓ |
| PDF 화면/로딩 CTA | `app/documents/page.tsx:70` button | PDF를 모으는 중… |
| PDF 화면/중단 CTA | `app/documents/page.tsx:70` button | 중단 |
| PDF 화면/제공 조건 | `app/documents/page.tsx:70` note | 공개·등록번호는 해당 번호의 공보를 받습니다. 공개되지 않았거나 PDF가 제공되지 않는 문헌은 실패 이유를 표시합니다. 해외 문헌은 해당 관청 서비스를 이용해 주세요. |
| PDF 화면/목록 제목 | `app/documents/page.tsx:70` result title | 02 / 다운로드 목록 / {수집 완료} / {입력 건수} |
| PDF 화면/빈 목록 | `app/documents/page.tsx:70` empty | 문헌 번호를 입력하면 / 다운로드 목록이 표시됩니다. |
| PDF 화면/빈 목록 안내 | `app/documents/page.tsx:70` empty p | 출원 1건은 개별 PDF로, / 여러 문헌은 ZIP으로 받을 수 있습니다. |
| PDF 화면/목록 행 | `app/documents/page.tsx:70` job | {순번} / {원문 번호} / 수집 완료 / 조회 중 / 조회 실패 / 중단됨 / 대기 |
| PDF 화면/행 CTA | `app/documents/page.tsx:70` PdfDownloadButton label | 개별 PDF ↓ |
| PDF 화면/푸터 | `app/documents/page.tsx:70` footer | PDF는 KIPRIS Plus가 제공하는 원문 파일입니다. 번호 종류를 정확히 선택하면 다른 문헌의 다운로드를 예방할 수 있습니다. |
| 검색 결과 전달 | `app/documents/page.tsx:25` message | 검색 문헌을 가져왔습니다. 입력 번호 종류를 선택해 주세요. 공개번호와 출원번호는 서로 다릅니다. |
| ZIP/유형 미선택 | `app/documents/page.tsx:34` message | 입력 번호 종류를 먼저 선택해 주세요. |
| ZIP/건수 오류 | `app/documents/page.tsx:35` message | 번호를 1~50건 입력해 주세요. |
| ZIP/형식 오류 | `app/documents/page.tsx:36` message | 국내 특허·실용신안 번호만 입력해 주세요. 번호 종류를 구분해 한 줄에 하나씩 입력합니다. |
| ZIP/기본 파일명 | `app/documents/page.tsx:39` picker | 선행기술 AI 검색 포털_전문PDF.zip |
| ZIP/행 중단 | `app/documents/page.tsx:55` error | 사용자 중단 |
| ZIP/행 오류 | `app/documents/page.tsx:56` error | {Error.message} / PDF 조회 실패 |
| ZIP/파일 결과 표시 | `app/documents/page.tsx:50,57` outcomes | 성공 / 실패 |
| ZIP/중단 결과 | `app/documents/page.tsx:61` message | 다운로드를 중단했습니다. ZIP 파일은 저장하지 않았습니다. |
| ZIP/전부 실패 | `app/documents/page.tsx:63` message | 받을 수 있는 PDF가 없어 ZIP 파일을 저장하지 않았습니다. 각 번호의 실패 이유를 확인해 주세요. |
| ZIP/결과 파일 | `app/documents/page.tsx:64` archive file | 다운로드 결과.txt / 번호 종류: {application/publication/registration} / 공보 종류: {publication/registration} / {번호} {성공/실패} {오류} |
| ZIP/완료 | `app/documents/page.tsx:66` message | {성공}/{전체}건 PDF 포함 · {저장 결과} |
| ZIP/일반 실패 | `app/documents/page.tsx:67` message | {Error.message} / 다운로드에 실패했습니다. |
| 개별 PDF/조회 실패 | `app/components/pdf-download.tsx:21` | {서버 error} / PDF 조회에 실패했습니다 ({HTTP 상태}). |
| 개별 PDF/형식 검증 실패 | `app/components/pdf-download.tsx:25` | 정상적인 PDF 파일이 반환되지 않았습니다. |
| 개별 PDF/기본 CTA | `app/components/pdf-download.tsx:29` | 전문 PDF ↓ |
| 개별 PDF/저장 제안명 | `app/components/pdf-download.tsx:38` | {문헌번호}_공개전문.pdf / {문헌번호}_등록전문.pdf |
| 개별 PDF/기본 실패 | `app/components/pdf-download.tsx:43` | {Error.message} / PDF를 내려받지 못했습니다. |
| 개별 PDF/로딩 | `app/components/pdf-download.tsx:46` | PDF 불러오는 중… |
| 저장창/파일 종류 | `app/lib/save-file.ts:24` | {확장자 대문자} 파일 |
| 미지원 브라우저/저장 입력 | `app/lib/save-file.ts:32` | 저장할 파일명을 입력하세요. 저장 위치는 브라우저 다운로드 설정을 따릅니다. |
| 저장창/완료 | `app/lib/save-file.ts:50` | 선택한 폴더에 {파일명} 저장 완료 (브라우저는 전체 경로를 공개하지 않습니다) |
| 브라우저 다운로드/요청 완료 | `app/lib/save-file.ts:60` | {파일명} 다운로드 요청 완료 · 실제 저장 위치와 덮어쓰기는 브라우저 다운로드 설정을 확인해 주세요 |
| PDF API/공보 종류 오류 | `app/lib/patent-document.ts:45` | 공개전문 또는 등록공고 전문을 선택해 주세요. |
| PDF API/번호 종류 오류 | `app/lib/patent-document.ts:50` | 문헌번호가 출원번호인지 공개번호인지 등록번호인지 선택해 주세요. |
| PDF API/해외·형식 오류 | `app/lib/patent-document.ts:55` | 한국 특허·실용신안 번호를 입력해 주세요. 해외 문헌은 원문 제공처에서 확인해 주세요. |
| PDF API/등록번호 오류 | `app/lib/patent-document.ts:61` | 등록번호 형식을 확인해 주세요. 예: 10-2345678 |
| PDF API/출원·공개번호 오류 | `app/lib/patent-document.ts:64` | 특허·실용신안 출원번호 또는 공개번호 13자리를 확인해 주세요. |
| PDF API/파일 주소 없음 | `app/lib/patent-document.ts:72` | KIPRIS Plus 전문 PDF 경로를 확인할 수 없습니다. |
| PDF API/파일 주소 차단 | `app/lib/patent-document.ts:77` | 허용되지 않은 KIPRIS Plus 전문 PDF 경로입니다. |
| PDF API/크기 제한 | `app/lib/patent-document.ts:84,97` | 전문 파일이 허용 크기를 초과했습니다. |
| PDF API/빈 응답 | `app/lib/patent-document.ts:86` | 전문 파일 응답이 비어 있습니다. |
| PDF API/PDF 검증 실패 | `app/lib/patent-document.ts:110` | KIPRIS Plus에서 PDF 원문 대신 오류 또는 다른 형식의 파일을 반환했습니다. |
| PDF API/메타데이터 HTTP 오류 | `app/lib/patent-document.ts:133` | KIPRIS Plus {작업} 조회에 실패했습니다. ({HTTP 상태}) |
| PDF API/메타데이터 결과 오류 | `app/lib/patent-document.ts:139` | KIPRIS Plus {작업} 조회 오류입니다. API 이용 권한과 제공 여부를 확인해 주세요. |
| PDF API/동적 작업명 | `app/lib/patent-document.ts:151,168` | 공개번호 검색 / 등록번호 검색 / 공개전문 PDF / 등록공고전문 PDF |
| PDF API/번호 매칭 없음 | `app/lib/patent-document.ts:158` | 문헌번호와 정확히 일치하는 출원을 확인하지 못했습니다. 출원번호를 확인한 뒤 다시 시도해 주세요. |
| PDF API/응답 불일치 | `app/lib/patent-document.ts:172` | 전문 PDF의 출원번호가 요청과 일치하지 않습니다. |
| PDF API/원문 미제공 | `app/lib/patent-document.ts:176` | {공개/등록공고} 전문 PDF가 제공되지 않습니다. 공개·등록 여부 또는 API 이용 권한을 확인해 주세요. |
| PDF API/다운로드 HTTP 오류 | `app/lib/patent-document.ts:191` | 전문 PDF 다운로드에 실패했습니다. ({HTTP 상태}) |
| PDF API/일반 실패 | `app/api/patent/document/route.ts:37` | 전문 PDF를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요. |
| PDF API/연결 설정 없음 | `app/lib/secrets.ts:9` → route의 HttpError 표시 | Cloudflare Worker Secret에 KIPRIS_API_KEY를 설정해 주세요. |

## UI 추가 확인 사항

- `documents.css:5`는 800px 이하에서 패널을 한 열로 전환한다. 같은 줄의 번호 종류·받을 전문 선택은 두 열을 유지하므로 작은 화면에서 가장 긴 한국어 옵션이 잘리지 않는지 실제 화면 확인이 필요하다. 코드를 근거로 잘림 발생을 단정하지 않았다.
- `documents.css:4`의 보조 설명은 11~12px, `pdf-download.css:5`의 결과 메시지도 11px다. 실패 후 다음 행동을 읽는 핵심 설명은 보조 정보보다 큰 글자로 제시하는 편이 낫다.
- 번호 종류 선택은 실제 `<label><select>` 구조이고 입력창에는 `aria-label`이 있다. 키보드/읽기 이름의 기본 연결은 있다. 반면 행별 진행 상태는 단순 `<small>`이며 수집 중 갱신을 알리는 live region은 없다. 중앙 `role="status"`는 완료/중단 메시지에만 갱신된다.
- 저장 성공과 오류가 같은 `.docs-feedback` 색, 개별 성공과 오류도 같은 `.pd-message` 색을 쓴다. 문구로 구분할 수 있으나 시각적 우선순위 구분은 약하다. 색만으로 상태를 나누는 방식은 피하고 제목·아이콘·텍스트를 함께 쓰는 방안을 검토한다.

## 통과한 동작과 유지할 점

- PDF 형식을 확인한 뒤 저장하고, 국내 문헌에 대해 출원·공개·등록번호 종류를 명시적으로 전달한다.
- AI 결과에서 가져온 번호에 유형 정보가 없으면 번호 종류를 다시 선택하게 한다. 종류를 추측해 다른 문헌을 받지 않는 방향은 유지한다.
- 개별 다운로드는 로딩 중 중복 클릭을 막는다. ZIP의 성공 파일과 실패 사유도 분리해 보관하려는 구조다.
- 미지원 브라우저에서 전체 저장 경로를 알 수 없는 점과 실제 다운로드 완료 여부를 구별하려는 문구는 사실에 맞다. 이 사실을 숨기거나 “저장 완료”로 통일하면 안 된다.
- 파일 저장 대화상자에서 취소하면 해당 요청은 진행하지 않는다. 빈 목록에서는 ZIP 버튼을 비활성화한다.

## 확인용 재현 기록

현재와 동일한 문자열 `Set` 및 파일명 식을 세 표기 예시에 적용했다. 애플리케이션이나 데이터베이스는 호출하지 않았다.

```text
입력: 10-2020-0093844 / 1020200093844 / 10 2020 0093844
입력 목록 수: 3
정규화한 출원 수: 1
고유 ZIP 파일명 수: 2
파일명: 10-2020-0093844_publication.pdf / 1020200093844_publication.pdf / 1020200093844_publication.pdf

입력: KR1020220014141A / US20230000001A1
국내번호 정규식으로 전체 일괄 요청 거절: true
```
