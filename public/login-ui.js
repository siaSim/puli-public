import {escapeHTML as h} from './core.js';

export function loginHeading(title, description) {
  return `<div class="login-heading">
    <h1 id="login-title">${h(title)}</h1>
    ${description ? `<p>${h(description)}</p>` : ''}
  </div>`;
}

export function loginLayout(content, {aside = '', label = '코딩테스트 스터디', invite = false} = {}) {
  const intro = aside ? `<aside class="login-intro">${aside}</aside>` : '';
  const panel = `<section class="login-panel" aria-labelledby="login-title">${content}</section>`;
  return `<div class="login-page">
    <header class="login-header">
      <a class="brand" href="/#home" aria-label="푸리 홈">
        <span class="brand-mark"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 6-6 6 6 6m6-12 6 6-6 6"/></svg></span>
        <span class="brand-name">푸리</span>
      </a>
      <span class="login-access">${h(label)}</span>
    </header>
    <main id="main-content" class="login-content${aside ? ' login-split' : ''}${invite ? ' login-invitation' : ''}" aria-labelledby="login-title" tabindex="-1">
      ${invite ? intro + panel : panel + intro}
    </main>
    <footer class="login-footer">코딩테스트 스터디 푸리</footer>
  </div>`;
}

export function loginDocument(title, content, options) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${h(title)} | 푸리</title><link rel="stylesheet" href="/styles.css">
    </head><body><a class="skip-link" href="#main-content">본문으로 이동</a>
    ${loginLayout(content, options)}</body></html>`;
}

export function githubLoginForm({icon, next, invite}) {
  const label = invite ? 'GitHub로 참여하기' : 'GitHub로 계속하기';
  const hidden = invite
    ? `<input type="hidden" name="invite" value="${h(invite)}">`
    : `<input type="hidden" name="next" value="${h(next)}">`;
  return `<form id="login-form" method="${invite ? 'post' : 'get'}" action="/auth/github" target="_top">
    ${hidden}
    <button class="login-submit" type="submit">${icon('github')}<span data-login-label>${label}</span></button>
    <label class="login-option">
      <input type="checkbox" name="remember" value="1" checked aria-describedby="login-device-note">
      <span>로그인 상태 유지</span><small>최대 30일</small>
    </label>
    <p class="login-device-note" id="login-device-note">공용 기기에서는 체크를 해제해 주세요.</p>
    <p class="sr-only" data-login-progress role="status"></p>
  </form>`;
}
