const HANDLE = /^@?[A-Za-z0-9._]{1,30}$/;

export function isValidHandle(input: string): boolean {
  return HANDLE.test(input.trim());
}

/** "@Laia.Moves " -> "laia.moves": used to compare, never to display */
export function handleKey(input: string): string {
  return input.trim().replace(/^@/, '').toLowerCase();
}

/** stored form: always with a leading @ */
export function displayHandle(input: string): string {
  return '@' + input.trim().replace(/^@/, '');
}
