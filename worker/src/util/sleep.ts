/** min〜max ミリ秒のランダム待機。収集レートを人間並みに落とすため */
export function randomDelay(range: [number, number]): Promise<void> {
  const [min, max] = range;
  const ms = Math.floor(min + Math.random() * (max - min));
  return new Promise((r) => setTimeout(r, ms));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
