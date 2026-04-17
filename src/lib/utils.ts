import { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const MAX_CLASS_VALUE_DEPTH = 100;
const MAX_CLASS_VALUE_NODES = 10_000;

type PendingClassValue =
  | {
      kind: 'value';
      value: ClassValue;
      depth: number;
    }
  | {
      kind: 'exit-array';
      value: ClassValue[];
    };

function flattenClassValues(inputs: ClassValue[]): string {
  const tokens: string[] = [];
  const stack: PendingClassValue[] = [];
  const activeArrays = new WeakSet<ClassValue[]>();

  for (let index = inputs.length - 1; index >= 0; index -= 1) {
    stack.push({
      kind: 'value',
      value: inputs[index],
      depth: 0,
    });
  }

  let visitedNodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current) {
      continue;
    }

    if (current.kind === 'exit-array') {
      activeArrays.delete(current.value);
      continue;
    }

    const { value, depth } = current;

    if (!value) {
      continue;
    }

    visitedNodes += 1;

    if (visitedNodes > MAX_CLASS_VALUE_NODES || depth > MAX_CLASS_VALUE_DEPTH) {
      continue;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'bigint'
    ) {
      tokens.push(String(value));
      continue;
    }

    if (Array.isArray(value)) {
      if (activeArrays.has(value)) {
        continue;
      }

      activeArrays.add(value);
      stack.push({
        kind: 'exit-array',
        value,
      });

      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({
          kind: 'value',
          value: value[index] as ClassValue,
          depth: depth + 1,
        });
      }

      continue;
    }

    if (typeof value !== 'object') {
      continue;
    }

    for (const key of Object.keys(value)) {
      if ((value as Record<string, unknown>)[key]) {
        tokens.push(key);
      }
    }
  }

  return tokens.join(' ');
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(flattenClassValues(inputs));
}
