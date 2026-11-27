import { describe, expect, test } from 'bun:test';

import { validateQuestionsData } from '@/server/questionsFile';

describe('validateQuestionsData', () => {
  test('accepts the documented example file', async () => {
    const data = Bun.YAML.parse(await Bun.file(`${import.meta.dir}/../../docs/questions-example.yaml`).text());
    const result = validateQuestionsData(data);

    expect(result.error).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  test('turns a numeric answer into a string', () => {
    const result = validateQuestionsData(
      Bun.YAML.parse(`
languages:
  - code: en
    name: English
questions:
  - type: PG
    maxPoints: 5
    seconds: 30
    translations:
      - lang: en
        prompt: In what year did World War II end?
        answer: 1945
`)
    );

    expect(result.valid).toBe(true);
    expect(result.questions?.[0]?.translations[0]?.answer).toBe('1945');
  });

  test('still rejects a missing answer', () => {
    const result = validateQuestionsData({
      languages: [{ code: 'en', name: 'English' }],
      questions: [{ type: 'PG', maxPoints: 5, seconds: 30, translations: [{ lang: 'en', prompt: 'Q?' }] }]
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('answer must be a non-empty string');
  });
});
