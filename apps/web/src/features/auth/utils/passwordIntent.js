const CHANGE_INTENT_KEY = 'council.password-change-intent';

export function beginPasswordChange() {
  sessionStorage.setItem(CHANGE_INTENT_KEY, 'true');
}

export function hasPasswordChangeIntent() {
  return sessionStorage.getItem(CHANGE_INTENT_KEY) === 'true';
}

export function clearPasswordChangeIntent() {
  sessionStorage.removeItem(CHANGE_INTENT_KEY);
}
