# 평가 업무 UI·UX 및 UX 라이팅 점검

> 이 문서는 수정 전 점검 기록이다. 제안 적용을 완료했으며 최신 상태는 [UX 라이팅 적용 결과](UX_WRITING_APPLIED.md)를 참고한다.

점검일: 2026-10-27. 대상: `app/evaluation/workspace.tsx`, `app/evaluation/evaluation.css` 및 업무 요구사항. 실제 코드는 수정하지 않았으며 아래 항목은 승인 전 제안이다. 사용자 요청의 [ux-writing 스킬](https://github.com/toss/apps-in-toss-harness/blob/main/packages/agent-plugin/shared/skills/ux-writing/SKILL.md)을 기준으로 문구를 수집했다. 기능·접근성 문제는 이 스킬의 문자열 재작성 범위와 구분해 제안했다.

이 보고서의 근거는 코드 정적 점검이다. 실화면 재현은 주 에이전트가 별도로 수행한다. 기능상의 변경이 필요한 제안은 문구만 바꾸어 해결된 것으로 간주하지 않는다.

## 보존할 업무 용어와 잘된 점

- 설계 문서의 고정 명칭인 **대상 건 선정**, **AI 검색 결과 입력**, **AI 검색 결과 입력 완료**, **내 심사 업무**, **AI 담당 업무**, **대기 중 / 입력 완료 / 재확인 필요**는 그대로 유지한다.
- 미선택과 실제 0점·X를 구별하는 설명, 선행기술조사의 순위 비교 전용 표시, 초안과 공개 결과의 분리, 마감 월 안내는 사용자의 판단에 필요한 설명이다.
- 문헌 평가 입력은 각 문헌·조사 방식을 포함한 `aria-label`이 있다. 표 헤더는 스크롤 안에서 고정되고, 900px 아래는 출원 목록이 가로 목록으로 전환된다.
- 존댓말의 주된 문체는 합니다체로 일관된다. 사용자 감정을 대신 단정하거나 혜택 상실을 압박하는 문구는 확인되지 않았다.

## 우선 수정 제안

| 번호·우선순위 | 근거와 현재 경험 | 제안 문구 또는 동작 | 원칙·영향 |
|---|---|---|---|
| E01 · 높음 | 74행 오류 안내: **입력 내용은 유지됩니다. 최신 자료를 확인한 뒤 다시 저장해 주세요.** 그러나 49행은 새로 불러올 때 loadSerial을 올리고 96행의 key는 편집기를 새로 만든다. 새로고침을 승인하면 입력이 초기화된다. | 문구: **다른 화면에서 자료가 변경되어 저장하지 못했습니다. 입력 내용을 보관한 뒤 최신 자료와 비교해 주세요.** 동작: 편집값을 보관한 상태에서 최신 자료를 별도 조회·비교하거나 입력 복사/복구 경로를 제공한다. 단순 문구 변경만으로 해결하지 않는다. | 원인 + 실현 가능한 다음 행동. 사용자가 안내를 따르다가 입력을 잃을 수 있는 점이 핵심이다. |
| E02 · 높음 | 92행의 **업무 시작 →** 는 모든 사용자에게 `setView('review')`를 실행한다. AI 담당자 역할만 가진 사용자는 110행의 **심사관 역할이 배정되지 않았습니다.** 부터 보게 된다. | 버튼의 업무 명칭은 유지하되 역할에 맞는 첫 화면으로 이동한다. AI 전담자는 **AI 담당 업무**, 겸임자는 **내 심사 업무**로 진입한다. 불필요한 오류형 빈 상태를 먼저 보여주지 않는다. | CTA가 약속한 결과와 실제 첫 화면 일치. 사용자가 맡지 않은 역할의 오류로 업무를 시작하게 하지 않는다. |
| E03 · 높음 | 157행 **검색 문헌 PDF 모으기 ↗** 는 같은 탭의 다른 페이지로 이동한다. 사용자·선택 출원·메뉴 상태는 31~36행의 메모리 상태이고 복귀 세션 저장이 없다. PDF 페이지에서 홈 링크로 돌아오면 다시 사용자 선택이 필요하다. | 동작: 자료 수집을 새 탭·패널로 열거나 사용자·운영월·현재 업무의 복귀 상태를 보존한다. 문구: **검색 문헌 PDF 모으기** 를 유지하고 새 창이면 접근 가능한 **새 창** 안내를 추가한다. | 사용자가 하던 일을 이어갈 수 있어야 한다. PDF 준비와 AI 결과 등록을 오가는 핵심 흐름의 단절이다. |
| E04 · 높음 | 206행 **사용자를 선택하면 오른쪽에 정보를 불러옵니다.** 그러나 기존 사용자 선택은 `<tr onClick>`뿐이며 버튼·탭 순서·키보드 이벤트가 없다. CSS 141행은 1200px 이하에서 1열로 바꾸므로 '오른쪽'도 맞지 않는다. | 문구: **이름을 선택해 사용자 정보를 수정하세요.** 동작: 사용자 이름을 실제 버튼으로 제공해 Tab·Enter로 선택 가능하게 한다. 선택 상태도 프로그램에서 알 수 있게 표시한다. | 동작을 구체화하고 화면 위치에 의존하지 않기. 키보드로 관리 기능에 접근할 수 없는 점은 문구보다 먼저 해결할 항목이다. |
| E05 · 보통 | MonthSettings 198행은 `const disabled = busy` 이며 마감 월에서도 설정 필드와 199행 **월별 운영·배정 저장** 버튼이 활성이다. 서버는 `evaluation.ts:228`에서 마감 월 저장을 거부한다. 공통 74행은 모든409에 최신 자료 안내를 붙인다. | 입력·저장 제어를 마감 상태에 맞춘다. 안내: **이달의 설정을 바꾸려면 통계·현황에서 운영을 재개방하세요.** 서버 오류의 마감·기한·경합 사유별로 다음 행동을 구분한다. | 막힌 이유와 실제 가능한 해결 경로. 입력을 마친 다음에야 저장 불가를 알게 되는 낭비를 줄인다. |
| E06 · 보통 | 138행 순위 선택에는 항상 **1위 / 2위 / 3위 / 순위 외 / 평가 제외 / 비교 불가** 가 모두 나온다. 설명은 **동순위 없이 1위부터 연속해서 선택하세요.** 이고, 일부 평가를 저장해도 **문헌 평가와 품질 순위를 저장했습니다.** 만 알린다. 필요한 항목이 남아 평가 중인지 확인하려면 사용자가 전부 찾아야 한다. | 문구: **평가를 저장했습니다. 점수·인용여부가 남은 문헌 {n}건과 품질 순위를 확인해 주세요.** 순위 설명은 '비교 대상1개: 비교 불가 / 2~3개: 연속 순위 / 4개 이상: 상위3개 외 순위 외'로 짧게 나눈다. 불가능한 선택은 업무 규칙을 반영해 안내한다. | 조건 분리, 저장과 업무 완료 구별. 부분 저장은 유지하되 완료까지 남은 일을 알린다. |
| E07 · 보통 | 84~85, 92~93행에 **PRIOR ART REVIEW WORKSPACE / WORKSPACE / AI SEARCH · HUMAN REVIEW / MY REVIEW WORKSPACE / AI SEARCH WORKSPACE / OPERATIONS & INSIGHTS** 가 한국어 화면 명칭과 함께 반복된다. 87행의 **키프리스 원문 검색 ↗** 는 실제로 출원번호 단건 사건 조회로 연결된다. | 장식 영문은 줄이거나 **업무 메뉴 / AI 검색 결과 평가 / 내 심사 업무 / AI 담당 업무 / 운영 현황** 등 한국어로 정리한다. 단건 조회 메뉴는 **출원번호로 사건 조회** 로 제안한다. AI·PDF·CPC·KIPRIS Plus 같은 기술명·고유명은 유지한다. | 언어 혼용 최소화, 반복 제거, 메뉴의 실제 기능을 설명. 영문 자체가 오류라기보다 업무 화면에서 중복 정보인 점이 문제다. |
| E08 · 보통 | 184행 마감 확인: **이 운영월의 입력과 평가를 마감하시겠습니까?** 대상 월·선정 변경 제한·재개방 가능 여부는 대화상자에서 확인할 수 없다. | **{운영월} 운영을 마감하시겠습니까? 이달의 선정·AI 결과 입력·평가를 수정할 수 없게 됩니다. 필요하면 운영을 다시 열 수 있습니다.** 사용자 정의 대화상자를 쓰는 경우 동작 버튼은 **운영 마감**, 보조 버튼은 **계속 운영** 으로 제안한다. | 변경 대상과 결과를 구체적으로 말하기. 되돌릴 수 있는 운영 동작을 영구 삭제처럼 압박하지 않는다. |

## 별도 업무 규칙 확인 항목

111행은 현재 월 참여자 목록에 없는 심사관에게 **이 운영월의 참여자로 배정되지 않았습니다.** 를 표시하고 기존 담당 출원 목록보다 먼저 반환한다. 설계 문서는 선정 당시 담당자·소속을 보존하도록 하고 백엔드도 이전 담당 출원을 유지한다. 관리자가 월 참여 목록에서 제외한 후에도 본인이 선정한 출원을 열람·평가하도록 할 것인지 확인해야 한다. 기존 담당 건을 계속 제공하는 정책이면 '새 선정 가능 여부'와 '기존 담당 건 접근'을 분리해야 한다. 해당 문제를 문구 제안만으로 고쳤다고 판단하지 않는다.

## 추가 문구 제안

| 위치 | 현재 | 수정 제안 | 이유 |
|---|---|---|---|
| 92행 첫 진입 | 검색의 시작부터 / 평가의 마무리까지. | AI 검색 결과를 등록하고 평가하세요. | 첫 화면에서 할 수 있는 일을 직접 말한다. |
| 149행 대기 필터 빈 상태 | 표시할 업무가 없습니다. | 입력 대기 중인 업무가 없습니다. 전체 입력 업무에서 공개한 결과를 확인하세요. | 전체0건과 필터0건을 구분하고 다음 경로를 안내한다. |
| 149행 배정 없음 | 이 운영월에 배정받은 업무가 없습니다. / 담당 그룹·조사 방식의 배정과 대상 건 확정 여부를 확인하세요. | 이달에 배정된 AI 입력 업무가 없습니다. 운영월을 확인하거나 관리자에게 담당 배정을 문의하세요. | 일반 담당자가 직접 수정할 수 없는 설정의 책임·행동을 명확히 한다. |
| 157행 임시저장 성공 | 검색 결과 초안을 임시저장했습니다. 심사관에게는 아직 공개되지 않습니다. | 검색 결과 초안을 임시저장했습니다. [기공개 결과가 있으면] 심사관에게는 이전 공개 결과가 계속 보입니다. | 초안이 미공개인 점과 기존 결과 유지 여부를 함께 구별한다. |
| 115행·149행 다운로드 CTA | 내 업무 자료 엑셀 / 담당 업무 자료 엑셀 | 내 업무 자료 엑셀 저장 / 담당 업무 자료 엑셀 저장 | 파일 형식과 누른 뒤 결과를 같은 버튼에서 알린다. |
| 199행 설정 안내 | 기한을 비워두면 제한 없음, 건수 상한0은 제한 없음으로 처리합니다. | 기한: 비워두면 제한 없음 / 출원 건수 상한:0이면 제한 없음 | 별개 조건을 나눠 빠르게 읽게 한다. |

## UI·접근성 후속 점검

- 탭과 선택 메뉴는 시각적 active 클래스만 적용한다(86,184,190행). 현재 메뉴·선택 탭을 `aria-current` 또는 올바른 탭 의미구조로 전달하는 보완을 제안한다.
- 상태 카드26행의 ↗ 는 이동할 것처럼 보이지만 카드는 동작하지 않는다. 장식 화살표를 제거하거나 실제 이동을 제공해야 한다.
- CSS60행의 작은 버튼 최소 높이는28px이고900px 이하 메뉴는35px다. 좁은 화면에서 누르기 쉬운 간격·영역을 실화면으로 확인한다. 이 보고서만으로 특정 접근성 표준 위반 판정을 내리지는 않는다.
- 창 너비1200px 아래 사용자 관리가 상하로 쌓이는 것은 코드로 확인했으나 실제 줄바꿈·키보드 포커스 시인성·스크롤 초점은 브라우저에서 재확인해야 한다.

## 문구 원칙별 판정

| 축 | 판정 | 근거 |
|---|---|---|
| 사용자가 하는 일 중심 | 조정 필요 | 첫 화면 장식 헤드라인·AI 전담자의 첫 진입 |
| 얻는 것으로 말하기·압박 없음 | 통과 | 확인하지 않은 손실·불안을 자극하는 문구 없음 |
| 확인 가능한 사실·감정 단정 없음 | 통과 | 감정 단정 문구 없음 |
| 문장·조건 나누기 | 조정 필요 | 순위 조건·월별 설정·마감 안내 |
| 반복 제거 | 조정 필요 | 장식 영문과 한국어 제목 중복 |
| 오류 원인 + 다음 행동 | 조정 필요 |409 공통 처리·마감 월 설정·입력 보관 없이 새로고침 권고 |
| 버튼 결과 명확성 | 대체로 통과·일부 조정 | 고정 업무 완료 CTA는 보존, 엑셀 명사형 라벨·첫 진입은 보완 |
| 어투·숫자 표기 일관성 | 대체로 통과 | 합니다체 중심, 일부 UI 명칭·단위 간격은 정리 가능 |
| 한국어 화면 언어 일관성 | 조정 필요 | 영문 장식 정보와한국어 제목이 함께 표시됨 |

## 화면 문구 전수 목록

AST로 JSX 본문, 제목·설명·라벨·placeholder·접근성 라벨 속성, 한국어 상태/확인/오류/성공 문자열, 동적 문구를 수집했다. 사용자 이름·문헌번호·CPC 등 실제 데이터 값과 CSS 클래스/내부 action id는 제외했다. 동일 컴포넌트의 동일 문구는 중복 위치를 합쳤다. 행 번호는 점검 시 파일 기준이다. 아래 문자열의 추출은 검토 보조용이며 전부 수정하라는 뜻이 아니다.

수집 항목: 462개(컴포넌트·종류별 중복 제거).

| 화면 | 위치 | 종류 | 원문 |
|---|---|---|---|
| 공통 역할·단위 | app/evaluation/workspace.tsx:20 · 공통 | 동적 문구 | \`${value.slice(0, 4)}년 ${Number(value.slice(5))}월\` |
| 공통 역할·단위 | app/evaluation/workspace.tsx:21 · 공통 | 상태·조건 문구 | 관리자 |
| 공통 역할·단위 | app/evaluation/workspace.tsx:21 · 공통 | 상태·조건 문구 | 심사관 |
| 공통 역할·단위 | app/evaluation/workspace.tsx:21 · 공통 | 상태·조건 문구 | AI 담당자 |
| 공통 상태 | app/evaluation/workspace.tsx:25 · Status | 상태·조건 문구 | 입력 완료 |
| 공통 상태 | app/evaluation/workspace.tsx:25 · Status | 상태·조건 문구 | 대기 중 |
| 공통 통계 카드 | app/evaluation/workspace.tsx:26 · Stat | 상태·조건 문구 | 건 |
| 출원 전문 안내 | app/evaluation/workspace.tsx:28 · CaseResource | 본문 | 검색을 시작하기 전, 출원 전문부터 준비하세요. |
| 출원 전문 안내 | app/evaluation/workspace.tsx:28 · CaseResource | 상태·조건 문구 | 가상 검증 자료의 출원번호입니다. 실제 PDF는 별도 원문 검색에서 확인하세요. |
| 출원 전문 안내 | app/evaluation/workspace.tsx:28 · CaseResource | 상태·조건 문구 | 공개공보 PDF를 내려받아 외부 AI 도구의 검색 자료로 사용할 수 있습니다. |
| 출원 전문 안내 | app/evaluation/workspace.tsx:28 · CaseResource | 속성 label | ↓ 공개 전문 PDF |
| 출원 전문 안내 | app/evaluation/workspace.tsx:28 · CaseResource | 속성 label | ↓ 등록 전문 PDF |
| 출원 전문 안내 | app/evaluation/workspace.tsx:28 · CaseResource | 본문 | 사건 상세 ↗ |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:50,54 · EvaluationWorkspace | 상태·조건 문구 | 업무 자료를 불러오지 못했습니다. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:63 · EvaluationWorkspace | 상태·조건 문구 | 저장하지 않은 내용이 있습니다. 이동하시겠습니까? |
| navigate | app/evaluation/workspace.tsx:68 · navigate | 상태·조건 문구 | 저장하지 않은 내용이 있습니다. 이동하시겠습니까? |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:69 · EvaluationWorkspace | 상태·조건 문구 | 저장했습니다. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:72 · EvaluationWorkspace | 상태·조건 문구 | POST |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:74 · EvaluationWorkspace | 동적 문구 | \`${payload.error \|\| '저장하지 못했습니다.'}${response.status === 409 ? ' 입력 내용은 유지됩니다. 최신 자료를 확인한 뒤 다시 저장해 주세요.' : ''}\` |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:74 · EvaluationWorkspace | 상태·조건 문구 | 저장하지 못했습니다. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:74 · EvaluationWorkspace | 상태·조건 문구 | 입력 내용은 유지됩니다. 최신 자료를 확인한 뒤 다시 저장해 주세요. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:76 · EvaluationWorkspace | 상태·조건 문구 | 저장하지 못했습니다. 입력 내용은 유지됩니다. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:81 · EvaluationWorkspace | 상태·조건 문구 | 통계·현황 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:81 · EvaluationWorkspace | 상태·조건 문구 | 운영 관리 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:81 · EvaluationWorkspace | 상태·조건 문구 | AI 검색 결과 입력 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:81 · EvaluationWorkspace | 상태·조건 문구 | 내 심사 업무 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:84 · EvaluationWorkspace | 본문 | S |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:84,90 · EvaluationWorkspace | 본문 | 선행기술 AI 검색 포털 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:84 · EvaluationWorkspace | 본문 | PRIOR ART REVIEW WORKSPACE |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:85 · EvaluationWorkspace | 본문 | WORKSPACE |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:85 · EvaluationWorkspace | 속성 aria-label | 주요 메뉴 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:86 · EvaluationWorkspace | 본문 | 통계·현황 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:86 · EvaluationWorkspace | 본문 | 운영 관리 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:86 · EvaluationWorkspace | 본문 | 내 심사 업무 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:86 · EvaluationWorkspace | 본문 | AI 담당 업무 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:87 · EvaluationWorkspace | 본문 | 전문 PDF 모으기 ↗ |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:87 · EvaluationWorkspace | 본문 | 키프리스 원문 검색 ↗ |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:88 · EvaluationWorkspace | 본문 | KIPRIS Plus 연동 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:88 · EvaluationWorkspace | 본문 | 출원 원문에서 검색 결과 평가까지 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:88 · EvaluationWorkspace | 본문 | 한곳에서 이어지는 심사 업무 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:88 · EvaluationWorkspace | 상태·조건 문구 | 일반사용자 화면 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:88 · EvaluationWorkspace | 상태·조건 문구 | 관리자용 진입점 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:90 · EvaluationWorkspace | 상태·조건 문구 | 업무 시작 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:90 · EvaluationWorkspace | 본문 | 관리자용 화면 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:90 · EvaluationWorkspace | 본문 | 사용자 변경 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:90 · EvaluationWorkspace | 본문 | AI 검색 결과 평가 시스템 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:90 · EvaluationWorkspace | 속성 aria-label | 최신 자료 새로고침 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:90 · EvaluationWorkspace | 본문 | ↻ 새로고침 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 속성 title | 업무 자료를 불러오고 있습니다. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 속성 title | 자료에 연결할 수 없습니다. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 본문 | 다시 시도 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 본문 | AI SEARCH · HUMAN REVIEW |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 본문 | 검색의 시작부터 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 본문 | 평가의 마무리까지. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 본문 | 심사관이 선정한 출원의 전문을 준비하고, AI가 찾은 문헌을 함께 검토합니다. 본인을 선택해 월별 업무를 이어가세요. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 속성 title | 내 업무 시작하기 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 속성 description | 심사과와 이름을 확인해 본인을 선택하세요. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 본문 | 심사과 - 이름 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 본문 | 사용자를 선택하세요 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 상태·조건 문구 | 소속 미지정 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 본문 | 업무 시작 → |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 본문 | 등록된 사용자가 없습니다. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 본문 | 관리자 화면 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 본문 | 에서 사용자와 월별 배정을 먼저 설정하세요. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 속성 title | 이렇게 진행합니다 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 상태·조건 문구 | 평가 대상 출원 선정 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 상태·조건 문구 | 출원번호를 등록하고 해당 월의 대상을 확정합니다. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 상태·조건 문구 | 전문 준비 · AI 검색 결과 입력 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 상태·조건 문구 | 출원 PDF를 받아 검색하고 문헌번호만 등록합니다. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 상태·조건 문구 | 문헌 평가 · 조사 방식 비교 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 상태·조건 문구 | 점수와 인용여부, 조사 방식별 품질 순위를 기록합니다. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:92 · EvaluationWorkspace | 본문 | 사용자 선택은 업무 작성자를 정하는 간편 로그인입니다. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:93 · EvaluationWorkspace | 상태·조건 문구 | OPERATIONS & INSIGHTS |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:93 · EvaluationWorkspace | 상태·조건 문구 | AI SEARCH WORKSPACE |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:93 · EvaluationWorkspace | 상태·조건 문구 | MY REVIEW WORKSPACE |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:93 · EvaluationWorkspace | 상태·조건 문구 | 운영월별 입력과 평가 진행을 확인하고 같은 기준으로 취합합니다. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:93 · EvaluationWorkspace | 상태·조건 문구 | 참여자, 조사 방식과 월별 담당 업무를 설정합니다. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:93 · EvaluationWorkspace | 상태·조건 문구 | 담당 출원의 전문을 준비하고, 외부 AI 도구에서 찾은 문헌을 등록하세요. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:93 · EvaluationWorkspace | 상태·조건 문구 | 대상을 선정하고, 공개된 AI 검색 결과를 검토하세요. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:93 · EvaluationWorkspace | 속성 aria-label | 운영월 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:93 · EvaluationWorkspace | 상태·조건 문구 | 마감 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:93 · EvaluationWorkspace | 상태·조건 문구 | 운영 중 |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:94 · EvaluationWorkspace | 본문 | 가상 검증 자료입니다. 출원·문헌번호와 사용자, 평가 실적은 실제 자료가 아닙니다. |
| 공통·사용자 선택 | app/evaluation/workspace.tsx:95 · EvaluationWorkspace | 본문 | 이 운영월은 마감되었습니다. 자료 조회와 다운로드가 가능하며, 수정은 관리자 재개방 후 가능합니다. |
| 내 심사 업무 | app/evaluation/workspace.tsx:110 · ReviewWorkspace | 속성 title | 내 심사 업무 |
| 내 심사 업무 | app/evaluation/workspace.tsx:110 · ReviewWorkspace | 속성 title | 심사관 역할이 배정되지 않았습니다. |
| 내 심사 업무 | app/evaluation/workspace.tsx:110 · ReviewWorkspace | 본문 | 왼쪽의 AI 담당 업무에서 배정받은 검색 결과를 입력하세요. |
| 내 심사 업무 | app/evaluation/workspace.tsx:111 · ReviewWorkspace | 속성 title | 월별 참여 정보 |
| 내 심사 업무 | app/evaluation/workspace.tsx:111 · ReviewWorkspace | 속성 title | 이 운영월의 참여자로 배정되지 않았습니다. |
| 내 심사 업무 | app/evaluation/workspace.tsx:111 · ReviewWorkspace | 본문 | 관리자에게 운영월과 그룹 배정을 요청하세요. |
| 내 심사 업무 | app/evaluation/workspace.tsx:114 · ReviewWorkspace | 속성 label | 내 평가 대상 |
| 내 심사 업무 | app/evaluation/workspace.tsx:114 · ReviewWorkspace | 속성 note | 선정 확정한 출원 |
| 내 심사 업무 | app/evaluation/workspace.tsx:114 · ReviewWorkspace | 속성 label | AI 결과 입력 완료 |
| 내 심사 업무 | app/evaluation/workspace.tsx:114 · ReviewWorkspace | 속성 note | 비교 대상 AI 모두 입력 |
| 내 심사 업무 | app/evaluation/workspace.tsx:114 · ReviewWorkspace | 속성 label | 평가 완료 |
| 내 심사 업무 | app/evaluation/workspace.tsx:114 · ReviewWorkspace | 동적 문구 | \`완료율 ${percent(complete / cases.length)}\` |
| 내 심사 업무 | app/evaluation/workspace.tsx:114 · ReviewWorkspace | 상태·조건 문구 | 평가 대상이 없습니다. |
| 내 심사 업무 | app/evaluation/workspace.tsx:114 · ReviewWorkspace | 속성 label | 재확인 필요 |
| 내 심사 업무 | app/evaluation/workspace.tsx:114 · ReviewWorkspace | 속성 note | 평가 후 AI 결과가 바뀐 출원 |
| 내 심사 업무 | app/evaluation/workspace.tsx:115 · ReviewWorkspace | 동적 문구 | \`업무 자료를 저장했습니다. ${result}\` |
| 내 심사 업무 | app/evaluation/workspace.tsx:115 · ReviewWorkspace | 본문 | ↓ 내 업무 자료 엑셀 |
| 내 심사 업무 | app/evaluation/workspace.tsx:116 · ReviewWorkspace | 본문 | 내 평가 대상 건 |
| 내 심사 업무 | app/evaluation/workspace.tsx:116 · ReviewWorkspace | 상태·조건 문구 | 저장하지 않은 평가가 있습니다. 다른 출원으로 이동하시겠습니까? |
| 내 심사 업무 | app/evaluation/workspace.tsx:116 · ReviewWorkspace | 상태·조건 문구 | CPC 미입력 |
| 내 심사 업무 | app/evaluation/workspace.tsx:116 · ReviewWorkspace | 속성 title | AI 검색 결과 평가 |
| 내 심사 업무 | app/evaluation/workspace.tsx:116 · ReviewWorkspace | 속성 title | 선정 확정한 출원이 없습니다. |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 속성 title | 대상 건 선정 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 속성 description | 이번 달 평가할 출원을 등록하고 목록 전체를 확정하세요. |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 1단계 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 임시저장한 목록은 AI 담당자에게 공개되지 않습니다. 선정 확정 후에는 관리자만 등록·취소할 수 있습니다. |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 선정 기한: |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 출원번호 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 속성 placeholder | 10-2024-0000000 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | CPC |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 선택 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 속성 placeholder | G06N 20/00 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | + 추가 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 여러 출원 한 번에 붙여넣기 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 한 줄에 출원번호와 CPC를 입력하세요. |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 목록에 추가 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 선정 목록 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 상한 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 상태·조건 문구 | 제한 없음 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 상태·조건 문구 | 건 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 다른 심사관이 같은 달에 선정한 출원 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 건이 있습니다. 별도의 평가 업무로 유지됩니다. |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 동적 문구 | \`출원번호 ${index + 1}\` |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 삭제 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 등록된 출원이 없습니다. |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 상태·조건 문구 | 입력 중인 출원을 목록에 먼저 추가해 주세요. |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 상태·조건 문구 | 선정 목록을 임시저장했습니다. |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 임시저장 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 동적 문구 | \`${rows.length}건의 선정 목록 전체를 확정하시겠습니까? 확정 후 일반사용자는 목록을 수정할 수 없습니다.\` |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 상태·조건 문구 | 대상 건을 확정했습니다. AI 결과가 공개되면 평가할 수 있습니다. |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 본문 | 선정 확정 → |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 속성 title | 선정 후의 업무 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 상태·조건 문구 | 전문 PDF 준비 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 상태·조건 문구 | AI 담당자가 출원의 전문을 바로 내려받아 검색 자료를 준비합니다. |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 상태·조건 문구 | AI 검색 결과 입력 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 상태·조건 문구 | 외부 AI 도구에서 확보한 문헌번호를 조사 방식별로 등록합니다. |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 상태·조건 문구 | 내 평가 대상 건에서 평가 |
| 대상 건 선정 | app/evaluation/workspace.tsx:127 · SelectionEditor | 상태·조건 문구 | 공개된 문헌을 평가하고 조사 방식별 순위를 직접 정합니다. |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 상태·조건 문구 | CPC 미입력 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 평가 후 AI 검색 결과가 변경되었습니다. 바뀐 방식의 문헌 평가와 품질 순위를 다시 확인해 저장하세요. |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 속성 title | AI 문헌별 평가 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 속성 description | 미선택은 실제 0점·X와 다릅니다. 일부 항목만 입력한 상태도 저장할 수 있습니다. |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 조사 방식 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 문헌 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 점수 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 인용여부 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 비고 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 속성 title | 새 창에서 문헌 검색 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 동적 문구 | \`${method.name} ${document.number} 점수\` |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 미선택 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 점 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 동적 문구 | \`${method.name} ${document.number} 인용여부\` |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | O |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | X |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 동적 문구 | \`${method.name} ${document.number} 비고\` |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 속성 placeholder | 선택 입력 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 속성 title | 공개된 AI 검색 결과를 기다리고 있습니다. |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | AI 담당자가 입력 완료하면 여기에 문헌이 표시됩니다. |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 동적 문구 | \`${documents[method.id]?.length \|\| 0}문헌\` |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 상태·조건 문구 | 대기 중 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 속성 title | 조사 방식별 품질 순위 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 속성 description | 선행기술조사와 AI 결과 전체를 비교해 직접 순위를 매깁니다. 동순위 없이 1위부터 연속해서 선택하세요. |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 입력 상태 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 품질 순위 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 순위 비교 전용 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 상태·조건 문구 | 입력 완료 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 동적 문구 | \`${method.name} 품질 순위\` |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 상태·조건 문구 | 미선택 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 1위 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 2위 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 3위 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 순위 외 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 평가 제외 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 본문 | 비교 불가 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 동적 문구 | \`평가 기한 ${month.evaluationDeadline}\` |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 상태·조건 문구 | 평가 기한 제한 없음 |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 상태·조건 문구 | 문헌 평가와 품질 순위를 저장했습니다. |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 상태·조건 문구 | 저장 중… |
| AI 검색 결과 평가 | app/evaluation/workspace.tsx:138 · EvaluationEditor | 상태·조건 문구 | 평가 저장 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 속성 label | 배정받은 입력 업무 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 속성 note | 출원 × AI 조사 방식 기준 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 속성 label | 입력 완료 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 속성 note | 심사관에게 공개한 검색 결과 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 속성 label | 입력 대기 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 속성 note | 초안만 저장한 결과 포함 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 속성 label | 담당 조사 방식 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 속성 unit | 개 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 속성 aria-label | AI 업무 진행 상태 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 상태·조건 문구 | 저장하지 않은 검색 결과가 있습니다. 필터를 바꾸시겠습니까? |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 본문 | 전체 입력 업무 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 본문 | 입력 대기만 보기 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 본문 | 선정 확정된 담당 그룹 출원만 표시됩니다. |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 동적 문구 | \`담당 업무 자료를 저장했습니다. ${result}\` |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 본문 | ↓ 담당 업무 자료 엑셀 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 본문 | 담당 입력 업무 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 상태·조건 문구 | 저장하지 않은 검색 결과가 있습니다. 다른 업무로 이동하시겠습니까? |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 상태·조건 문구 | 입력 완료 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 상태·조건 문구 | 대기 중 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 속성 title | 표시할 업무가 없습니다. |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 속성 title | AI 검색 결과 입력 |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 속성 title | 이 운영월에 배정받은 업무가 없습니다. |
| AI 담당 업무 | app/evaluation/workspace.tsx:149 · AIWorkspace | 본문 | 담당 그룹·조사 방식의 배정과 대상 건 확정 여부를 확인하세요. |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 상태·조건 문구 | CPC 미입력 |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 속성 title | AI 검색 결과 입력 |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 동적 문구 | \`${method?.name}에서 확보한 선행기술 문헌번호를 한 줄에 하나씩 입력하세요.\` |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 본문 | / 7문헌 |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 본문 | 외부 AI 도구에서 검색을 수행한 뒤 문헌번호만 등록합니다. 제목·유형·파일 첨부는 필요하지 않습니다. |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 본문 | 선행기술 문헌번호 |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 본문 | 출원 1건 × AI 방식 1개당 최대 7문헌입니다. |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 동적 문구 | \`입력 기한 ${month.resultDeadline}\` |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 상태·조건 문구 | 입력 기한 제한 없음 |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 상태·조건 문구 | 검색 결과 초안을 임시저장했습니다. 심사관에게는 아직 공개되지 않습니다. |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 본문 | 임시저장 |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 상태·조건 문구 | AI 검색 결과 입력을 완료했습니다. 담당 심사관에게 공개되었습니다. |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 본문 | AI 검색 결과 입력 완료 |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 속성 title | 심사관에게 공개된 결과 |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 동적 문구 | \`실제 등록자 ${result.publishedBy.name} · ${result.publishedAt ? new Date(result.publishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : ''}\` |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 상태·조건 문구 | 입력 완료한 결과만 심사관에게 공개됩니다. |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 본문 | 순서 |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 본문 | 문헌번호 |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 본문 | 원문 확인 |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 본문 | 문헌 검색 ↗ |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 본문 | 수정 초안은 다시 입력 완료하기 전까지 기존 공개 결과를 바꾸지 않습니다. |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 본문 | 검색 문헌 PDF 모으기 ↗ |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 속성 title | 아직 공개한 결과가 없습니다. |
| AI 검색 결과 입력 | app/evaluation/workspace.tsx:157 · AIResultEditor | 본문 | 한 문헌 이상 입력한 뒤 ‘AI 검색 결과 입력 완료’를 누르세요. |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:162 · exportPersonal | 동적 문구 | \`선행기술 AI 검색 포털_업무자료_${monthId}.xlsx\` |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:163 · exportPersonal | 상태·조건 문구 | 출원별 현황 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:163,164,165,166 · exportPersonal | 상태·조건 문구 | 출원번호 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:163 · exportPersonal | 상태·조건 문구 | CPC |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:163 · exportPersonal | 상태·조건 문구 | 담당 심사관 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:163 · exportPersonal | 상태·조건 문구 | 그룹 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:163 · exportPersonal | 상태·조건 문구 | AI 입력 상태 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:163,166 · exportPersonal | 상태·조건 문구 | 평가 상태 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:163 · exportPersonal | 상태·조건 문구 | 입력 완료 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:163 · exportPersonal | 상태·조건 문구 | 대기 중 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:164 · exportPersonal | 상태·조건 문구 | 선행기술 목록 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:164,165,166 · exportPersonal | 상태·조건 문구 | 조사 방식 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:164,166 · exportPersonal | 상태·조건 문구 | 문헌번호 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:164 · exportPersonal | 상태·조건 문구 | AI 담당자 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:165 · exportPersonal | 상태·조건 문구 | 품질 순위 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:165 · exportPersonal | 상태·조건 문구 | 순위 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:165 · exportPersonal | 상태·조건 문구 | 유효 여부 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:165 · exportPersonal | 상태·조건 문구 | 현재 결과 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:165 · exportPersonal | 상태·조건 문구 | 재확인 필요 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:165 · exportPersonal | 상태·조건 문구 | 미평가 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:166 · exportPersonal | 상태·조건 문구 | 문헌별 평가 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:166 · exportPersonal | 상태·조건 문구 | 점수 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:166 · exportPersonal | 상태·조건 문구 | 인용여부 |
| 개인 엑셀 머리글 | app/evaluation/workspace.tsx:166 · exportPersonal | 상태·조건 문구 | 비고 |
| 순위 표시 | app/evaluation/workspace.tsx:169 · rankLabel | 동적 문구 | \`${value}위\` |
| 순위 표시 | app/evaluation/workspace.tsx:169 · rankLabel | 상태·조건 문구 | 순위 외 |
| 순위 표시 | app/evaluation/workspace.tsx:169 · rankLabel | 상태·조건 문구 | 평가 제외 |
| 순위 표시 | app/evaluation/workspace.tsx:169 · rankLabel | 상태·조건 문구 | 비교 불가 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:175 · AdminStats | 상태·조건 문구 | 전체 그룹 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:175 · AdminStats | 상태·조건 문구 | 전체 심사관 |
| exportStats | app/evaluation/workspace.tsx:176 · exportStats | 동적 문구 | \`선행기술 AI 검색 포털_관리자통계_${month.id}.xlsx\` |
| exportStats | app/evaluation/workspace.tsx:177 · exportStats | 상태·조건 문구 | 그룹별 통계 |
| exportStats | app/evaluation/workspace.tsx:177,179,182 · exportStats | 상태·조건 문구 | 그룹 |
| exportStats | app/evaluation/workspace.tsx:177 · exportStats | 상태·조건 문구 | 참여자 |
| exportStats | app/evaluation/workspace.tsx:177 · exportStats | 상태·조건 문구 | 확정 출원 |
| exportStats | app/evaluation/workspace.tsx:177 · exportStats | 상태·조건 문구 | AI 입력 완료 |
| exportStats | app/evaluation/workspace.tsx:177,178 · exportStats | 상태·조건 문구 | 평가 완료 |
| exportStats | app/evaluation/workspace.tsx:177,180 · exportStats | 상태·조건 문구 | 문헌 수 |
| exportStats | app/evaluation/workspace.tsx:177 · exportStats | 상태·조건 문구 | 평가 완료율 |
| exportStats | app/evaluation/workspace.tsx:178 · exportStats | 상태·조건 문구 | 계정별 현황 |
| exportStats | app/evaluation/workspace.tsx:178 · exportStats | 상태·조건 문구 | 심사과 |
| exportStats | app/evaluation/workspace.tsx:178 · exportStats | 상태·조건 문구 | 이름 |
| exportStats | app/evaluation/workspace.tsx:178 · exportStats | 상태·조건 문구 | 개인 출원 |
| exportStats | app/evaluation/workspace.tsx:178 · exportStats | 상태·조건 문구 | AI 담당 대상 |
| exportStats | app/evaluation/workspace.tsx:178 · exportStats | 상태·조건 문구 | AI 담당 입력 완료 |
| exportStats | app/evaluation/workspace.tsx:179 · exportStats | 상태·조건 문구 | 출원별 현황 |
| exportStats | app/evaluation/workspace.tsx:179,181 · exportStats | 상태·조건 문구 | 출원번호 |
| exportStats | app/evaluation/workspace.tsx:179 · exportStats | 상태·조건 문구 | CPC |
| exportStats | app/evaluation/workspace.tsx:179,181,182 · exportStats | 상태·조건 문구 | 담당 심사관 |
| exportStats | app/evaluation/workspace.tsx:179 · exportStats | 상태·조건 문구 | AI 입력 상태 |
| exportStats | app/evaluation/workspace.tsx:179,181 · exportStats | 상태·조건 문구 | 평가 상태 |
| exportStats | app/evaluation/workspace.tsx:179,180 · exportStats | 상태·조건 문구 | 입력 완료 |
| exportStats | app/evaluation/workspace.tsx:179 · exportStats | 상태·조건 문구 | 대기 중 |
| exportStats | app/evaluation/workspace.tsx:180 · exportStats | 상태·조건 문구 | 조사 방식별 통계 |
| exportStats | app/evaluation/workspace.tsx:180,181 · exportStats | 상태·조건 문구 | 조사 방식 |
| exportStats | app/evaluation/workspace.tsx:180 · exportStats | 상태·조건 문구 | 입력 대상 |
| exportStats | app/evaluation/workspace.tsx:180 · exportStats | 상태·조건 문구 | 입력 대기 |
| exportStats | app/evaluation/workspace.tsx:180 · exportStats | 상태·조건 문구 | 평균 점수 |
| exportStats | app/evaluation/workspace.tsx:180 · exportStats | 상태·조건 문구 | 인용률 |
| exportStats | app/evaluation/workspace.tsx:180 · exportStats | 상태·조건 문구 | 1위 횟수 |
| exportStats | app/evaluation/workspace.tsx:181 · exportStats | 상태·조건 문구 | AI 검색 결과 평가 |
| exportStats | app/evaluation/workspace.tsx:181 · exportStats | 상태·조건 문구 | AI 담당자 |
| exportStats | app/evaluation/workspace.tsx:181 · exportStats | 상태·조건 문구 | AI 검색 결과 |
| exportStats | app/evaluation/workspace.tsx:181 · exportStats | 상태·조건 문구 | 인용여부 |
| exportStats | app/evaluation/workspace.tsx:181 · exportStats | 상태·조건 문구 | 점수 |
| exportStats | app/evaluation/workspace.tsx:182 · exportStats | 상태·조건 문구 | 조회 기준 |
| exportStats | app/evaluation/workspace.tsx:182 · exportStats | 상태·조건 문구 | 항목 |
| exportStats | app/evaluation/workspace.tsx:182 · exportStats | 상태·조건 문구 | 값 |
| exportStats | app/evaluation/workspace.tsx:182 · exportStats | 상태·조건 문구 | 운영월 |
| exportStats | app/evaluation/workspace.tsx:182 · exportStats | 상태·조건 문구 | 집계 기준 |
| exportStats | app/evaluation/workspace.tsx:182 · exportStats | 상태·조건 문구 | 선정 확정·공개된 최신 AI 결과의 유효 평가. 초안·취소 출원 제외. |
| exportStats | app/evaluation/workspace.tsx:182 · exportStats | 상태·조건 문구 | 가상 자료 여부 |
| exportStats | app/evaluation/workspace.tsx:182 · exportStats | 상태·조건 문구 | 가상 검증 자료 |
| exportStats | app/evaluation/workspace.tsx:182 · exportStats | 상태·조건 문구 | 운영 자료 |
| exportStats | app/evaluation/workspace.tsx:183 · exportStats | 동적 문구 | \`현재 조회 기준으로 통계 파일을 저장했습니다. ${result}\` |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 속성 aria-label | 그룹 필터 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 전체 그룹 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 속성 aria-label | 담당 심사관 필터 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 전체 심사관 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 계정은 담당 심사관 기준 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | ↓ 현재 범위 엑셀 저장 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 상태·조건 문구 | 이 운영월을 다시 여시겠습니까? |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 상태·조건 문구 | 이 운영월의 입력과 평가를 마감하시겠습니까? |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 상태·조건 문구 | 운영월을 재개방했습니다. |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 상태·조건 문구 | 운영월을 마감했습니다. |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 상태·조건 문구 | 운영 재개방 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 상태·조건 문구 | 월 운영 마감 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 속성 label | 참여 심사관 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 속성 unit | 명 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 동적 문구 | \`미선정 ${summary.unselected}명\` |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 속성 label | 확정 출원 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 동적 문구 | \`AI 입력 대기 ${summary.inputPending}건\` |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 속성 label | AI 입력 완료 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 동적 문구 | \`입력 완료율 ${percent(summary.inputRate)}\` |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 속성 label | 평가 완료 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 동적 문구 | \`평가 완료율 ${percent(summary.evaluationRate)}\` |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 속성 title | 그룹별 진행 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 속성 description | 선정 확정한 출원 기준 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 그룹 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 출원 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 입력 완료 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 평가 완료 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 완료율 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 속성 title | 등록된 그룹이 없습니다. |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 속성 title | 조사 방식별 비교 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 속성 description | 미선택은 평균·인용률 집계에서 제외합니다. |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 조사 방식 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 문헌 수 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 평균 점수 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 인용률 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 1위 횟수 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 동적 문구 | \`${row.averageScore.toFixed(2)}점\` |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 업무 상세 현황 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 미평가 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | · 평가 중 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | · 재확인 필요 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 문헌 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 상태·조건 문구 | 출원별 현황 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 상태·조건 문구 | 계정별 현황 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 상태·조건 문구 | AI 검색 결과 평가 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 출원번호 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | CPC |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 담당 심사관 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | AI 입력 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 평가 상태 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 상태·조건 문구 | 입력 완료 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 상태·조건 문구 | 대기 중 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 동적 문구 | \`${row.applicationNumber} 출원을 취소하시겠습니까? 집계에서 제외됩니다.\` |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 상태·조건 문구 | 출원을 취소했습니다. |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 취소 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 심사과 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 이름 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 개인 출원 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | AI 담당 대상 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | AI 입력 완료 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | AI 담당자 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | AI 검색 결과 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 인용여부 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 점수 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 상태·조건 문구 | 평가 완료 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 상태·조건 문구 | 재확인 필요 |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 속성 title | 현재 조회 범위에 확정 출원이 없습니다. |
| 관리자 통계·현황 | app/evaluation/workspace.tsx:184 · AdminStats | 본문 | 선정 초안과 취소 출원은 통계에 포함하지 않습니다. |
| 운영 관리 | app/evaluation/workspace.tsx:190 · AdminSettings | 상태·조건 문구 | 저장하지 않은 설정이 있습니다. 다른 설정으로 이동하시겠습니까? |
| 운영 관리 | app/evaluation/workspace.tsx:191 · AdminSettings | 상태·조건 문구 | 월별 운영·배정 |
| 운영 관리 | app/evaluation/workspace.tsx:191 · AdminSettings | 상태·조건 문구 | 사용자 관리 |
| 운영 관리 | app/evaluation/workspace.tsx:191 · AdminSettings | 상태·조건 문구 | 그룹·조사 방식 |
| 운영 관리 | app/evaluation/workspace.tsx:191 · AdminSettings | 상태·조건 문구 | 출원 운영 |
| 운영 관리 | app/evaluation/workspace.tsx:191 · AdminSettings | 본문 | 새 운영월 |
| 운영 관리 | app/evaluation/workspace.tsx:191 · AdminSettings | 상태·조건 문구 | 새 운영월을 추가했습니다. |
| 운영 관리 | app/evaluation/workspace.tsx:191 · AdminSettings | 본문 | + 운영월 추가 |
| 운영 관리 | app/evaluation/workspace.tsx:191 · AdminSettings | 본문 | 검증용 시나리오 체험 |
| 운영 관리 | app/evaluation/workspace.tsx:191 · AdminSettings | 본문 | 운영 자료가 없는 초기 상태에서만 10명·2그룹·20출원·280문헌의 가상 자료를 불러올 수 있습니다. |
| 운영 관리 | app/evaluation/workspace.tsx:191 · AdminSettings | 상태·조건 문구 | 가상 검증 자료를 불러오시겠습니까? 실제 출원이나 실적이 아닌 검증용 예시가 저장됩니다. |
| 운영 관리 | app/evaluation/workspace.tsx:191 · AdminSettings | 상태·조건 문구 | 가상 검증 자료를 불러왔습니다. |
| 운영 관리 | app/evaluation/workspace.tsx:191 · AdminSettings | 본문 | 가상 검증 자료 불러오기 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 속성 title | 월별 운영 설정 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 속성 description | 기한을 비워두면 제한 없음, 건수 상한 0은 제한 없음으로 처리합니다. |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 본문 | 대상 건 선정 기한 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 본문 | AI 결과 입력 기한 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 본문 | 평가 기한 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 본문 | 심사관별 출원 건수 상한 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 본문 | 비교 조사 방식 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 본문 | 순위 전용 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 속성 title | 참여 심사관 · 그룹 배정 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 속성 description | 한 운영월에 심사관 한 명은 하나의 그룹에 참여합니다. |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 본문 | 심사과 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 본문 | 이름 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 본문 | 참여 그룹 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 본문 | 비활성 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 동적 문구 | \`${user.name} 참여 그룹\` |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 본문 | 참여하지 않음 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 속성 title | 사용자를 먼저 등록하세요. |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 속성 title | 그룹별 AI 담당자 배정 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 속성 description | 운영월 × 그룹 × AI 방식마다 한 명을 배정합니다. 한 사람이 여러 업무를 맡을 수 있습니다. |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 본문 | 그룹 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 동적 문구 | \`${group.name} ${method.name} 담당자\` |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 본문 | 배정하지 않음 |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 속성 title | 그룹을 먼저 등록하세요. |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 상태·조건 문구 | 월별 운영과 담당 배정을 저장했습니다. |
| 월별 운영·배정 | app/evaluation/workspace.tsx:199 · MonthSettings | 본문 | 월별 운영·배정 저장 |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 속성 title | 기존 사용자 관리 |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 속성 description | 사용자를 선택하면 오른쪽에 정보를 불러옵니다. |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 본문 | 명 |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 본문 | 심사과 |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 본문 | 이름 |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 본문 | 역할 |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 본문 | 상태 |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 상태·조건 문구 | 저장하지 않은 사용자 정보가 있습니다. 선택한 사용자를 불러오시겠습니까? |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 상태·조건 문구 | 활성 |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 상태·조건 문구 | 비활성 |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 속성 title | 등록된 사용자가 없습니다. |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 상태·조건 문구 | 신규 사용자 등록 |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 상태·조건 문구 | 사용자 정보 수정 |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 상태·조건 문구 | 입력 중인 내용을 지우고 신규 사용자 등록을 시작하시겠습니까? |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 본문 | + 신규 사용자 |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 본문 | 심사국 |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 본문 | 활성 사용자 |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 본문 | 비활성화해도 과거 업무와 실제 결과 등록자 기록은 유지됩니다. |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 상태·조건 문구 | 사용자를 등록했습니다. |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 상태·조건 문구 | 사용자 정보를 저장했습니다. |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 상태·조건 문구 | 사용자 등록 |
| 사용자 관리 | app/evaluation/workspace.tsx:206 · UserSettings | 상태·조건 문구 | 사용자 정보 저장 |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 속성 title | 그룹 관리 |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 속성 description | 그룹을 선택해 수정하거나 새 그룹을 등록합니다. |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 본문 | 기존 그룹 |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 상태·조건 문구 | 저장하지 않은 설정이 있습니다. 선택한 그룹을 불러오시겠습니까? |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 본문 | + 새 그룹 |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 본문 | 그룹 이름 |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 상태·조건 문구 | 그룹을 저장했습니다. |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 본문 | 그룹 저장 |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 속성 title | 조사 방식 관리 |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 속성 description | AI 방식은 자유롭게 추가하고 월별 비교 참여를 정합니다. |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 본문 | 기존 조사 방식 |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 상태·조건 문구 | 저장하지 않은 설정이 있습니다. 선택한 조사 방식을 불러오시겠습니까? |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 본문 | + 새 조사 방식 |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 본문 | 조사 방식 이름 |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 본문 | 업무 유형 |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 본문 | AI 조사 방식 |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 본문 | 순위 비교 전용 |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 본문 | 활성 조사 방식 |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 상태·조건 문구 | 조사 방식을 저장했습니다. |
| 그룹·조사 방식 | app/evaluation/workspace.tsx:213 · GroupSettings | 본문 | 조사 방식 저장 |
| 출원 운영 | app/evaluation/workspace.tsx:218 · CaseSettings | 속성 title | 운영상 출원 추가 |
| 출원 운영 | app/evaluation/workspace.tsx:218 · CaseSettings | 속성 description | 선정 확정 후 필요한 출원을 관리자가 추가할 수 있습니다. 취소는 통계·현황의 출원별 목록에서 처리합니다. |
| 출원 운영 | app/evaluation/workspace.tsx:218 · CaseSettings | 본문 | 담당 심사관 |
| 출원 운영 | app/evaluation/workspace.tsx:218 · CaseSettings | 본문 | 담당 심사관 선택 |
| 출원 운영 | app/evaluation/workspace.tsx:218 · CaseSettings | 본문 | 출원번호 |
| 출원 운영 | app/evaluation/workspace.tsx:218 · CaseSettings | 속성 placeholder | 10-2024-0000000 |
| 출원 운영 | app/evaluation/workspace.tsx:218 · CaseSettings | 본문 | CPC · 선택 |
| 출원 운영 | app/evaluation/workspace.tsx:218 · CaseSettings | 상태·조건 문구 | 출원을 추가했습니다. |
| 출원 운영 | app/evaluation/workspace.tsx:218 · CaseSettings | 본문 | 출원 등록 |
