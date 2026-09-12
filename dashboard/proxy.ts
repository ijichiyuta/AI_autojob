import { NextResponse, type NextRequest } from 'next/server';

/**
 * ダッシュボード全体に Basic認証をかける。
 *
 * NDA（秘密保持契約）を締結したため、NDAオプション付き案件の情報は秘密情報にあたる
 * （NDA 第2条）。複製は業務遂行上必要な範囲で認められているが、複製したものも
 * 秘密情報として善良な管理者の注意義務をもって管理する義務がある（第3条4項・第6条）。
 * 案件情報を一覧できるこの画面を無認証で公開してはいけない。
 *
 * DASHBOARD_USER / DASHBOARD_PASSWORD が未設定のときは localhost からのみ通す。
 */
export function proxy(request: NextRequest) {
  const user = process.env.DASHBOARD_USER;
  const password = process.env.DASHBOARD_PASSWORD;

  if (!user || !password) {
    const host = request.headers.get('host') ?? '';
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
    if (isLocal) return NextResponse.next();
    return new NextResponse(
      'DASHBOARD_USER / DASHBOARD_PASSWORD が未設定です。公開環境では認証なしで起動できません。',
      { status: 503 },
    );
  }

  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    const givenUser = decoded.slice(0, idx);
    const givenPass = decoded.slice(idx + 1);
    if (safeEqual(givenUser, user) && safeEqual(givenPass, password)) {
      return NextResponse.next();
    }
  }

  return new NextResponse('認証が必要です', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="ai-autojob", charset="UTF-8"' },
  });
}

/** 長さの違いで秘密が漏れないよう、比較時間を揃える */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  // 静的アセットとfaviconは除外し、画面はすべて認証の対象にする
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
