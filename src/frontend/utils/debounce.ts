/**
 * Delays calling `fn` until `wait` ms have passed since the last call, then calls it
 * with the latest arguments (trailing edge only, like lodash's default `debounce`).
 */
export function debounce<Args extends unknown[]>(fn: (...args: Args) => unknown, wait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return (...args: Args): void => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
