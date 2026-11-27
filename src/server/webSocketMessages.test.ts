import { HostMessage, JudgeMessage, parseMessage, PresenterMessage, TeamMessage } from '@/server/webSocketMessages';
import { describe, expect, test } from 'bun:test';

const frame = (value: unknown) => JSON.stringify(value);

describe('parseMessage', () => {
  test('refuses a frame that is not JSON', () => {
    expect(parseMessage(TeamMessage, '{nope')).toEqual({
      ok: false,
      error: 'Message is not valid JSON',
      ack: undefined
    });
  });

  test('accepts the messages the clients send', () => {
    const answers = {
      'team-1': {
        answerId: null,
        answerText: null,
        languageCode: null,
        teamId: 'team-1',
        teamNumber: 1,
        points: null,
        autoPoints: null,
        challenged: null
      }
    };
    const prompt = {
      type: 'question',
      id: 'q1',
      number: 1,
      questionType: 'PG',
      maxPoints: 4,
      phase: 'prompt',
      seconds: 30,
      startTime: null,
      remainingSeconds: 30,
      isTimeUp: false,
      locked: false,
      graded: false,
      translations: [{ languageCode: 'en', prompt: 'P' }],
      answers
    };
    const answer = {
      type: 'question',
      id: 'q1',
      number: 1,
      phase: 'answer',
      locked: true,
      graded: false,
      translations: [{ languageCode: 'en', answer: 'A', clarification: null }],
      answers
    };

    const accepted = [
      [TeamMessage, { type: 'PING', __ACK__: 'a' }],
      [TeamMessage, { type: 'SUBMIT_ANSWER', answer: 'Ten days', __ACK__: 'a' }],
      [TeamMessage, { type: 'SUBMIT_CHALLENGE', questionId: 'q1', challenged: true, __ACK__: 'a' }],
      [HostMessage, { type: 'UPDATE_RUN_STATUS', status: 'in_progress', __ACK__: 'a' }],
      [HostMessage, { type: 'UPDATE_GRACE_PERIOD', gracePeriod: 3, __ACK__: 'a' }],
      [HostMessage, { type: 'SET_ACTIVE_ITEM', activeItem: null, __ACK__: 'a' }],
      [HostMessage, { type: 'SET_ACTIVE_ITEM', activeItem: { type: 'title', title: 'T', remarks: null } }],
      [HostMessage, { type: 'SET_ACTIVE_ITEM', activeItem: { type: 'slide', number: 1, content: 'S' } }],
      [HostMessage, { type: 'SET_ACTIVE_ITEM', activeItem: prompt }],
      [HostMessage, { type: 'SET_ACTIVE_ITEM', activeItem: answer }],
      [HostMessage, { type: 'SET_QUESTION_LOCKED', questionId: 'q1', locked: true }],
      [HostMessage, { type: 'START_TIMER' }],
      [HostMessage, { type: 'REMOVE_TIMER' }],
      [JudgeMessage, { type: 'UPDATE_POINTS', questionId: 'q1', answerId: 'a1', points: 2, __ACK__: 'a' }],
      [JudgeMessage, { type: 'UPDATE_POINTS', answerId: 'a1', points: null }],
      [JudgeMessage, { type: 'SET_QUESTION_GRADED', questionId: 'q1', graded: true }],
      [PresenterMessage, { type: 'PING', __ACK__: 'a' }]
    ] as const;

    for (const [schema, message] of accepted) {
      expect(parseMessage(schema, frame(message))).toMatchObject({ ok: true });
    }
  });

  test('refuses wrong shapes, keeping the ACK id', () => {
    const refused = [
      [TeamMessage, { type: 'UPDATE_POINTS', answerId: 'a1', points: 2, __ACK__: 'x' }],
      [TeamMessage, { type: 'SUBMIT_ANSWER', answer: 42, __ACK__: 'x' }],
      [TeamMessage, { type: 'SUBMIT_ANSWER', answer: 'a'.repeat(2001), __ACK__: 'x' }],
      [HostMessage, { type: 'UPDATE_RUN_STATUS', status: 'deleted', __ACK__: 'x' }],
      [HostMessage, { type: 'UPDATE_GRACE_PERIOD', gracePeriod: -1, __ACK__: 'x' }],
      [HostMessage, { type: 'SET_ACTIVE_ITEM', activeItem: { type: 'question', id: 'q1' }, __ACK__: 'x' }],
      [JudgeMessage, { type: 'UPDATE_POINTS', answerId: 'a1', points: 'lots', __ACK__: 'x' }],
      [JudgeMessage, { type: 'UPDATE_POINTS', answerId: 'a1', points: 1.5, __ACK__: 'x' }],
      [JudgeMessage, { type: 'SET_QUESTION_LOCKED', questionId: 'q1', locked: true, __ACK__: 'x' }],
      [PresenterMessage, { type: 'SET_ACTIVE_ITEM', activeItem: null, __ACK__: 'x' }]
    ] as const;

    for (const [schema, message] of refused) {
      expect(parseMessage(schema, frame(message))).toMatchObject({ ok: false, ack: 'x' });
    }
  });

  test('names the bad field', () => {
    const result = parseMessage(JudgeMessage, frame({ type: 'UPDATE_POINTS', answerId: 'a1', points: 'lots' }));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toStartWith('Invalid message (points): ');
  });
});
