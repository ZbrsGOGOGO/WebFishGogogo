export type ThreeNumbers = [number, number, number];

export function randomNumber1To10(
  random: () => number = Math.random,
): number {
  const value = random();
  const normalized = Number.isFinite(value)
    ? Math.min(Math.max(value, 0), 0.999999999)
    : 0;
  return Math.floor(normalized * 10) + 1;
}

export function createThreeNumbers(
  random: () => number = Math.random,
): ThreeNumbers {
  return [
    randomNumber1To10(random),
    randomNumber1To10(random),
    randomNumber1To10(random),
  ];
}

export function totalOf(numbers: ThreeNumbers): number {
  return numbers[0] + numbers[1] + numbers[2];
}

export function isCorrectAnswer(
  numbers: ThreeNumbers,
  answer: number,
): boolean {
  return Number.isInteger(answer) && totalOf(numbers) === answer;
}
