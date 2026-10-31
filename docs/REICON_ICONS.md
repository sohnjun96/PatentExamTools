# Reicon 아이콘

공식 [Reicon 아이콘 목록](https://reicon.dev/icons/)의 Outline SVG를 사용합니다.
문자 기호 아이콘과 기존 홈 이동 SVG를 공통 `AppIcon`으로 교체했습니다.
서비스 이름의 AI, 계정 이니셜, 단계 번호와 PDF·ZIP 형식 표시는 그대로 유지합니다.

- 원본: https://github.com/dqev/reicon/blob/a4b274828f1e6e09b137b7b613c77c5ccfa6206e/data/icon-data.json
- 고정 원본 커밋: `a4b274828f1e6e09b137b7b613c77c5ccfa6206e`
- 라이선스: MIT, `public/licenses/reicon-MIT.txt`에 원문 포함
- 사용 위치: 심사국 선택, 공지사항, 관리자·심사관·AI 담당자 메뉴, 평가 목록, 사건 검토, 문헌 링크, PDF 오류 알림

필요한 SVG 도형만 JSX로 포함하므로 아이콘을 표시할 때 외부 CDN 요청이나 별도 패키지가 필요하지 않습니다.
크기는 기본 20px, 메뉴·공지사항 24px, 빈 목록 28px입니다.
색은 `currentColor`를 따르며 아이콘은 모두 장식 요소로 처리합니다.
버튼·링크의 텍스트와 기존 접근성 이름을 유지합니다.

| AppIcon 이름 | 원본 카테고리 |
| --- | --- |
| chart-square | business |
| users | users |
| cpu | devices |
| calendar | time |
| document-text | newicons |
| notification | notifications |
| clipboard-list | notes |
| search | search |
| arrow-right-up | arrows |
| arrow-right | arrows |
| arrow-left | arrows |
| document-download | newicons |
| x | ui |
| info-circle | ui |
| book-open | school |
| clock-circle | time |
| hierarchy | newicons |
| folder | folders |
