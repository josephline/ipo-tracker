/**
 * 토스 앱(앱인토스 WebView) 안에서는 네이티브 API를,
 * 일반 브라우저에서는 웹 API를 쓰도록 감싼 얇은 레이어예요.
 * SDK는 토스 앱 안에서만 동적으로 불러와요.
 */
type HapticType = 'tap' | 'success' | 'confetti';

const inToss = (): boolean =>
  typeof window !== 'undefined' && 'ReactNativeWebView' in window;

const sdk = () => import('@apps-in-toss/web-framework');

export async function getItem(key: string): Promise<string | null> {
  if (inToss()) {
    try {
      return await (await sdk()).Storage.getItem(key);
    } catch {
      /* 웹 저장소로 대체 */
    }
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  if (inToss()) {
    try {
      await (await sdk()).Storage.setItem(key, value);
      return;
    } catch {
      /* 웹 저장소로 대체 */
    }
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 저장 불가 환경은 무시 */
  }
}

export function haptic(type: HapticType): void {
  if (inToss()) {
    sdk()
      .then((m) => m.generateHapticFeedback({ type }))
      .catch(() => {});
    return;
  }
  try {
    navigator.vibrate?.(type === 'tap' ? 10 : [20, 40, 20]);
  } catch {
    /* 진동 미지원 */
  }
}

/** 공유에 성공하면 'shared', 클립보드에 복사했으면 'copied'를 돌려줘요. */
export async function shareText(message: string): Promise<'shared' | 'copied' | 'failed'> {
  if (inToss()) {
    try {
      await (await sdk()).Share.sendMessage({ message });
      return 'shared';
    } catch {
      /* 웹 공유로 대체 */
    }
  }
  try {
    if (navigator.share) {
      await navigator.share({ text: message });
      return 'shared';
    }
  } catch {
    /* 사용자가 취소했거나 미지원 */
  }
  try {
    await navigator.clipboard.writeText(message);
    return 'copied';
  } catch {
    return 'failed';
  }
}
