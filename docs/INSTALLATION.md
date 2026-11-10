# 로컬 설치

이 안내는 원격 서비스에 연결하지 않는 개발 환경을 만듭니다. Node.js 22.13 이상, npm, Git이 필요합니다. Windows에서는 아래 셸 명령에 Git Bash 또는 WSL을 사용할 수 있습니다.

## 1. 코드와 의존성

이 저장소를 복제하거나 내려받은 뒤 프로젝트 루트에서 실행합니다.

```sh
npm ci
cp wrangler.example.jsonc wrangler.local.json
```

`npm ci`는 잠금 파일의 버전을 사용합니다. Wrangler는 프로젝트 의존성으로 설치되므로 전역 설치는 필요하지 않습니다.

`wrangler.local.json`은 Git에서 제외됩니다. 로컬 명령마다 이 파일을 지정하면 원격 배포 설정과 분리해서 개발할 수 있습니다. 기본 `wrangler.jsonc`도 예제이며 운영자 ID 자리표시자로는 원격 setup·deploy가 중단됩니다. 예제 DB ID가 모두 0인 것은 로컬 실행용 자리표시자입니다.

## 2. 로컬 키

프로젝트 루트에서 다음 명령을 한 번 실행합니다. 무작위 32바이트 키를 `.dev.vars`에 기록하며 키를 터미널에 출력하지 않습니다. 이미 파일이 있으면 덮어쓰지 않고 종료합니다.

```sh
node --input-type=module - <<'JS'
import {randomBytes} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
const template = readFileSync('.env.example', 'utf8');
writeFileSync('.dev.vars', template.replace(
  'REPLACE_WITH_RANDOM_32_BYTE_BASE64', randomBytes(32).toString('base64')
), {flag: 'wx', mode: 0o600});
JS
```

| 항목 | 설정 위치 | 로컬 값 |
| --- | --- | --- |
| `ENCRYPTION_KEY` | `.dev.vars` | 위 명령이 생성한 base64 키 |
| `APP_ORIGIN` | `.dev.vars` | `http://127.0.0.1:4173` |
| `DB` | `wrangler.local.json` | 로컬 D1 바인딩 |
| `OWNER_GITHUB_ID` | `wrangler.local.json`의 `vars` | 실제 앱 등록까지 할 때 본인 GitHub 숫자 ID로 교체 |

주소·포트를 바꿨다면 `APP_ORIGIN`도 동일하게 맞춥니다. `localhost`와 `127.0.0.1`은 서로 다른 출처입니다. `.dev.vars`는 설정 파일과 같은 디렉터리에서 읽습니다. [Cloudflare 로컬 환경변수 안내](https://developers.cloudflare.com/workers/local-development/environment-variables/)

## 3. DB 준비와 실행

```sh
npm run db:local -- --config wrangler.local.json
npm run dev -- --config wrangler.local.json
```

[http://127.0.0.1:4173](http://127.0.0.1:4173)을 엽니다. 마이그레이션은 로컬 `.wrangler/`의 DB에 적용되며, 예전 스터디의 회차나 팀원은 가져오지 않습니다. 첫 화면에 GitHub App 등록 안내가 나오는 것이 정상입니다. `/api/health`는 `{"ok":true}`를 반환합니다.

`predev`가 OCR 엔진·한국어/영어 모델과 라이선스 고지를 `public/vendor/ocr/`에 준비합니다. 이 생성 폴더는 커밋하지 않습니다. 개발 서버는 `Ctrl+C`로 종료합니다.

### 실제 로그인·자동 인증을 확인하려면

로컬 DB 생성만으로 GitHub 계정과 스터디가 로그인된 상태가 되지는 않습니다. 독립된 HTTPS 개발 인스턴스와 별도의 GitHub App을 [배포 안내](DEPLOYMENT.md)에 따라 준비합니다. GitHub가 push를 보내는 webhook에는 외부에서 접속할 수 있는 주소가 필요합니다.

개발 인스턴스에는 새 암호화 키와 빈 DB를 사용합니다. 테스트는 자체 임시 DB와 통제된 GitHub 응답을 사용합니다.

## 4. 검사

```sh
npm run check
npm test
```

메모리·프로세스 제한이 있는 환경에서는 같은 테스트를 순차 실행할 수 있습니다.

```sh
node --test --test-concurrency=1 tests/*.test.js
```

[검증 방법](VERIFICATION.md)에서 자동 검사 범위와 실제 연동을 확인하는 절차를 볼 수 있습니다.

## 자주 막히는 부분

| 증상 | 확인할 것 |
| --- | --- |
| 서버 초기 설정 안내/503 | 로컬 마이그레이션과 `.dev.vars` 키, 실행한 config 경로 |
| 동일 사이트 요청 오류/403 | 주소·포트와 `APP_ORIGIN` 일치 여부 |
| `EEXIST`로 키 생성 실패 | 이미 있는 `.dev.vars`를 유지하고 사용 중인 키 확인 |
| OCR 파일을 찾지 못함 | `npm ci` 후 `npm run build:ocr`; 공개 파일은 `public/vendor/ocr/` |
| Wrangler/Node 실행 실패 | Node 22.13 이상 여부와 `npm ci`의 정상 완료 |
| 로그인 승인 후 되돌아오지 않음 | 개발 인스턴스 주소·GitHub App callback 일치 여부 |

[README로 돌아가기](../README.md) · [기여 가이드](../CONTRIBUTING.md)
