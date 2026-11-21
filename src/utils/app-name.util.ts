const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Home labels are limited in visible characters, including composed letters and emoji. */
export function limitAppName(value: string, limit: number): string {
  if (value.length <= limit) return value;
  let count = 0;
  for (const { index } of graphemes.segment(value)) {
    if (count === limit) return value.slice(0, index);
    count++;
  }
  return value;
}

export function appInitial(name: string): string {
  return limitAppName(name.trim(), 1).toLocaleUpperCase() || '•';
}
