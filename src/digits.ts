const masks = [0b1111110,0b0110000,0b1101101,0b1111001,0b0110011,0b1011011,0b1011111,0b1110000,0b1111111,0b1111011];
const segments = [
  '5,2 23,2 27,6 23,10 5,10 1,6', '24,11 28,7 28,25 24,29 20,25 20,15',
  '24,31 28,35 28,53 24,57 20,53 20,35', '5,54 23,54 27,58 23,62 5,62 1,58',
  '0,35 4,31 8,35 8,53 4,57 0,53', '0,7 4,11 8,15 8,25 4,29 0,25',
  '5,28 23,28 27,32 23,36 5,36 1,32',
];
export function digits(value: number, length = 5): string {
  const text = String(Math.max(0,Math.floor(value))).padStart(length,'0');
  return '<svg class="digit-display" viewBox="0 0 ' + text.length * 35 + ' 64" role="img" aria-label="' + value + '">' +
    Array.from(text).map((c,i) => '<g transform="translate(' + i*35 + ' 0)">' + segments.map((p,j) =>
      '<polygon points="' + p + '" opacity="' + ((masks[Number(c)] & (1 << (6-j))) ? '1' : '.09') + '"/>').join('') + '</g>').join('') + '</svg>';
}
