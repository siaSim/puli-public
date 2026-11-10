## 해결하는 문제

어떤 상황에서 무엇이 달라지는지 적어 주세요. 관련 이슈가 있으면 연결합니다.

## 변경 내용

-

## 확인한 내용

실행한 검사와 결과를 적어 주세요. 로컬 예시, 통제된 GitHub 응답, 운영 환경에서 확인한 결과를 구분하고, 확인하지 못한 범위도 남깁니다.

해당하지 않는 검사는 이유를 적고 제외할 수 있습니다.

- [ ] `npm run check`
- [ ] `npm test` 또는 같은 테스트의 순차 실행
- [ ] `git diff --check`
- UI 변경 시: 두 운영 방식을 PC와 모바일에서 확인한 결과 또는 이미지
- 문서 전용 변경 시: 링크, 명령어와 예제 설정 확인 결과

### PR 댓글 검사 (필요한 경우)

해당하는 검사를 고르고, 실행했다면 Actions 결과 링크를 남겨 주세요. 쓰기 권한이 있는 사람이 PR의 **Conversation** 탭에 명령 하나만 단독 댓글로 남기면 실행됩니다. 포크에서 기여한다면 필요한 검사를 적어 관리자에게 요청할 수 있습니다.

- [ ] `/smoke` — 문제 등록, 사진 제출, 팀원 승인 흐름을 바꿨을 때. **Summary**에서 실패 단계를, **Artifacts → smoke-failure**에서 저장된 화면과 로그를 봅니다.
- [ ] `/ocr-check` — 사진 인식이나 정답 판정을 바꿨을 때. **Summary**에서 판정을 비교하고 **Artifacts → ocr-comparison**의 `report.html`에서 바뀐 사진을 봅니다.
- [ ] `/migration-check` — DB 구조나 데이터를 바꾸는 새 SQL을 추가했을 때. **Summary**에서 기존 기록의 전후를 보고 **Artifacts → migration-comparison**의 `comparison.json`에서 전체 내역을 확인합니다.
- [ ] `/preview` — 화면 배치나 모바일 보기를 바꿨을 때. **Artifacts → preview-comparison**의 `report.html`에서 PC와 모바일의 `main`, PR, 변경 영역을 비교합니다.

[Actions의 PR comment checks](https://github.com/siaSim/puli-public/actions/workflows/pr-smoke.yml)에서 해당 PR 번호와 명령이 붙은 실행을 열 수 있습니다.

## 데이터와 설정 영향

마이그레이션, 권한, 설치 설정, 의존성 변경 여부와 기존 기록 보존 방법을 적어 주세요. 비밀키, DB 백업, 개인 코드, 실제 팀원 사진과 초대 링크 원문은 첨부하지 않습니다.
