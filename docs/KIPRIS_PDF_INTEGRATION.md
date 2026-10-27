# KIPRIS Plus 전문 PDF 연동

확인일: 2026-10-27

전문 XML과 공개·등록공고 PDF는 서로 다른 API로 조회한다. 기존 `patentFullTextFileInfo` XML 연동은 유지하며, `/api/patent/document`가 PDF 조회·전송을 담당한다.

## 공식 API 계약

| 기능 | 오퍼레이션 | 경로·인증 | 입력 |
|---|---|---|---|
| 공개전문 PDF | `getPubFullTextInfoSearch` | `/kipo-api/kipi/patUtiModInfoSearchSevice/`, `ServiceKey` | `applicationNumber` |
| 등록공고 전문 PDF | `getAnnFullTextInfoSearch` | `/kipo-api/kipi/patUtiModInfoSearchSevice/`, `ServiceKey` | `applicationNumber` |
| 공개번호 → 출원번호 | `openNumberSearchInfo` | `/openapi/rest/patUtiModInfoSearchSevice/`, `accessKey` | `openNumber`, `docsStart=1` |
| 등록번호 → 출원번호 | `registrationNumberSearchInfo` | `/openapi/rest/patUtiModInfoSearchSevice/`, `accessKey` | `registerNumber`, `docsStart=1` |

PDF 메타데이터는 `response/body/item/docName`, `path`를 반환한다. 번호 검색은 `PatentUtilityInfo` 안에 `ApplicationNumber`, `OpeningNumber`, `RegistrationNumber`를 반환하므로 대소문자를 구분한다. 검색 응답에서 요청한 문헌번호와 정확하게 일치하는 출원이 하나일 때만 PDF를 가져온다.

공식 오퍼레이션 문서의 입력·출력 예시를 직접 확인했다.

- [공개전문 PDF](https://plus.kipris.or.kr/portal/data/service/DBII_000000000000001/ADI_0000000000002299/ajaxOperation.do?menuNo=200100&entYn=N&scode=SC002)
- [등록공고 전문 PDF](https://plus.kipris.or.kr/portal/data/service/DBII_000000000000001/ADI_0000000000002945/ajaxOperation.do?menuNo=200100&entYn=N&scode=SC002)
- [공개번호 검색](https://plus.kipris.or.kr/portal/data/service/DBII_000000000000001/ADI_0000000000015105/ajaxOperation.do?menuNo=200100&entYn=N&scode=SC002)
- [등록번호 검색](https://plus.kipris.or.kr/portal/data/service/DBII_000000000000001/ADI_0000000000015107/ajaxOperation.do?menuNo=200100&entYn=N&scode=SC002)

공식 사이트는 위 문서를 `POST`로 불러온다. 일반 브라우저의 주소 열기만으로는 표시되지 않을 수 있다.

`KIPRIS_API_KEY`가 REST 키를 공급한다. `KIPRIS_SERVICE_KEY`가 설정되어 있으면 PDF 게이트웨이 호출에는 그 키를 사용하며, 없으면 `KIPRIS_API_KEY`를 사용한다. 키는 서버에서만 사용한다.

## 사이트 API

```text
GET /api/patent/document?applicationNumber=1020200093844&kind=publication&download=1
GET /api/patent/document?documentNumber=KR1020220014141A1&numberType=publication&kind=publication&download=1
GET /api/patent/document?documentNumber=10-2345678&numberType=registration&kind=registration&download=1
```

- `numberType`: `application` 출원번호, `publication` 공개번호, `registration` 등록번호. 공개번호와 출원번호는 형태만으로 구별할 수 없으므로 문헌번호 조회에는 유형을 명시한다.
- `kind`: `publication` 공개전문, `registration` 등록공고 전문.
- `download=1`: 첨부 다운로드. 생략하면 인라인 PDF 응답.
- `metadata=1`: 안전한 사이트 내 다운로드 URL, 출원번호, 파일명만 반환. KIPRIS 원격 URL은 반환하지 않는다.
- 파일이 없으면 404, 입력 오류는 400, API 키 미설정은 503, 원격 오류·PDF 검증 실패는 502.

원격 파일은 정확한 KIPRIS 호스트와 허용 파일 전송 경로만 사용한다. 리디렉션을 따라가지 않으며 PDF의 `%PDF-` 서명을 확인하고 청크 전송을 포함하여 32 MiB를 초과하면 중단한다. Cloudflare Workers에서 지원하는 `redirect: 'manual'`을 사용한다.

## 검증

```text
node --test --experimental-strip-types scripts/test-patent-document.ts
```

모의 응답 테스트 10건으로 번호 정규화·명시적 유형, 공식 요청 파라미터·응답 필드, 허용 URL, PDF 서명, 파일 미제공, 출원번호 불일치, 크기 제한과 키 비노출을 확인했다.

실제 로컬 서버에서도 다음을 확인했다.

- 출원 `10-2020-0093844`의 공개전문 PDF: HTTP 200, `application/pdf`, `%PDF-`, 1,277,965바이트.
- 공개번호 `KR1020220014141A1`: 위 출원번호로 정확히 변환, HTTP 200.
- 같은 출원의 등록공고 전문: HTTP 404 및 미제공 안내.

해외 문헌 PDF는 이 국내 특허·실용신안 API의 제공 범위에 포함하지 않는다. 문헌번호 자체는 AI 검색 결과로 보관할 수 있으며 해외 원문은 해당 원문 제공처에서 확인한다.
