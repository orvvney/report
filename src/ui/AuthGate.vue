<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import App from './App.vue';
import LoginGuide from './LoginGuide.vue';
import milonLogo from '../../images/logo_milon.png';
import './login.css';

// Запись в Authenticator называется так же, как issuer на сервере.
const ISSUER = 'Milon Report';
const stage = ref('checking');
const session = ref(null);
const email = ref('');
const needsCode = ref(false);
const enrollment = ref(null);
const error = ref('');
const loadingText = ref('');
const code = ref('');
const copied = ref(false);
const guideOpen = ref(false);
const googleButton = ref(null);
const codeField = ref(null);
let expiryTimer, deadline = 0;

async function request(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body.error?.message || `HTTP ${response.status}`), { status: response.status });
  }
  return body;
}

const post = (url, payload) => request(url, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) });

// Отсчёт идёт от присланного сервером остатка и монотонных часов страницы.
function scheduleExpiry(expiresIn) {
  clearTimeout(expiryTimer);
  const remaining = Number(expiresIn);
  if (!Number.isFinite(remaining)) return;
  deadline = performance.now() + Math.max(0, remaining);
  expiryTimer = setTimeout(showLogin, Math.max(0, remaining));
}

async function loadGoogleScript() {
  if (window.google?.accounts?.id) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client?hl=hy';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Google Sign-In-ը չհաջողվեց բեռնել'));
    document.head.appendChild(script);
  });
}

async function showLogin() {
  clearTimeout(expiryTimer);
  session.value = null;
  stage.value = 'login';
  email.value = ''; needsCode.value = false; enrollment.value = null; code.value = '';
  error.value = ''; guideOpen.value = false;
  await nextTick();
  try {
    const config = await request('/api/auth/config');
    await loadGoogleScript();
    window.google.accounts.id.initialize({ client_id: config.googleClientId, callback: verifyGoogle });
    window.google.accounts.id.renderButton(googleButton.value,
      { theme: 'outline', size: 'large', width: Math.min(350, Math.max(220, window.innerWidth - 96)), locale: 'hy' });
  } catch (failure) { error.value = failure.message; }
}

async function verifyGoogle({ credential }) {
  loadingText.value = 'Google հաշիվը ստուգվում է…';
  error.value = '';
  try {
    const result = await post('/api/auth/google', { credential });
    email.value = result.email;
    needsCode.value = true;
    if (result.requiresEnrollment) enrollment.value = await post('/api/auth/enroll');
    await new Promise((resolve) => setTimeout(resolve));
    codeField.value?.focus();
  } catch (failure) { error.value = failure.message; }
  finally { loadingText.value = ''; }
}

async function submitCode() {
  loadingText.value = 'Authenticator կոդը ստուգվում է…';
  error.value = '';
  try {
    await post('/api/auth/login', { code: code.value });
    window.location.reload();
  } catch (failure) {
    error.value = failure.message;
    code.value = '';
    codeField.value?.focus();
  } finally { loadingText.value = ''; }
}

async function copyManualKey() {
  try {
    await navigator.clipboard.writeText(enrollment.value.manualKey);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1600);
  } catch { /* Без доступа к буферу ключ остаётся видимым для ручного ввода. */ }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.reload();
}

// 404 на /api/auth/me означает, что авторизация не настроена: локальный запуск
// и тесты открывают отчёт сразу.
async function initialize() {
  try {
    const me = await request('/api/auth/me');
    session.value = me;
    scheduleExpiry(me.expiresIn);
    stage.value = 'ready';
  } catch (failure) {
    if (failure.status === 404) stage.value = 'open';
    else if (failure.status === 401) await showLogin();
    else { error.value = failure.message; await showLogin(); }
  }
}

function recheck() {
  if (!document.hidden && session.value && deadline && performance.now() >= deadline) showLogin();
}

onMounted(() => {
  document.addEventListener('visibilitychange', recheck);
  initialize();
});
onBeforeUnmount(() => { clearTimeout(expiryTimer); document.removeEventListener('visibilitychange', recheck); });
</script>

<template>
  <App v-if="stage === 'ready' || stage === 'open'" :account="session?.username || ''" @logout="logout" @expired="showLogin" />
  <div v-else class="auth-root">
    <div v-if="stage === 'checking'" id="boot" class="boot-screen">
      <div class="boot-mark" aria-hidden="true"><span></span></div>
      <p>Պատրաստում ենք տվյալները</p>
      <small>Մի պահ խնդրում ենք</small>
    </div>
    <div v-else id="login" class="login-overlay">
      <section class="login-visual" aria-hidden="true"></section>
      <section class="login-card" aria-labelledby="login-title">
        <div class="login-brand">
          <span class="brand-logo" aria-hidden="true"><img :src="milonLogo" alt=""></span>
          <div><strong>Milon Mining</strong><small>Հաշվետվությունների համակարգ</small></div>
        </div>
        <h2 id="login-title">Բարի գալուստ</h2>
        <p id="login-help">{{ needsCode ? `${email} · մուտքագրեք Authenticator կոդը։` : 'Շարունակելու համար մուտք գործեք Google հաշվով։' }}</p>
        <div id="google-button" ref="googleButton" :hidden="needsCode"></div>
        <div id="totp-step" :hidden="!needsCode">
          <div id="enrollment" :hidden="!enrollment">
            <div class="enrollment-head">
              <p>Սկանավորեք QR կոդը Google Authenticator-ով։</p>
              <button id="open-login-guide" class="login-guide-button" type="button" aria-haspopup="dialog" @click="guideOpen = true">Ինչպե՞ս սկանավորել</button>
            </div>
            <img id="qr" :src="enrollment?.qrCode" alt="Authenticator QR">
            <div class="manual-setup">
              <span>Կամ ընտրեք «Enter a setup key» և մուտքագրեք այս բանալին․</span>
              <div>
                <code id="manual-key">{{ enrollment?.manualKey }}</code>
                <button id="copy-manual-key" type="button" @click="copyManualKey">{{ copied ? 'Պատճենված է' : 'Պատճենել' }}</button>
              </div>
              <small>Բանալու տեսակը՝ Time based</small>
            </div>
          </div>
          <form id="totp-form" @submit.prevent="submitCode">
            <label>Authenticator կոդ<input id="code" ref="codeField" v-model="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>
            <button type="submit">Մուտք գործել</button>
          </form>
        </div>
        <p id="login-error" class="error" role="alert">{{ error }}</p>
        <div id="login-loading" class="loading" :hidden="!loadingText">{{ loadingText }}</div>
      </section>
    </div>
    <LoginGuide :open="guideOpen" :issuer="ISSUER" @close="guideOpen = false" />
  </div>
</template>
