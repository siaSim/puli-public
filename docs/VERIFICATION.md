# 검증 방법

별도의 로컬 DB 또는 개발 인스턴스에서 확인합니다. 팀원, 문제와 인증 기록은 재현에 필요한 예시만 새로 만듭니다.

## 자동 검사

프로젝트 루트에서 실행합니다.

```sh
npm ci
npm run check
npm test
npm run build:ocr
```

테스트는 임시 D1과 모의 GitHub 응답으로 스터디 간 접근 제한, 초대와 정원, 회차와 마감, GitHub 문제 대조, OCR 판정과 팀원 검토, 풀이 공유, 기존 DB 구조의 이전을 확인합니다. 프로세스가 제한된 환경에서는 `node --test --test-concurrency=1 tests/*.test.js`로 순차 실행합니다. OCR 빌드 후에는 `public/vendor/ocr/NOTICE.txt`에서 라이선스 고지를 확인할 수 있습니다.

## 새 설치 확인

1. [로컬 설치](INSTALLATION.md)에 따라 빈 D1에 마이그레이션을 적용하고 서버를 실행합니다.
2. `/api/health`가 `{"ok":true}`를 반환하고, 앱이 등록되지 않은 환경의 첫 화면에 초기 설정 안내가 표시되는지 확인합니다.
3. 로그인하지 않은 브라우저가 인증이 필요한 데이터에 접근할 수 없는지 확인합니다.

## GitHub와 인증 흐름 확인

실제 로그인과 webhook을 확인하려면 [별도 HTTPS 개발 인스턴스](DEPLOYMENT.md)에 GitHub App을 등록합니다. 새 스터디와 테스트용 풀이 저장소로 다음을 확인합니다.

- GitHub 로그인과 초대 참여, 로그인 유지, 다른 스터디 데이터 접근 거부
- 공통 회차에 등록된 문제의 새 풀이만 인증되고, 자율 목표형에서는 기간 내 서로 다른 풀이만 목표에 반영되는지
- 저장소를 연결하지 않은 팀원이 사진을 제출하고, 통과 문구나 문제 식별이 불확실한 사진은 팀원 확인으로 넘어가는지
- 다른 팀원은 작성자가 공유에 동의한 코드와 메모만 볼 수 있는지

자동 검사에서는 실제 GitHub 승인, 외부 webhook 수신, 브라우저 기기별 OCR 품질을 확인하지 않습니다. 해당 흐름을 바꾼 PR에는 직접 확인한 환경과 결과를 적어 주세요.

## PR에서 브라우저 스모크 테스트 실행

저장소에 쓰기 권한이 있는 사람이 PR의 **Conversation** 탭에 `/smoke`를 한 줄로 남기면 [PR 댓글 검사 워크플로](https://github.com/siaSim/puli-public/actions/workflows/pr-smoke.yml)가 해당 PR의 커밋을 검사합니다.

가상 운영자가 문제를 등록하고 사진을 제출하면, 가상 팀원이 사진을 열어 승인합니다. 실제 브라우저 화면과 임시 D1을 사용하고, 사진은 팀원 확인이 필요하도록 OCR 응답을 모의합니다.

워크플로의 **Summary**에서 통과한 단계와 실패한 단계를 볼 수 있습니다. 실패한 시점에 브라우저가 열려 있었다면 **Artifacts → smoke-failure**에 당시 스크린샷과 로그가 저장됩니다.

로컬에서 같은 흐름을 확인하려면 프로젝트 루트에서 실행합니다.

```sh
npm ci
npx playwright install chromium
npm run test:smoke
```

로컬 실행 결과는 `qa/smoke/`에 저장합니다.

## PR에서 OCR 판정 비교

저장소에 쓰기 권한이 있는 사람이 PR에 `/ocr-check`를 한 줄로 남기면, 같은 예시 캡처를 실행 시점의 `main`과 PR 코드에서 각각 인식하고 판정합니다. 예시에는 LeetCode의 밝은 화면과 다크모드 통과, 다른 문제 통과, 오답, 프로그래머스 다크모드 통과가 포함됩니다. 사진은 개인정보 없이 만든 예시이며 두 버전은 `main`에 고정된 OCR 엔진과 언어 모델을 공유합니다.

Actions의 **Summary**에 기준 커밋, 사진별 판정, 판정이 달라진 사진 수가 나옵니다. **Artifacts → ocr-comparison**을 내려받아 압축을 풀고 `report.html`을 열면 바뀐 사진이 위에 표시됩니다. 각 사진에서 인식한 글자와 판정 근거도 비교할 수 있습니다. PR 판정이 예시의 기대값과 다르면 해당 실행을 실패로 표시합니다.

로컬에서는 기준 버전의 프로젝트 루트에서 OCR 자산을 준비하고 비교할 PR 소스 경로를 넘깁니다.

```sh
npm ci
npx playwright install chromium
npm run build:ocr
npm run test:ocr -- /path/to/pr-source
```

로컬 실행 결과는 `qa/ocr-check/`에 저장합니다.

## PR에서 DB 마이그레이션 검증

저장소에 쓰기 권한이 있는 사람이 PR에 `/migration-check`를 한 줄로 남기면, 실행 시점의 `main` 스키마로 임시 D1을 만들고 가상 회차, 멤버, 인증과 사진 검토 기록을 넣습니다. 이어서 PR에 새로 추가된 마이그레이션을 적용하고 이전 기록과 비교합니다.

Actions의 **Summary**에서 적용한 SQL, 테이블별 행 수, 변경된 필드의 전후 값을 확인할 수 있습니다. 전체 내역과 외래 키 위반 정보는 **Artifacts → migration-comparison**의 `comparison.json`에 저장합니다.

기존 기록이나 열이 바뀌거나 사라진 경우, 외래 키 위반, 실행 오류, 이미 적용된 마이그레이션의 수정은 실패로 표시합니다. 기존 기록을 보존한 상태에서 추가된 행과 열은 별도로 표시합니다.

로컬에서 실행하려면 기준 버전의 프로젝트 루트에서 아래 명령을 사용하세요. 결과는 `qa/migration-check/`에 저장합니다.

```sh
npm ci
npm run test:migration -- /path/to/pr-source
```

## PR에서 PC와 모바일 화면 비교

저장소에 쓰기 권한이 있는 사람이 PR에 `/preview`를 단독 댓글로 남기면, 실행 시점의 `main`과 PR에 같은 가상 스터디를 만들고 화면을 캡처합니다. 문제와 인증 현황, 문제 등록, 사진 인증 화면을 PC(1280×900)와 모바일(390×844)로 비교합니다.

Actions의 **Summary**에 화면별 변경 픽셀 비율이 표시됩니다. **Artifacts → preview-comparison**을 내려받아 압축을 풀고 `report.html`을 열면 `main`, PR, 변경 비교가 나란히 보입니다. 변경 비교에서 분홍색은 달라진 부분입니다. 화면 차이는 검토용으로 기록하며 캡처 오류가 생기면 실패한 기기와 화면을 표시합니다.

로컬에서는 기준 버전의 프로젝트 루트에서 실행합니다. 결과는 `qa/preview/`에 저장합니다.

```sh
npm ci
npx playwright install chromium
npm run test:preview -- /path/to/pr-source
```
