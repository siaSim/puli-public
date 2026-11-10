# 설치 및 배포

Cloudflare Workers + D1에 독립된 인스턴스를 배포합니다. 새 설치와 기존 서비스 업데이트는 아래 절차를 구분해서 진행합니다. 문서 예제에는 운영 데이터가 포함되지 않습니다.

## 새 인스턴스 준비

### 1. 별도 작업 폴더와 설정

이 저장소를 복제하거나 내려받은 뒤 프로젝트 루트에서 실행합니다. 이미 운영 중인 인스턴스가 있다면 아래 [기존 서비스 업데이트](#기존-서비스-업데이트)를 따릅니다.

```sh
npm ci
cp wrangler.example.jsonc wrangler.production.json
```

`wrangler.production.json`은 Git에서 제외되는 설치별 설정입니다. 기존 설치의 파일이 있다면 덮어쓰지 않습니다. 이 파일을 열어 다음 값을 본인 환경에 맞춥니다.

| 항목 | 새 설치 값 |
| --- | --- |
| `name` | 본인의 Worker 이름. 예: `puli-my-study` |
| `vars.OWNER_GITHUB_ID` | 앱을 등록할 개인 GitHub 계정의 숫자 ID |
| `d1_databases[0].database_name` | 새 DB 이름. 예: `puli-my-study-db` |
| `d1_databases[0].database_id` | 최초에는 예제의 0 UUID 유지. `setup`이 실제 ID 기록 |
| `d1_databases[0].binding` | `DB` 유지 |

GitHub CLI를 사용한다면 `gh api user --jq .id`로 현재 계정의 숫자 ID를 확인할 수 있습니다. 아이디 문자열이나 GitHub App ID와 다릅니다. 최초 앱 등록 시 실제 앱 소유자 ID가 이 설정과 일치해야 합니다.

`setup`과 `deploy` 스크립트는 `PULI_CONFIG`로 지정한 설정을 일관되게 사용합니다. 생략하면 일반화된 `wrangler.jsonc`를 읽으며 운영자 ID가 자리표시자일 때 원격 작업 전에 중단합니다. 직접 Wrangler 명령을 실행할 때는 `--config wrangler.production.json`을 지정합니다. 설치별 설정은 커밋하지 않습니다.

### 2. Cloudflare 로그인과 서버 준비와 배포

```sh
npx wrangler login
npx wrangler whoami
PULI_CONFIG=wrangler.production.json npm run setup
PULI_CONFIG=wrangler.production.json npm run deploy
```

배포 전에 `whoami`의 계정과 설정한 Worker와 DB 이름을 확인합니다. `setup`은 선택한 설정 파일에 생성된 DB ID를 기록합니다. 선택 계정에서 **이름이 같은 D1을 재사용하거나 생성**한 뒤 마이그레이션을 적용합니다. Worker의 `ENCRYPTION_KEY` Secret이 없을 때만 무작위 키를 만듭니다. 기존 DB가 의도치 않게 재사용되지 않도록 새 설치는 별도 이름을 사용합니다.

`deploy`는 OCR 자산을 준비하고 원격 마이그레이션 적용 후 Worker를 배포합니다. `.deployment/state.json`에는 배포 결과를 저장하며 이 파일은 Git에서 제외됩니다.

운영 키는 Cloudflare Secret에 보관합니다. 로컬 `.dev.vars`의 키가 자동으로 운영 키가 되지는 않습니다. 이미 데이터가 있는 서비스의 `ENCRYPTION_KEY`를 교체하면 저장된 앱 정보와 토큰을 복호화할 수 없으므로 키를 유지합니다. [Cloudflare Secrets 안내](https://developers.cloudflare.com/workers/configuration/secrets/)

배포 주소는 `https://<worker>.<subdomain>.workers.dev` 형태입니다. `APP_ORIGIN`을 생략하면 요청 주소를 사용합니다. 명시하려면 배포 config의 `vars`에 **경로 없는 실제 HTTPS origin**을 넣습니다. 로컬 주소를 운영 `APP_ORIGIN`으로 사용하지 않습니다.

### 3. GitHub App 등록

1. 새 배포 주소를 열고 **GitHub 앱 등록하기**를 누릅니다.
2. `OWNER_GITHUB_ID`로 설정한 개인 GitHub 계정에서 앱을 생성합니다.
3. 앱 정보는 서버가 매니페스트 교환으로 받아 암호화 저장합니다. PEM, client secret, webhook secret을 저장소나 채팅에 붙여 넣지 않습니다.
4. 사이트로 돌아와 **GitHub로 로그인**합니다. 새 DB의 기본 스터디를 운영하거나 **내 스터디**에서 별도 스터디를 만듭니다.

등록 안내는 개인 이름을 사용하지 않습니다. 앱 소유자 검사는 설정한 **숫자 ID**로 수행하며 현재 자동 등록 절차는 개인 GitHub 계정을 기준으로 합니다.

주소가 바뀌었을 때 확인할 GitHub App 설정은 다음과 같습니다.

| 용도 | 경로 |
| --- | --- |
| 매니페스트 등록 복귀 | `/setup/callback` |
| 사용자 로그인 callback | `/auth/github/callback` |
| 앱 설치 후 복귀 | `/#connect` |
| push webhook | `/api/github/webhook` |

자동 생성 매니페스트는 `Contents: read`, `push` 이벤트를 요청합니다. 여러 사용자가 각자 설치하도록 GitHub App 자체는 다른 계정의 설치를 허용합니다. **GitHub App의 설치 공개 범위와 코드 저장소의 공개 여부는 별도 설정입니다.** [GitHub 매니페스트 안내](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest), [앱 공개 범위](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/making-a-github-app-public-or-private)

### 4. 저장소 연결과 스터디 시작

1. 앱 설치 시 **Only select repositories**로 개인 풀이 저장소만 선택합니다.
2. 사이트의 **저장소 및 멤버**에서 저장소 목록을 새로 고치고 플랫폼별 저장소를 저장합니다. 기본 브랜치를 사용합니다.
3. 운영자가 스터디 규칙과 정원을 확인하고 초대 링크를 공유합니다. 팀원은 GitHub로 참여합니다. 사진으로만 인증하는 팀원은 저장소 연결을 건너뛸 수 있습니다.
4. 공통 문제 회차 또는 자율 목표 기간을 등록합니다. 기간 내 적격 소스 변경과 README 문제 URL이 일치해야 GitHub 인증됩니다.

앱을 설치하는 것과 사이트의 플랫폼별 저장소 연결 저장은 별도 단계입니다. 본인 GitHub 작성자를 확인할 수 없는 커밋, README가 없는 저장소 등은 사진 인증을 사용합니다.

## 무료 운영 범위

Workers Free와 D1 Free 범위에서 운영할 수 있도록 구성했습니다. 별도 유료 OCR API, R2와 유료 도메인을 필수로 사용하지 않으며, 설정 스크립트가 요금제를 변경하지 않습니다. 무료 한도 안에서 사용할 수 있다는 의미이며 규모와 무관하게 비용이 항상 0원이라는 보장은 아닙니다. 기존 유료 계정에는 해당 계정 요금제가 적용됩니다.

실제 사용량은 Cloudflare 대시보드에서 확인합니다. 최신 한도는 [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/)과 [D1 요금](https://developers.cloudflare.com/d1/platform/pricing/)을 기준으로 합니다. 연결 저장소가 늘면 정기 재확인의 전체 순환 시간이 길어집니다.

## 기존 서비스 업데이트

업데이트할 인스턴스의 Worker, DB와 `OWNER_GITHUB_ID`가 들어 있는 `wrangler.production.json`과 기존 Secret을 사용합니다. 로컬 설정 파일이 없다면 안전하게 보관한 인스턴스 설정으로 복원합니다.

1. 원격 주소, Worker, D1와 GitHub App을 확인하고 운영 DB를 저장소 바깥에 백업합니다.
2. 변경 내용을 검토하고 로컬 검사와 테스트를 실행합니다. 적용된 마이그레이션은 수정하지 않습니다.
3. 기존 config와 Secret을 유지한 채 `npm ci`, `PULI_CONFIG=wrangler.production.json npm run deploy`를 실행합니다. 마이그레이션이 있으면 배포 스크립트가 먼저 적용합니다.
4. 아래 확인 절차로 코드 배포와 데이터 보존을 각각 확인합니다.

### 백업 예제

```sh
mkdir -p ../puli-private-backups
chmod 700 ../puli-private-backups
npx wrangler d1 export DB --config wrangler.production.json --remote --output ../puli-private-backups/before-update.sql
chmod 600 ../puli-private-backups/before-update.sql
```

백업마다 다른 파일명을 사용합니다. 백업에는 회원 정보, 비공개 코드, 사진, 암호화된 앱과 세션 정보가 포함될 수 있으므로 이슈, PR 또는 저장소에 올리지 않습니다. Secret은 DB 내보내기에 포함되지 않으며 별도 안전한 복구 수단이 필요합니다. [D1 내보내기 명령](https://developers.cloudflare.com/d1/wrangler-commands/#d1-export)

### 배포 후 확인

- `/api/health` 정상 응답과 미로그인 `/api/state`의 401 응답
- GitHub 로그인, 새로고침 후 세션 유지, 스터디 전환과 다른 스터디에 대한 접근 거부
- 기존 회차 수, 문제, 마감과 규칙, 멤버십, 저장소 연결, 인증, 사진과 공유 내용 보존
- 새 인스턴스에서만 별도 테스트 회차와 커밋으로 자동 인증 확인

`/api/health`만으로 로그인, DB와 GitHub 인증까지 정상이라고 판단하지 않습니다. 회차를 주간 자동 생성하는 기능은 없으며 운영자가 공개합니다.

### 복구

Worker 버전 복구와 DB 복구는 별개입니다. 새 스키마와 맞지 않는 예전 Worker로 단순히 되돌리지 않습니다. 배포 후 새로 생긴 기록도 보존하고, 백업을 별도 DB에 복원해 행, 사진 바이트, 외래키를 검증한 뒤 전환 절차를 정합니다. 이 문서의 명령은 운영 DB 삭제, 덮어쓰기와 키 재발급을 수행하지 않습니다. 다중 스터디 이전의 주의점은 [데이터 이전 안내](MULTI-STUDY.md#이전과-복구)를 확인하세요.

[README로 돌아가기](../README.md), [로컬 설치](INSTALLATION.md)
