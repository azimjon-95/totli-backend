/** Strip HTML tags and normalize whitespace for cake messages etc. */
export function sanitizePlainText(input: string, maxLen = 150): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}
