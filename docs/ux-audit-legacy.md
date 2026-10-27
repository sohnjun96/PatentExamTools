# 기존 사건 조회·전문 읽기 UI/UX 점검

> 이 문서는 수정 전 점검 기록이다. 제안 적용을 완료했으며 최신 상태는 [UX 라이팅 적용 결과](UX_WRITING_APPLIED.md)를 참고한다.

점검일: 2026-10-27 (한국 시간)

범위: `app/patent/page.tsx`, `app/fulltext/fulltext-viewer.tsx`, `app/globals.css`. `app/fulltext/page.tsx`, 사건 API의 조회 항목, 평가 화면의 충돌 처리도 연결 동작 확인에 한해 읽었다.

기준: 사용자가 기다리는 대상과 결과를 명확히 설명하기, 사실에 맞는 문구, 오류 후 다음 행동 제공, 일관된 언어와 말투, 구현 용어를 업무 용어로 바꾸기. [요청받은 ux-writing 스킬](https://github.com/toss/apps-in-toss-harness/blob/main/packages/agent-plugin/shared/skills/ux-writing/SKILL.md)을 참고했다.

앱 소스는 변경하지 않았다. 아래 내용은 수정 전후 제안이며, 적용 전 확인이 필요하다. 이 보고서는 코드 점검 결과이며 브라우저 재현 여부는 별도로 명시한다.

## 우선 점검 결과와 수정 제안

| 우선순위 | 위치·발생 조건 | 현재 문구·동작 | 제안 문구·동작 | 사용자 영향·근거 |
|---|---|---|---|---|
| 높음 | `app/fulltext/fulltext-viewer.tsx:73`, 부적합한 출원번호로 읽기 화면을 연 경우 | 오류 안내 없이 `1020200093844`로 바꾸고 ‘샘플 사건’ 표시 | 제목 ‘출원번호를 확인해 주세요.’ / 설명 ‘입력한 번호로 전문을 열 수 없습니다. 특허·실용신안 출원번호 13자리를 확인한 뒤 다시 조회해 주세요.’ / 버튼 ‘출원번호 다시 조회’. 입력 번호를 샘플로 바꾸지 않는다. | 사용자가 요청한 사건 대신 다른 사건의 명세서를 읽을 수 있다. `/fulltext?applicationNumber=123`은 형식 검사를 통과하지 못한 뒤 샘플 번호로 대체되는 코드 경로다. 단순 문구 수정과 함께 입력 분기 수정이 필요하다. 브라우저 재현 전 코드에서 확인했다. |
| 중간 | `app/fulltext/fulltext-viewer.tsx:188`, XML 읽기 화면을 PDF로 저장할 때 | ‘인쇄·PDF 저장’ (`window.print()`) | 버튼 ‘읽기 화면 인쇄·PDF 저장’. 인접 설명 ‘명세서와 청구항을 정리한 읽기 화면을 저장합니다. 공보 원문 PDF는 전문 PDF 모으기에서 내려받으세요.’ 원문 PDF 메뉴 링크 제공. | 사용자가 필요한 공보 원문과 재구성한 읽기 화면 PDF를 구분할 수 없다. 제목과 저장 결과가 일치해야 한다. 이 버튼은 실제 KIPRIS 공보 PDF 다운로드가 아니다. |
| 중간 | `app/patent/page.tsx:365`, `:416`, `:426`, 사건 조회 실패 | ‘사건 조회에 실패했습니다.’ 또는 전달된 오류를 토스트에 표시하고 3.2초 뒤 제거 | 공통 제목 ‘사건 정보를 불러오지 못했습니다.’ / 설명은 확인된 오류 원인을 유지하고, 알려진 원인이 없으면 ‘잠시 후 다시 조회해 주세요.’ / ‘다시 조회’ 버튼. 입력 필드 옆에 사용자가 해결할 때까지 안내 유지. | 원인 확인·재시도 전에 메시지가 사라지며 이전 사건 정보가 화면에 남는다. 긴 서버 오류는 읽기 어렵다. 입력 오류는 입력 필드 근처, 서비스 오류는 현재 사건 조회 영역에 표시하는 것이 맞다. ‘네트워크 오류’ 등 확인하지 않은 원인은 지어내지 않는다. |
| 중간 | `app/patent/page.tsx:424`, `:645`, `:647`, `:825`, `:843`, `:914`, 기존 사건 조회의 일반 안내 | ‘D1에 저장된 사건 데이터를 불러왔습니다.’ / ‘D1 누적’ / ‘Worker Secret 연동’ / ‘의견제출통지서는 PDF_V2 자동조회 대상입니다.’ / 빈 패밀리에서 API 응답 설명 / ‘실제 원문 바이너리는 API 키 연결 및 접근정책 확정 후 포함합니다.’ | 각각 ‘저장된 사건 정보를 불러왔습니다.’ / ‘누적 호출’ / 일반 업무 화면에서는 불필요한 개발 상태 문구 제외 / ‘의견제출통지서를 선택하면 PDF를 볼 수 있습니다.’ / ‘조회된 패밀리 문헌이 없습니다. 출원번호를 확인하거나 다른 문헌을 조회해 주세요.’ / ‘이 ZIP에는 요약·청구항·이력과 원문 파일 목록이 들어갑니다. 공보 원문 PDF는 전문 PDF 모으기에서 따로 내려받으세요.’ | 구현 방식이 사용자의 다음 행동보다 앞선다. 특히 이미 전문 PDF 다운로드가 작동하는 개편 화면에서 ‘정책 확정 후 포함’은 현재 기능과 향후 계획을 혼동시킨다. 데이터와 원문 PDF의 저장 경로를 명확하게 구분한다. |
| 중간 | `app/patent/page.tsx:872`, `:885`, `:902`, `:908`, 통지서·CPC·도면·묶음 대화상자 | `aria-modal="true"`와 ‘닫기’는 있으나 포커스 이동·가두기·복귀가 없다. Escape로 닫는 공통 처리만 있음. | 문구: 닫기 접근성 이름을 ‘의견제출통지서 닫기’, ‘전체 CPC 닫기’ 등으로 구체화. 구조: 열 때 대화상자로 포커스를 보내고 Tab 이동을 내부로 제한하며 닫을 때 열기 버튼으로 복귀. | 키보드 사용자가 배경 버튼으로 이동할 수 있다. `aria-modal`만으로 포커스를 제어할 수 없으며 CSS에도 이를 보완하는 동작은 없다. 실제 Tab 순서는 브라우저 추가 확인 대상이다. UX 라이팅을 넘어서는 상호작용 제안으로 분리해 승인받아야 한다. |

## 함께 확인한 정보 정확성 문제

- 사건 조회 로딩(`app/patent/page.tsx:867`)은 ‘서지·전문·도면·패밀리·이력을 함께 가져오고 있습니다.’라고 안내한다. 실제 초기 API는 서지·CPC·대표도면·패밀리 4종이며 전문은 별도 요청이다. ‘출원 정보와 대표도면, 패밀리를 불러오고 있습니다.’처럼 실제 기다리는 대상으로 고치고, 전문을 보려면 명세서 메뉴를 사용하도록 안내할 수 있다.
- 전문 검색 결과(`app/fulltext/fulltext-viewer.tsx:196`)의 ‘N개 문단에서 일치’는 초록·명세서 문단과 청구항을 합해 세는데 ‘독립항’ 필터와는 독립적인 전체 결과다. 전체 검색임을 유지하되 ‘명세서·청구항 전체에서 N개 항목 일치’가 더 정확하다. 현재 필터로 숨긴 청구항도 집계하는 점은 실제 탐색 개선 시 함께 검토한다.
- `DEMO`/`LIVE`, `REVIEW SNAPSHOT`, `AI EXAMINATION BRIEF`, `BIBLIOGRAPHY`, `DATA SOURCES`, `ABSTRACT`, `DESCRIPTION`, `CLAIMS`처럼 한국어 제목과 뜻을 반복하는 영어 장식 라벨이 있다. 한국어 업무 명칭만 유지하거나 보조 라벨을 한 언어로 통일하는 것이 간결하다. `CPC`, `PDF`, `XML`, `JSON`, `ZIP`, `KIPRIS Plus`, 실제 발명의 영문명은 식별자·파일형식·원문 데이터로 보아 임의 번역하지 않는다.

## 통과한 부분

- 조회 필드가 ‘출원번호’로 명확하고 입력 예시가 표시된다.
- ‘공개 전문 PDF’와 ‘등록 전문 PDF’는 개별 결과를 구분한다.
- 출원·문헌·청구항 등 법적·업무 도메인 표현은 일관되게 사용한다.
- 통지서와 도면의 닫기 버튼은 텍스트 ‘×’와 함께 접근성 이름을 가진다.
- 읽기 화면 본문은 문단 번호·목차·검색 강조·청구항 필터로 탐색할 수 있다.
- 일반 화면은 `습니다`/`주세요` 중심이며, 감정 단정·불안 유발·부당한 마감 압박 문구는 발견하지 못했다.
- 기본 포커스 테두리와 본문 바로가기 링크가 있다. 읽기 화면의 본문 크기는 15~16px이며 작은 화면에서도 조정된다.

## 평가 충돌 안내에 대한 연결 점검

`app/evaluation/workspace.tsx:74`는 충돌 후 ‘입력 내용은 유지됩니다. 최신 자료를 확인한 뒤 다시 저장해 주세요.’라고 말한다. 그러나 새로고침은 `loadSerial`을 올려 편집기를 다시 만들고, 이동 확인에는 ‘이동하시겠습니까?’만 표시한다. 자동 복원 기능이 없는 현재 동작에서는 ‘입력 내용을 복사해 둔 뒤 새로고침해 주세요.’처럼 보관 절차와 새로고침의 결과를 명시해야 한다. 장기적으로는 초안 보존·복사·변경 비교 후 재시도 동작을 제공하면 문구로만 해결하려는 부담을 줄일 수 있다. 원래 입력을 자동으로 병합하거나 보관한다고 약속하면 안 된다.

## 화면 문구 수집 목록

TSX의 화면 텍스트, 접근성 이름, 플레이스홀더, 동적 문구와 한국어 상태 문자열을 코드에서 추출했다. CSS 키, 경로, API 원문 데이터와 법적 문헌 본문은 재작성 대상에서 제외했다. 동적 값은 `${…}`로 남겼다. 아래 표에는 비표시 분기의 대기 문구와 다운로드 파일 안내도 포함한다. API가 제공하는 실제 문헌명·사건 사실·청구항은 고정 UI 문구와 구분해 유지해야 한다.

| 화면 | 위치 | 종류 | 원문 |
|---|---|---|---|
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:221 | 상태·라벨 문자열 | 심사 개요 |
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:222 | 상태·라벨 문자열 | 서지정보 |
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:223 | 상태·라벨 문자열 | 명세서 · 청구항 |
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:224 | 상태·라벨 문자열 | 행정처리 이력 |
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:225 | 상태·라벨 문자열 | 패밀리 |
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:226 | 상태·라벨 문자열 | 문서함 |
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:230 | 상태·라벨 문자열 | 서지상세 |
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:231 | 상태·라벨 문자열 | CPC정보 |
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:232 | 상태·라벨 문자열 | 대표도면 |
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:233 | 상태·라벨 문자열 | 패밀리 |
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:268 | 상태·라벨 문자열 | API 사용량을 불러오지 못했습니다. |
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:280 | 상태·라벨 문자열 | 발명의 명칭 미수신 |
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:282 | 상태·라벨 문자열 | 심사 진행 |
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:283 | 상태·라벨 문자열 | ko-KR |
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:284 | 상태·라벨 문자열 | 출원인 미수신 |
| 사건 조회: 메뉴·출처 이름 | app/patent/page.tsx:297 | 상태·라벨 문자열 | 초록 데이터가 없습니다. |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:377 | 상태·라벨 문자열 | 의견제출통지서 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:384 | 상태·라벨 문자열 | 제 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:396 | 상태·라벨 문자열 | 특허·실용신안 출원번호 13자리를 확인해 주세요. |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:408 | 상태·라벨 문자열 | 샘플 사건 데이터를 불러왔습니다. |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:416 | 상태·라벨 문자열 | 사건 조회에 실패했습니다. |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:424 | 상태·라벨 문자열 | D1에 저장된 사건 데이터를 불러왔습니다. |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:424 | 상태·라벨 문자열 | KIPRIS Plus 최신 데이터를 불러왔습니다. |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:426 | 상태·라벨 문자열 | 사건 조회에 실패했습니다. |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:439 | 상태·라벨 문자열 | POST |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:439 | 상태·라벨 문자열 | GET |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:445 | 상태·라벨 문자열 | AI 요약을 불러오지 못했습니다. |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:452 | 상태·라벨 문자열 | 저장된 AI 요약을 불러왔습니다. |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:452 | 상태·라벨 문자열 | AI 심사요약을 생성했습니다. |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:454 | 상태·라벨 문자열 | AI 요약을 불러오지 못했습니다. |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:468 | 상태·라벨 문자열 | README.txt |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:469 | 동적 문구 | 심사데스크 MVP 자료 묶음 ↵ 출원번호: ${caseData.applicationNumber} ↵ 생성일: ${new Date().toLocaleString('ko-KR')} ↵  ↵ 이 묶음은 MVP에서 가공한 검토용 데이터입니다. 원문 전문·대표도면·의견제출통지서 PDF는 KIPRIS Plus API 키 연결 후 서버에서 내려받아 포함하는 구조입니다. |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:469 | 상태·라벨 문자열 | ko-KR |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:473 | 동적 문구 | 01_사건요약_${prefix}.json |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:495 | 동적 문구 | 02_청구항_${prefix}.json |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:501 | 상태·라벨 문자열 | 일자 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:501 | 상태·라벨 문자열 | 문서명 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:501 | 상태·라벨 문자열 | 상태 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:501 | 상태·라벨 문자열 | 접수발송번호 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:512 | 동적 문구 | 03_행정처리이력_${prefix}.csv |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:516 | 동적 문구 | 04_패밀리정보_${prefix}.json |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:522 | 동적 문구 | 05_원문파일목록_${prefix}.json |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:531 | 상태·라벨 문자열 | 문서를 열 때 PDF_V2에서 조회 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:541 | 동적 문구 | 심사자료_${prefix}_MVP.zip |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:543 | 상태·라벨 문자열 | 검토용 ZIP 묶음을 만들었습니다. |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:545 | 상태·라벨 문자열 | ZIP 묶음을 만드는 중 오류가 발생했습니다. |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:572 | 상태·라벨 문자열 | 출원일 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:572 | 동적 문구 | 공개 ${caseData.publicationDate \|\| '—'} |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:573 | 상태·라벨 문자열 | 청구항 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:573 | 동적 문구 | ${caseData.claimCount}항 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:573 | 동적 문구 | 독립항 ${caseData.claims.filter((claim) => !claim.text.trim().startsWith('제')).length} · 전체 ${caseData.claimCount} |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:573 | 상태·라벨 문자열 | 제 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:574 | 상태·라벨 문자열 | 주 CPC |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:574 | 동적 문구 | 전체 ${caseData.cpc.length}개 보기 ↗ |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:574 | 상태·라벨 문자열 | CPC 정보 없음 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:575 | 상태·라벨 문자열 | 패밀리 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:575 | 동적 문구 | ${familyCountryCount}개 관할청 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:575 | 상태·라벨 문자열 | 패밀리 없음 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:575 | 동적 문구 | ${caseData.family.length}개 문헌 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:575 | 상태·라벨 문자열 | 조회된 패밀리 문헌 없음 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:581 | 동적 문구 | ${name} ${count}회 |
| 사건 조회: 조회·요약·묶음 상태 | app/patent/page.tsx:583 | 상태·라벨 문자열 | 집계 정보를 불러오는 중입니다. |
| 사건 조회: 공통·검색 | app/patent/page.tsx:587 | 화면 텍스트 | 본문 바로가기 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:589 | 화면 텍스트 | 이 누리집은 대한민국 공식 전자정부 누리집의 디자인 원칙을 참고한 MVP입니다. |
| 사건 조회: 공통·검색 | app/patent/page.tsx:593 | aria-label | 심사데스크 홈 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:594 | 화면 텍스트 | 특허 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:595 | 화면 텍스트 | 심사데스크 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:595 | 화면 텍스트 | 특허 사건 검토 지원 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:598 | aria-label | 사건 메뉴 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:599 | 화면 텍스트 | ← |
| 사건 조회: 공통·검색 | app/patent/page.tsx:599 | 화면 텍스트 | AI 평가 업무 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:600 | 화면 텍스트 | ↓ |
| 사건 조회: 공통·검색 | app/patent/page.tsx:600 | 화면 텍스트 | 전문 PDF 모으기 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:601 | 화면 텍스트 | WORKSPACE |
| 사건 조회: 공통·검색 | app/patent/page.tsx:619 | 상태·라벨 문자열 | MVP 샘플 데이터 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:619 | 상태·라벨 문자열 | KIPRIS Plus 연결됨 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:620 | 상태·라벨 문자열 | 실제 응답 구조 기반 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:620 | 동적 문구 | ${sourceOkCount}/${caseData.sources.length}개 API 정상 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:628 | 화면 텍스트 | 출원번호로 사건 조회 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:630 | 화면 텍스트 | ⌕ |
| 사건 조회: 공통·검색 | app/patent/page.tsx:635 | aria-label | 출원번호 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:637 | placeholder | 예: 10-2020-0093844 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:639 | 화면 텍스트 | 조회 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:643 | 상태·라벨 문자열 | DEMO |
| 사건 조회: 공통·검색 | app/patent/page.tsx:643 | 상태·라벨 문자열 | LIVE |
| 사건 조회: 공통·검색 | app/patent/page.tsx:644 | 동적 문구 | KIPRIS Plus API D1 누적 호출 ${apiUsage?.total ?? 0}회 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:645 | 화면 텍스트 | API 호출 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:645 | 화면 텍스트 | 회 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:645 | 화면 텍스트 | D1 누적 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:647 | 화면 텍스트 | Worker Secret 연동 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:649 | 화면 텍스트 | 심사자료 묶음 만들기 |
| 사건 조회: 공통·검색 | app/patent/page.tsx:649 | 화면 텍스트 | ↓ |
| 사건 조회: 개요 | app/patent/page.tsx:657 | 화면 텍스트 | 심사 사건 |
| 사건 조회: 개요 | app/patent/page.tsx:657 | 화면 텍스트 | / |
| 사건 조회: 개요 | app/patent/page.tsx:657 | 화면 텍스트 | 국내 특허 |
| 사건 조회: 개요 | app/patent/page.tsx:657 | 화면 텍스트 | 개요 |
| 사건 조회: 개요 | app/patent/page.tsx:659 | aria-label | 사건 핵심 정보 |
| 사건 조회: 개요 | app/patent/page.tsx:666 | 동적 문구 | 주 CPC ${caseData.cpc[0].number} 분류 검색, 새 창 |
| 사건 조회: 개요 | app/patent/page.tsx:667 | 화면 텍스트 | ↗ |
| 사건 조회: 개요 | app/patent/page.tsx:681 | title | 심사 포인트 |
| 사건 조회: 개요 | app/patent/page.tsx:681 | 화면 텍스트 | 확인 필요 |
| 사건 조회: 개요 | app/patent/page.tsx:684 | 화면 텍스트 | 01 |
| 사건 조회: 개요 | app/patent/page.tsx:685 | 화면 텍스트 | 최근 의견제출통지서가 있습니다 |
| 사건 조회: 개요 | app/patent/page.tsx:685 | 화면 텍스트 | 발송 · |
| 사건 조회: 개요 | app/patent/page.tsx:686 | 화면 텍스트 | PDF 보기 |
| 사건 조회: 개요 | app/patent/page.tsx:686 | 화면 텍스트 | ↗ |
| 사건 조회: 개요 | app/patent/page.tsx:689 | 화면 텍스트 | 의견제출통지서 없음 |
| 사건 조회: 개요 | app/patent/page.tsx:689 | 화면 텍스트 | 서지상세 행정처리 기준으로 확인된 통지서가 없습니다. |
| 사건 조회: 개요 | app/patent/page.tsx:693 | 화면 텍스트 | A |
| 사건 조회: 개요 | app/patent/page.tsx:694 | 화면 텍스트 | 전체 명세서 · 청구항 검토 |
| 사건 조회: 개요 | app/patent/page.tsx:694 | 화면 텍스트 | 전문파일정보의 전체 본문과 청구항 |
| 사건 조회: 개요 | app/patent/page.tsx:694 | 화면 텍스트 | 개를 읽기 화면에서 확인 |
| 사건 조회: 개요 | app/patent/page.tsx:695 | 화면 텍스트 | → |
| 사건 조회: 개요 | app/patent/page.tsx:698 | 화면 텍스트 | F |
| 사건 조회: 개요 | app/patent/page.tsx:699 | 화면 텍스트 | 해외 패밀리 대조 |
| 사건 조회: 개요 | app/patent/page.tsx:699 | 동적 문구 | ${familyCountryCount}개 관할청 · ${caseData.family.length}개 문헌 |
| 사건 조회: 개요 | app/patent/page.tsx:699 | 상태·라벨 문자열 | 패밀리 없음 |
| 사건 조회: 개요 | app/patent/page.tsx:700 | 화면 텍스트 | → |
| 사건 조회: 개요 | app/patent/page.tsx:705 | 화면 텍스트 | AI EXAMINATION BRIEF |
| 사건 조회: 개요 | app/patent/page.tsx:705 | 화면 텍스트 | 발명 요약 |
| 사건 조회: 개요 | app/patent/page.tsx:712 | 상태·라벨 문자열 | 분석 중… |
| 사건 조회: 개요 | app/patent/page.tsx:712 | 상태·라벨 문자열 | 다시 생성 |
| 사건 조회: 개요 | app/patent/page.tsx:712 | 상태·라벨 문자열 | AI 요약 생성 |
| 사건 조회: 개요 | app/patent/page.tsx:720 | 화면 텍스트 | 기술적 과제 |
| 사건 조회: 개요 | app/patent/page.tsx:721 | 화면 텍스트 | 해결수단 |
| 사건 조회: 개요 | app/patent/page.tsx:722 | 화면 텍스트 | 청구범위 |
| 사건 조회: 개요 | app/patent/page.tsx:725 | 화면 텍스트 | 핵심 구성 |
| 사건 조회: 개요 | app/patent/page.tsx:726 | 화면 텍스트 | 심사 확인 포인트 |
| 사건 조회: 개요 | app/patent/page.tsx:729 | 화면 텍스트 | · |
| 사건 조회: 개요 | app/patent/page.tsx:729 | 상태·라벨 문자열 | D1 저장 요약 |
| 사건 조회: 개요 | app/patent/page.tsx:729 | 상태·라벨 문자열 | 새로 생성 |
| 사건 조회: 개요 | app/patent/page.tsx:729 | 화면 텍스트 | · AI 결과는 원문 확인이 필요합니다. |
| 사건 조회: 개요 | app/patent/page.tsx:733 | 상태·라벨 문자열 | 초록 기반 미리보기 |
| 사건 조회: 개요 | app/patent/page.tsx:733 | 상태·라벨 문자열 | 원문 초록 |
| 사건 조회: 개요 | app/patent/page.tsx:736 | 화면 텍스트 | 저장된 요약이 없으면 버튼을 눌러 최초 1회 생성합니다. |
| 사건 조회: 개요 | app/patent/page.tsx:743 | title | 대표도면 |
| 사건 조회: 개요 | app/patent/page.tsx:743 | 화면 텍스트 | 크게 보기 ↗ |
| 사건 조회: 개요 | app/patent/page.tsx:746 | 동적 문구 | ${caseData.title} 대표도면 |
| 사건 조회: 개요 | app/patent/page.tsx:747 | 화면 텍스트 | 대표도면 없음 |
| 사건 조회: 개요 | app/patent/page.tsx:748 | 화면 텍스트 | FIG. 1 |
| 사건 조회: 개요 | app/patent/page.tsx:753 | title | 최근 행정처리 |
| 사건 조회: 개요 | app/patent/page.tsx:753 | 화면 텍스트 | 전체 |
| 사건 조회: 개요 | app/patent/page.tsx:753 | 화면 텍스트 | 건 → |
| 사건 조회: 개요 | app/patent/page.tsx:756 | 상태·라벨 문자열 | 의견제출통지서 |
| 사건 조회: 개요 | app/patent/page.tsx:757 | 동적 문구 | timeline-dot ${event.title.includes('의견제출통지서') ? 'alert' : ''} |
| 사건 조회: 개요 | app/patent/page.tsx:757 | 상태·라벨 문자열 | 의견제출통지서 |
| 사건 조회: 개요 | app/patent/page.tsx:766 | aria-label | 데이터 수집 상태 |
| 사건 조회: 개요 | app/patent/page.tsx:767 | 화면 텍스트 | DATA SOURCES |
| 사건 조회: 개요 | app/patent/page.tsx:767 | 화면 텍스트 | 수집 상태 |
| 사건 조회: 서지정보 | app/patent/page.tsx:777 | title | 서지정보 |
| 사건 조회: 서지정보 | app/patent/page.tsx:777 | 화면 텍스트 | 이 정보 담기 ↓ |
| 사건 조회: 서지정보 | app/patent/page.tsx:780 | 화면 텍스트 | 출원 · 공개 · 심사 |
| 사건 조회: 서지정보 | app/patent/page.tsx:792 | 화면 텍스트 | 출원인 |
| 사건 조회: 서지정보 | app/patent/page.tsx:793 | 화면 텍스트 | APPLICANT |
| 사건 조회: 서지정보 | app/patent/page.tsx:794 | 동적 문구 | ${caseData.inventorCount}명 |
| 사건 조회: 서지정보 | app/patent/page.tsx:797 | 화면 텍스트 | 분류정보 |
| 사건 조회: 서지정보 | app/patent/page.tsx:799 | 상태·라벨 문자열 | 주 CPC |
| 사건 조회: 서지정보 | app/patent/page.tsx:799 | 상태·라벨 문자열 | CPC |
| 사건 조회: 서지정보 | app/patent/page.tsx:799 | 동적 문구 | ${cpc.number} CPC 분류 검색, 새 창 |
| 사건 조회: 서지정보 | app/patent/page.tsx:799 | 화면 텍스트 | ↗ |
| 사건 조회: 서지정보 | app/patent/page.tsx:800 | 화면 텍스트 | 전체 CPC |
| 사건 조회: 서지정보 | app/patent/page.tsx:800 | 화면 텍스트 | 개 보기 ↗ |
| 사건 조회: 서지정보 | app/patent/page.tsx:801 | 화면 텍스트 | CPC 정보가 없습니다. |
| 사건 조회: 서지정보 | app/patent/page.tsx:805 | 화면 텍스트 | INVENTION TITLE |
| 사건 조회: 서지정보 | app/patent/page.tsx:805 | 상태·라벨 문자열 | 영문 명칭 없음 |
| 사건 조회: 명세서 | app/patent/page.tsx:813 | title | 명세서 · 청구항 |
| 사건 조회: 명세서 | app/patent/page.tsx:813 | 화면 텍스트 | 전체 전문 보기 → |
| 사건 조회: 명세서 | app/patent/page.tsx:814 | 화면 텍스트 | A |
| 사건 조회: 명세서 | app/patent/page.tsx:814 | 화면 텍스트 | ABSTRACT |
| 사건 조회: 명세서 | app/patent/page.tsx:814 | 화면 텍스트 | 초록 |
| 사건 조회: 명세서 | app/patent/page.tsx:815 | 화면 텍스트 | 청구항 |
| 사건 조회: 명세서 | app/patent/page.tsx:815 | 화면 텍스트 | 개 항목 |
| 사건 조회: 명세서 | app/patent/page.tsx:815 | 화면 텍스트 | 전체 |
| 사건 조회: 명세서 | app/patent/page.tsx:815 | 화면 텍스트 | 독립항 |
| 사건 조회: 명세서 | app/patent/page.tsx:817 | 동적 문구 | claim-card ${!claim.text.trim().startsWith('제') ? 'independent' : ''} |
| 사건 조회: 명세서 | app/patent/page.tsx:817 | 상태·라벨 문자열 | 제 |
| 사건 조회: 명세서 | app/patent/page.tsx:817 | 화면 텍스트 | 청구항 |
| 사건 조회: 명세서 | app/patent/page.tsx:817 | 화면 텍스트 | 독립항 |
| 사건 조회: 행정이력 | app/patent/page.tsx:824 | title | 행정처리 이력 |
| 사건 조회: 행정이력 | app/patent/page.tsx:824 | 화면 텍스트 | 총 |
| 사건 조회: 행정이력 | app/patent/page.tsx:824 | 화면 텍스트 | 건 |
| 사건 조회: 행정이력 | app/patent/page.tsx:825 | 화면 텍스트 | 전체 이력 |
| 사건 조회: 행정이력 | app/patent/page.tsx:825 | 화면 텍스트 | 의견제출통지서 |
| 사건 조회: 행정이력 | app/patent/page.tsx:825 | 화면 텍스트 | 의견제출통지서는 PDF_V2 자동조회 대상입니다. |
| 사건 조회: 행정이력 | app/patent/page.tsx:827 | 화면 텍스트 | 일자 |
| 사건 조회: 행정이력 | app/patent/page.tsx:827 | 화면 텍스트 | 문서명 |
| 사건 조회: 행정이력 | app/patent/page.tsx:827 | 화면 텍스트 | 처리상태 |
| 사건 조회: 행정이력 | app/patent/page.tsx:827 | 화면 텍스트 | 접수·발송번호 |
| 사건 조회: 행정이력 | app/patent/page.tsx:827 | 화면 텍스트 | 원문 |
| 사건 조회: 행정이력 | app/patent/page.tsx:829 | 상태·라벨 문자열 | 의견제출통지서 |
| 사건 조회: 행정이력 | app/patent/page.tsx:831 | 화면 텍스트 | PDF 열기 ↗ |
| 사건 조회: 행정이력 | app/patent/page.tsx:831 | 화면 텍스트 | — |
| 사건 조회: 패밀리 | app/patent/page.tsx:839 | title | 패밀리 상태 |
| 사건 조회: 패밀리 | app/patent/page.tsx:839 | 동적 문구 | ${familyCountryCount}개 관할청 |
| 사건 조회: 패밀리 | app/patent/page.tsx:839 | 상태·라벨 문자열 | 패밀리 없음 |
| 사건 조회: 패밀리 | app/patent/page.tsx:841 | 화면 텍스트 | 관할청 |
| 사건 조회: 패밀리 | app/patent/page.tsx:841 | 화면 텍스트 | 출원번호 |
| 사건 조회: 패밀리 | app/patent/page.tsx:841 | 화면 텍스트 | 패밀리 종류 |
| 사건 조회: 패밀리 | app/patent/page.tsx:841 | 화면 텍스트 | 문헌번호 |
| 사건 조회: 패밀리 | app/patent/page.tsx:841 | 화면 텍스트 | 공개번호 |
| 사건 조회: 패밀리 | app/patent/page.tsx:843 | 화면 텍스트 | KR |
| 사건 조회: 패밀리 | app/patent/page.tsx:843 | 화면 텍스트 | PATENT FAMILY |
| 사건 조회: 패밀리 | app/patent/page.tsx:843 | 화면 텍스트 | 패밀리 없음 |
| 사건 조회: 패밀리 | app/patent/page.tsx:843 | 화면 텍스트 | patentFamilyInfo |
| 사건 조회: 패밀리 | app/patent/page.tsx:843 | 화면 텍스트 | 응답에서 확인되는 패밀리 문헌이 없습니다. 응답이 비어 있거나 조회 결과가 없는 경우 임의 데이터를 만들지 않고 ‘패밀리 없음’으로 표시합니다. |
| 사건 조회: 문서함 | app/patent/page.tsx:850 | title | 문서함 |
| 사건 조회: 문서함 | app/patent/page.tsx:850 | 화면 텍스트 | 심사자료 묶음 만들기 ↓ |
| 사건 조회: 문서함 | app/patent/page.tsx:852 | 화면 텍스트 | PDF |
| 사건 조회: 문서함 | app/patent/page.tsx:852 | 화면 텍스트 | 공개·등록공보 전문 |
| 사건 조회: 문서함 | app/patent/page.tsx:852 | 화면 텍스트 | AI 검색을 위한 전체 원문 PDF |
| 사건 조회: 문서함 | app/patent/page.tsx:853 | title | 출원 전문 |
| 사건 조회: 문서함 | app/patent/page.tsx:853 | 상태·라벨 문자열 | 열 때 전문파일정보 조회 |
| 사건 조회: 문서함 | app/patent/page.tsx:854 | title | 대표도면 |
| 사건 조회: 문서함 | app/patent/page.tsx:854 | 상태·라벨 문자열 | 대표도면 없음 |
| 사건 조회: 문서함 | app/patent/page.tsx:855 | title | 의견제출통지서 |
| 사건 조회: 문서함 | app/patent/page.tsx:855 | 동적 문구 | ${formatDate(notice.date)} 발송 |
| 사건 조회: 문서함 | app/patent/page.tsx:855 | 동적 문구 | 발송번호 ${notice.documentNumber} |
| 사건 조회: 문서함 | app/patent/page.tsx:856 | 화면 텍스트 | ZIP |
| 사건 조회: 문서함 | app/patent/page.tsx:856 | 화면 텍스트 | 심사자료 묶음 |
| 사건 조회: 문서함 | app/patent/page.tsx:856 | 화면 텍스트 | 요약·청구항·이력·패밀리·원문 목록 |
| 사건 조회: 문서함 | app/patent/page.tsx:856 | 화면 텍스트 | 구성하기 ↓ |
| 사건 조회: 하단·상태 | app/patent/page.tsx:862 | 화면 텍스트 | 심사데스크 |
| 사건 조회: 하단·상태 | app/patent/page.tsx:862 | 화면 텍스트 | KIPRIS Plus 특허 사건 검토 지원 MVP |
| 사건 조회: 하단·상태 | app/patent/page.tsx:863 | 화면 텍스트 | 전문·도면·행정처리·패밀리 데이터는 원 API 응답을 기준으로 표시합니다. |
| 사건 조회: 하단·상태 | app/patent/page.tsx:867 | 화면 텍스트 | KIPRIS Plus 조회 중 |
| 사건 조회: 하단·상태 | app/patent/page.tsx:867 | 화면 텍스트 | 서지·전문·도면·패밀리·이력을 함께 가져오고 있습니다. |
| 사건 조회: 대화상자 | app/patent/page.tsx:873 | 화면 텍스트 | OFFICE ACTION · PDF_V2 |
| 사건 조회: 대화상자 | app/patent/page.tsx:873 | 화면 텍스트 | 의견제출통지서 |
| 사건 조회: 대화상자 | app/patent/page.tsx:873 | 화면 텍스트 | · |
| 사건 조회: 대화상자 | app/patent/page.tsx:873 | aria-label | 닫기 |
| 사건 조회: 대화상자 | app/patent/page.tsx:873 | 화면 텍스트 | × |
| 사건 조회: 대화상자 | app/patent/page.tsx:875 | 동적 문구 | ${formatDate(selectedNotice.date)} 의견제출통지서 PDF |
| 사건 조회: 대화상자 | app/patent/page.tsx:875 | 상태·라벨 문자열 | 의견제출통지서.pdf |
| 사건 조회: 대화상자 | app/patent/page.tsx:875 | 화면 텍스트 | 새 창에서 열기 ↗ |
| 사건 조회: 대화상자 | app/patent/page.tsx:877 | 화면 텍스트 | 특허청 |
| 사건 조회: 대화상자 | app/patent/page.tsx:877 | 화면 텍스트 | 의견제출통지서 |
| 사건 조회: 대화상자 | app/patent/page.tsx:877 | 화면 텍스트 | PDF V2 |
| 사건 조회: 대화상자 | app/patent/page.tsx:877 | 화면 텍스트 | 출원번호 |
| 사건 조회: 대화상자 | app/patent/page.tsx:877 | 화면 텍스트 | 발송일자 |
| 사건 조회: 대화상자 | app/patent/page.tsx:877 | 화면 텍스트 | 발송번호 |
| 사건 조회: 대화상자 | app/patent/page.tsx:877 | 화면 텍스트 | 원문 영역 |
| 사건 조회: 대화상자 | app/patent/page.tsx:877 | 화면 텍스트 | API CONNECTION |
| 사건 조회: 대화상자 | app/patent/page.tsx:877 | 화면 텍스트 | PDF 자동조회 위치 |
| 사건 조회: 대화상자 | app/patent/page.tsx:877 | 화면 텍스트 | 서지상세 행정처리의 접수·발송번호를 |
| 사건 조회: 대화상자 | app/patent/page.tsx:877 | 화면 텍스트 | sendNumber |
| 사건 조회: 대화상자 | app/patent/page.tsx:877 | 화면 텍스트 | 로 전달해 PDF_V2 원문을 이 창에 표시합니다. |
| 사건 조회: 대화상자 | app/patent/page.tsx:877 | 화면 텍스트 | 문서명에서 의견제출통지서 감지 |
| 사건 조회: 대화상자 | app/patent/page.tsx:877 | 화면 텍스트 | 출원번호 + 발송번호로 PDF_V2 호출 |
| 사건 조회: 대화상자 | app/patent/page.tsx:877 | 화면 텍스트 | 반환된 filePath를 인라인 미리보기 |
| 사건 조회: 대화상자 | app/patent/page.tsx:886 | 화면 텍스트 | COOPERATIVE PATENT CLASSIFICATION |
| 사건 조회: 대화상자 | app/patent/page.tsx:886 | 화면 텍스트 | 전체 CPC |
| 사건 조회: 대화상자 | app/patent/page.tsx:886 | 화면 텍스트 | · 총 |
| 사건 조회: 대화상자 | app/patent/page.tsx:886 | 화면 텍스트 | 개 |
| 사건 조회: 대화상자 | app/patent/page.tsx:886 | aria-label | 닫기 |
| 사건 조회: 대화상자 | app/patent/page.tsx:886 | 화면 텍스트 | × |
| 사건 조회: 대화상자 | app/patent/page.tsx:889 | 동적 문구 | ${cpc.number} CPC 분류 검색, 새 창 |
| 사건 조회: 대화상자 | app/patent/page.tsx:891 | 화면 텍스트 | ↗ |
| 사건 조회: 대화상자 | app/patent/page.tsx:891 | 동적 문구 | 분류일자 ${cpc.date} |
| 사건 조회: 대화상자 | app/patent/page.tsx:891 | 상태·라벨 문자열 | 분류일자 미수신 |
| 사건 조회: 대화상자 | app/patent/page.tsx:892 | 화면 텍스트 | 주 CPC |
| 사건 조회: 대화상자 | app/patent/page.tsx:892 | 화면 텍스트 | 분류 조회 |
| 사건 조회: 대화상자 | app/patent/page.tsx:894 | 화면 텍스트 | 조회된 CPC 정보가 없습니다. |
| 사건 조회: 대화상자 | app/patent/page.tsx:902 | 화면 텍스트 | REPRESENTATIVE DRAWING |
| 사건 조회: 대화상자 | app/patent/page.tsx:902 | 화면 텍스트 | · 대표도면 |
| 사건 조회: 대화상자 | app/patent/page.tsx:902 | aria-label | 닫기 |
| 사건 조회: 대화상자 | app/patent/page.tsx:902 | 화면 텍스트 | × |
| 사건 조회: 대화상자 | app/patent/page.tsx:902 | 동적 문구 | ${caseData.title} 대표도면 확대 |
| 사건 조회: 대화상자 | app/patent/page.tsx:902 | 화면 텍스트 | 대표도면이 없습니다. |
| 사건 조회: 대화상자 | app/patent/page.tsx:908 | 화면 텍스트 | EXPORT PACKAGE |
| 사건 조회: 대화상자 | app/patent/page.tsx:908 | 화면 텍스트 | 심사자료 묶음 만들기 |
| 사건 조회: 대화상자 | app/patent/page.tsx:908 | 화면 텍스트 | · |
| 사건 조회: 대화상자 | app/patent/page.tsx:908 | aria-label | 닫기 |
| 사건 조회: 대화상자 | app/patent/page.tsx:908 | 화면 텍스트 | × |
| 사건 조회: 대화상자 | app/patent/page.tsx:909 | 상태·라벨 문자열 | 사건 요약 |
| 사건 조회: 대화상자 | app/patent/page.tsx:909 | 상태·라벨 문자열 | 서지·상태·초록 JSON |
| 사건 조회: 대화상자 | app/patent/page.tsx:910 | 상태·라벨 문자열 | 청구항 |
| 사건 조회: 대화상자 | app/patent/page.tsx:910 | 동적 문구 | ${caseData.claimCount}개 청구항 JSON |
| 사건 조회: 대화상자 | app/patent/page.tsx:911 | 상태·라벨 문자열 | 행정처리 이력 |
| 사건 조회: 대화상자 | app/patent/page.tsx:911 | 동적 문구 | ${caseData.history.length}건 CSV |
| 사건 조회: 대화상자 | app/patent/page.tsx:912 | 상태·라벨 문자열 | 패밀리 정보 |
| 사건 조회: 대화상자 | app/patent/page.tsx:912 | 동적 문구 | ${caseData.family.length}개 문헌 JSON |
| 사건 조회: 대화상자 | app/patent/page.tsx:913 | 상태·라벨 문자열 | 원문파일 목록 |
| 사건 조회: 대화상자 | app/patent/page.tsx:913 | 상태·라벨 문자열 | 전문·도면·PDF 조회정보 JSON |
| 사건 조회: 대화상자 | app/patent/page.tsx:914 | 화면 텍스트 | ZIP |
| 사건 조회: 대화상자 | app/patent/page.tsx:914 | 화면 텍스트 | 검토용 데이터 패키지 |
| 사건 조회: 대화상자 | app/patent/page.tsx:914 | 화면 텍스트 | MVP에서는 가공 데이터와 원문 파일 목록을 묶습니다. 실제 원문 바이너리는 API 키 연결 및 접근정책 확정 후 포함합니다. |
| 사건 조회: 대화상자 | app/patent/page.tsx:914 | 화면 텍스트 | 취소 |
| 사건 조회: 대화상자 | app/patent/page.tsx:914 | 상태·라벨 문자열 | 묶음 생성 중… |
| 사건 조회: 대화상자 | app/patent/page.tsx:914 | 상태·라벨 문자열 | ZIP 다운로드 ↓ |
| 사건 조회: 공통 컴포넌트 | app/patent/page.tsx:923 | 상태·라벨 문자열 | 샘플 사건 |
| 사건 조회: 공통 컴포넌트 | app/patent/page.tsx:923 | 동적 문구 | ${data.updatedAt} 갱신 |
| 사건 조회: 공통 컴포넌트 | app/patent/page.tsx:923 | 화면 텍스트 | 출원인 |
| 사건 조회: 공통 컴포넌트 | app/patent/page.tsx:923 | 상태·라벨 문자열 | 국가정보 없음 |
| 사건 조회: 공통 컴포넌트 | app/patent/page.tsx:939 | 상태·라벨 문자열 | 준비됨 |
| 사건 조회: 공통 컴포넌트 | app/patent/page.tsx:939 | 상태·라벨 문자열 | 연동 대기 |
| 전문 읽기: 검증·요청·검색 집계 | app/fulltext/fulltext-viewer.tsx:42 | 상태·라벨 문자열 | 제 |
| 전문 읽기: 검증·요청·검색 집계 | app/fulltext/fulltext-viewer.tsx:60 | 상태·라벨 문자열 | ko-KR |
| 전문 읽기: 검증·요청·검색 집계 | app/fulltext/fulltext-viewer.tsx:90 | 상태·라벨 문자열 | 전문파일을 불러오지 못했습니다. |
| 전문 읽기: 검증·요청·검색 집계 | app/fulltext/fulltext-viewer.tsx:95 | 상태·라벨 문자열 | 전문파일을 불러오지 못했습니다. |
| 전문 읽기: 검증·요청·검색 집계 | app/fulltext/fulltext-viewer.tsx:112 | 상태·라벨 문자열 | ko-KR |
| 전문 읽기: 검증·요청·검색 집계 | app/fulltext/fulltext-viewer.tsx:120 | 상태·라벨 문자열 | ko-KR |
| 전문 읽기: 검증·요청·검색 집계 | app/fulltext/fulltext-viewer.tsx:128 | 상태·라벨 문자열 | 전문 명세서 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:133 | 화면 텍스트 | 본문 바로가기 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:135 | 화면 텍스트 | 이 누리집은 대한민국 공식 전자정부 누리집의 디자인 원칙을 참고한 MVP입니다. |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:140 | 화면 텍스트 | 특허 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:141 | 화면 텍스트 | 심사데스크 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:141 | 화면 텍스트 | 특허 사건 검토 지원 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:143 | aria-label | 주요 메뉴 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:144 | 화면 텍스트 | 사건 대시보드 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:145 | 화면 텍스트 | 전문 명세서 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:151 | aria-label | 현재 위치 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:152 | 화면 텍스트 | 홈 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:152 | 화면 텍스트 | › |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:152 | 화면 텍스트 | 심사 사건 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:152 | 화면 텍스트 | 전문 명세서 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:157 | 화면 텍스트 | 전문파일정보 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:158 | 화면 텍스트 | 전문을 표시할 수 없습니다 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:160 | 화면 텍스트 | 사건 대시보드로 돌아가기 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:165 | 화면 텍스트 | 전문 XML을 읽고 있습니다 |
| 전문 읽기: 공통·오류·로딩 | app/fulltext/fulltext-viewer.tsx:166 | 화면 텍스트 | 명세서의 장·문단과 전체 청구항을 구성하는 중입니다. |
| 전문 읽기: 출원 정보·동작 | app/fulltext/fulltext-viewer.tsx:173 | 화면 텍스트 | 전문파일정보 |
| 전문 읽기: 출원 정보·동작 | app/fulltext/fulltext-viewer.tsx:174 | 상태·라벨 문자열 | 샘플 사건 |
| 전문 읽기: 출원 정보·동작 | app/fulltext/fulltext-viewer.tsx:174 | 상태·라벨 문자열 | KIPRIS Plus 실시간 |
| 전문 읽기: 출원 정보·동작 | app/fulltext/fulltext-viewer.tsx:176 | 화면 텍스트 | 출원번호 |
| 전문 읽기: 출원 정보·동작 | app/fulltext/fulltext-viewer.tsx:180 | 화면 텍스트 | 명세서 문단 |
| 전문 읽기: 출원 정보·동작 | app/fulltext/fulltext-viewer.tsx:180 | 화면 텍스트 | 개 |
| 전문 읽기: 출원 정보·동작 | app/fulltext/fulltext-viewer.tsx:181 | 화면 텍스트 | 청구항 |
| 전문 읽기: 출원 정보·동작 | app/fulltext/fulltext-viewer.tsx:181 | 화면 텍스트 | 개 |
| 전문 읽기: 출원 정보·동작 | app/fulltext/fulltext-viewer.tsx:182 | 화면 텍스트 | 도면 |
| 전문 읽기: 출원 정보·동작 | app/fulltext/fulltext-viewer.tsx:182 | 화면 텍스트 | 개 |
| 전문 읽기: 출원 정보·동작 | app/fulltext/fulltext-viewer.tsx:183 | 화면 텍스트 | 원문 파일 |
| 전문 읽기: 출원 정보·동작 | app/fulltext/fulltext-viewer.tsx:187 | 화면 텍스트 | 사건 개요 |
| 전문 읽기: 출원 정보·동작 | app/fulltext/fulltext-viewer.tsx:188 | 화면 텍스트 | 인쇄·PDF 저장 |
| 전문 읽기: 검색·목차 | app/fulltext/fulltext-viewer.tsx:192 | aria-label | 전문 내 검색 |
| 전문 읽기: 검색·목차 | app/fulltext/fulltext-viewer.tsx:193 | 화면 텍스트 | 전문 내 검색 |
| 전문 읽기: 검색·목차 | app/fulltext/fulltext-viewer.tsx:195 | placeholder | 구성요소, 도면부호, 용어 검색 |
| 전문 읽기: 검색·목차 | app/fulltext/fulltext-viewer.tsx:196 | 동적 문구 | ${matchCount}개 문단에서 일치 |
| 전문 읽기: 검색·목차 | app/fulltext/fulltext-viewer.tsx:196 | 상태·라벨 문자열 | 명세서와 청구항 전체 검색 |
| 전문 읽기: 검색·목차 | app/fulltext/fulltext-viewer.tsx:201 | aria-label | 페이지 내부 목차 |
| 전문 읽기: 검색·목차 | app/fulltext/fulltext-viewer.tsx:202 | 화면 텍스트 | 페이지 목차 |
| 전문 읽기: 검색·목차 | app/fulltext/fulltext-viewer.tsx:203 | 화면 텍스트 | 초록 |
| 전문 읽기: 검색·목차 | app/fulltext/fulltext-viewer.tsx:207 | 화면 텍스트 | 청구범위 |
| 전문 읽기: 검색·목차 | app/fulltext/fulltext-viewer.tsx:208 | 화면 텍스트 | 데이터 출처 |
| 전문 읽기: 검색·목차 | app/fulltext/fulltext-viewer.tsx:208 | 화면 텍스트 | KIPRIS Plus 전문파일정보 XML을 읽기 화면으로 가공했습니다. |
| 전문 읽기: 본문·청구범위 | app/fulltext/fulltext-viewer.tsx:213 | 화면 텍스트 | 01 |
| 전문 읽기: 본문·청구범위 | app/fulltext/fulltext-viewer.tsx:213 | 화면 텍스트 | ABSTRACT |
| 전문 읽기: 본문·청구범위 | app/fulltext/fulltext-viewer.tsx:213 | 화면 텍스트 | 초록 |
| 전문 읽기: 본문·청구범위 | app/fulltext/fulltext-viewer.tsx:221 | 화면 텍스트 | DESCRIPTION |
| 전문 읽기: 본문·청구범위 | app/fulltext/fulltext-viewer.tsx:233 | 화면 텍스트 | CLAIMS |
| 전문 읽기: 본문·청구범위 | app/fulltext/fulltext-viewer.tsx:233 | 화면 텍스트 | 청구범위 |
| 전문 읽기: 본문·청구범위 | app/fulltext/fulltext-viewer.tsx:234 | aria-label | 청구항 필터 |
| 전문 읽기: 본문·청구범위 | app/fulltext/fulltext-viewer.tsx:235 | 화면 텍스트 | 전체 |
| 전문 읽기: 본문·청구범위 | app/fulltext/fulltext-viewer.tsx:236 | 화면 텍스트 | 독립항 |
| 전문 읽기: 본문·청구범위 | app/fulltext/fulltext-viewer.tsx:242 | 화면 텍스트 | 청구항 |
| 전문 읽기: 본문·청구범위 | app/fulltext/fulltext-viewer.tsx:242 | 화면 텍스트 | 독립항 |
| 전문 읽기: 하단 | app/fulltext/fulltext-viewer.tsx:255 | 화면 텍스트 | 심사데스크 |
| 전문 읽기: 하단 | app/fulltext/fulltext-viewer.tsx:255 | 화면 텍스트 | KIPRIS Plus 데이터를 심사 흐름에 맞게 정리하는 검토용 MVP |
| 전문 읽기: 하단 | app/fulltext/fulltext-viewer.tsx:256 | 화면 텍스트 | 전문 원문은 KIPRIS Plus API 응답을 기준으로 표시합니다. |
