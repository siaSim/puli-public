# 풀이 · PULI

GitHub 풀이 기록과 인증 사진으로 함께 공부하는 코딩테스트 스터디 서비스입니다. 한 계정으로 여러 스터디를 만들고, 각 스터디가 공통 문제형 또는 자율 목표형으로 운영할 수 있습니다.

## 스터디 방식

| 방식 | 등록하는 내용 | 메인 화면 | 인증 기준 |
| --- | --- | --- | --- |
| 공통 문제형 | 같은 기간에 풀 문제 1~30개, 플랫폼 구성, 시작일·마감 | 문제 목록과 팀원별 인증 표 | 출제 목록과 일치하는 새 풀이 |
| 자율 목표형 | 기간당 개인 목표 1~30문제, 인정 플랫폼, 시작일·마감 | 팀원별 진행률과 인증한 문제 | 기간 내 서로 다른 문제의 정상 인증 수 |

요일을 정하거나 기간마다 마감일을 직접 지정할 수 있습니다. 시각은 한국 시간 기준이며, 각 회차는 등록 당시의 규칙을 보관합니다. 기본 규칙을 바꿔도 이미 등록된 회차는 유지됩니다. 회차·목표 기간은 운영자가 등록하며 자동으로 생성되지는 않습니다.

## 주요 기능

- GitHub 로그인, 내 스터디 생성·전환, 7일간 유효한 초대 링크로 참여
- 스터디별 역할·정원·데이터 분리, 정원 1~20명·계정당 최대 5개 운영
- LeetHub v2·백준허브가 올린 소스 변경과 README의 정확한 문제 링크 대조
- GitHub push 수신과 정기 재확인, 공개·비공개 풀이 저장소 연결
- 브라우저에서 실행하는 무료 OCR, 애매한 사진의 팀원 승인·반려
- 팀원별 일별 잔디, 미인증/목표 현황 복사, 지난 문제 목록 보관
- 인증한 작성자가 선택한 코드·풀이 메모를 해당 스터디에 공유

로그인은 GitHub 계정으로 합니다. 사진으로만 인증할 팀원은 풀이 저장소를 연결할 필요가 없습니다.

GitHub 인증은 커밋 기록을, OCR은 사진의 문제·통과 문구를 근거로 합니다. 실제 플랫폼 판정, 본인 풀이 여부나 사진 조작을 독립적으로 증명하지는 않습니다. 확인 대기 사진은 인증 수에 포함하지 않고, 자율 목표형의 지각 인증은 목표 수에서 제외합니다. 상세 기준은 [운영 안내](docs/OPERATIONS.md)를 확인하세요.

## 시작하기

Node.js **22.13 이상**과 npm이 필요합니다. 이 저장소를 복제하거나 내려받은 뒤 프로젝트 루트에서 실행하세요.

```sh
npm ci
cp wrangler.example.jsonc wrangler.local.json
```

이어서 [로컬 설치 안내](docs/INSTALLATION.md)에 따라 로컬 키와 D1을 준비합니다. 직접 운영하려면 [설치·배포 안내](docs/DEPLOYMENT.md)에 따라 본인의 Cloudflare Worker, D1과 GitHub App을 만드세요. 새 설치에는 스터디원, 회차, 인증 기록이 들어 있지 않습니다.

## 문서

| 문서 | 내용 |
| --- | --- |
| [로컬 설치](docs/INSTALLATION.md) | 개발 환경, 로컬 DB·키, 검사 명령, 로그인 검증 범위 |
| [설치·배포](docs/DEPLOYMENT.md) | 새 인스턴스, GitHub App, 무료 운영, 기존 서비스 업데이트·백업 |
| [기여 가이드](CONTRIBUTING.md) | 이슈·브랜치·PR, 검증과 데이터 보존 원칙 |
| [여러 스터디 운영](docs/MULTI-STUDY.md) | 참여·운영 규칙·권한·데이터 분리 |
| [운영·인증 기준](docs/OPERATIONS.md) | GitHub/OCR 인증, 보관, 공유와 제약 |
| [검증 방법](docs/VERIFICATION.md) | 자동 검사, 새 설치 확인, 실제 GitHub 연동 확인 |

## 코드 구조

| 경로 | 역할 |
| --- | --- |
| `public/` | 화면, 운영 규칙, 일별 잔디, OCR 및 풀이 공유 |
| `server/index.js`, `server/session.js` | Worker 요청 처리, GitHub App·로그인·세션 |
| `server/studies.js`, `server/invites.js` | 스터디·멤버십·운영 규칙·초대 |
| `server/rounds.js`, `server/free-problems.js` | 공통 회차·자율 기간과 문제 |
| `server/github.js`, `server/sync.js` | 저장소 조회와 인증 처리 |
| `server/photos.js`, `server/solutions.js` | 사진·팀원 검토·코드 및 메모 공유 |
| `migrations/` | 순서대로 적용하는 D1 마이그레이션 |
| `scripts/` | OCR 자산 준비, Cloudflare 설정·배포 |
| `tests/` | 격리된 Worker·D1과 통제된 GitHub 응답으로 검증 |

실제 배포 진입점은 `server/index.js`, 정적 자산은 `public/`입니다. GitHub API 토큰·앱 비밀키는 서버에서 처리하며, OCR 엔진·모델은 `npm run build:ocr`로 준비합니다. `npm run dev`와 `npm run deploy`는 이 작업을 먼저 실행합니다.

## 라이선스

풀이의 코드와 문서는 [MIT 라이선스](LICENSE)로 제공됩니다. 외부 의존성에는 각 패키지의 라이선스가 적용됩니다. OCR 엔진과 언어 모델을 빌드하면 `public/vendor/ocr/NOTICE.txt`에 관련 라이선스 고지가 생성됩니다.
