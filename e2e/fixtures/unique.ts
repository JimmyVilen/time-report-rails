let counter = 0

/** Short unique suffix so parallel tests never collide on unique names. */
export function unique(prefix: string): string {
  counter += 1
  return `${prefix} ${Date.now().toString(36)}${String(counter)}`
}
