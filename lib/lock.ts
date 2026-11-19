import { NextResponse } from 'next/server';
import { LockTimeoutError, runExclusive } from '@/lib/kv';

// 変更するAPI（POST・DELETE など）を包む。読み込み→変更→保存のあいだ、ほかの変更を待たせて、
// 2人の同時保存で片方の入力が消えるのを防ぐ。混み合って待ちきれなかったときは 503 を返す（保存はされていない）。
export function withWriteLock<A extends unknown[]>(handler: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await runExclusive(() => handler(...args));
    } catch (e) {
      if (e instanceof LockTimeoutError) {
        return NextResponse.json({ success: false, message: 'ただいま混み合っています。数秒おいて、もう一度お試しください（保存はされていません）。' }, { status: 503 });
      }
      throw e;
    }
  };
}
