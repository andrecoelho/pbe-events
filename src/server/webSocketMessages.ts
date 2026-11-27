// The messages each kind of live run socket may send, as Zod schemas (see docs/WEBSOCKET_ARCHITECTURE.md).
// webSocket.ts parses every frame with parseMessage() before acting on it.
import type { ActiveItem } from '@/types';
import { z } from 'zod';

// Largest frame the server accepts; Bun closes the socket (code 1009) on anything bigger.
// SET_ACTIVE_ITEM carries the whole active item (slide text, translations, every team's answer).
export const MAX_MESSAGE_BYTES = 1024 * 1024;

const QUESTION_TYPES = ['PG', 'PS', 'TF', 'FB'] as const;
const RUN_STATUSES = ['not_started', 'in_progress', 'paused', 'completed'] as const;

const id = z.string().min(1);
const ack = z.string().optional();

const ActiveAnswer = z.object({
  answerId: z.string().nullable(),
  answerText: z.string().nullable(),
  languageCode: z.string().nullable(),
  teamId: z.string(),
  teamNumber: z.number(),
  points: z.number().nullable(),
  autoPoints: z.number().nullable(),
  challenged: z.boolean().nullable()
});

const questionBase = {
  type: z.literal('question'),
  id,
  number: z.number().int().positive()
};

export const ActiveItemSchema = z.union([
  z.object({ type: z.literal('title'), title: z.string(), remarks: z.string().nullable() }),
  z.object({ type: z.literal('slide'), number: z.number().int(), content: z.string() }),
  z.object({
    ...questionBase,
    questionType: z.enum(QUESTION_TYPES),
    maxPoints: z.number(),
    phase: z.literal('reading'),
    seconds: z.number(),
    translations: z.array(z.object({ languageCode: z.string(), prompt: z.string() }))
  }),
  z.object({
    ...questionBase,
    questionType: z.enum(QUESTION_TYPES),
    maxPoints: z.number(),
    phase: z.literal('prompt'),
    seconds: z.number(),
    locked: z.boolean(),
    graded: z.boolean(),
    // The server sets the timer itself when the question opens (#47).
    endsAt: z.number().nullable().default(null),
    pausedMs: z.number().nullable().default(null),
    isTimeUp: z.boolean(),
    translations: z.array(z.object({ languageCode: z.string(), prompt: z.string() })),
    // Ignored: the server reads answers from the answers table (#54).
    answers: z.record(z.string(), ActiveAnswer).default({})
  }),
  z.object({
    ...questionBase,
    phase: z.literal('answer'),
    locked: z.boolean(),
    graded: z.boolean(),
    translations: z.array(
      z.object({ languageCode: z.string(), answer: z.string(), clarification: z.string().nullish() })
    ),
    // Ignored: the server reads answers from the answers table (#54).
    answers: z.record(z.string(), ActiveAnswer).default({})
  })
]);

const Ping = z.object({ type: z.literal('PING'), __ACK__: ack });

export const TeamMessage = z.discriminatedUnion('type', [
  Ping,
  // True/false answers arrive as booleans and are saved as 'true' / 'false'.
  z.object({
    type: z.literal('SUBMIT_ANSWER'),
    answer: z.union([z.string().max(2000), z.boolean().transform(String)]),
    // The question it answers (#50): an answer resent after a reconnect may arrive once the host moved on.
    questionId: id.optional(),
    __ACK__: ack
  }),
  z.object({ type: z.literal('SUBMIT_CHALLENGE'), questionId: id, challenged: z.boolean(), __ACK__: ack })
]);

export const HostMessage = z.discriminatedUnion('type', [
  Ping,
  z.object({ type: z.literal('UPDATE_RUN_STATUS'), status: z.enum(RUN_STATUSES), __ACK__: ack }),
  z.object({ type: z.literal('UPDATE_GRACE_PERIOD'), gracePeriod: z.number().int().min(0).max(600), __ACK__: ack }),
  z.object({ type: z.literal('SET_ACTIVE_ITEM'), activeItem: ActiveItemSchema.nullable(), __ACK__: ack }),
  z.object({ type: z.literal('SET_QUESTION_LOCKED'), questionId: id, locked: z.boolean(), __ACK__: ack }),
  z.object({ type: z.literal('START_TIMER'), __ACK__: ack }),
  z.object({ type: z.literal('REMOVE_TIMER'), __ACK__: ack }),
  z.object({ type: z.literal('RELEASE_TEAM_DEVICE'), teamId: id, __ACK__: ack }),
  z.object({ type: z.literal('RENEW_JOIN_CODE'), teamId: id, __ACK__: ack })
]);

export const JudgeMessage = z.discriminatedUnion('type', [
  Ping,
  z.object({
    type: z.literal('UPDATE_POINTS'),
    answerId: id,
    points: z.number().int().min(0).nullable(),
    __ACK__: ack
  }),
  z.object({ type: z.literal('SET_QUESTION_GRADED'), questionId: id, graded: z.boolean(), __ACK__: ack })
]);

export const PresenterMessage = z.discriminatedUnion('type', [Ping]);

export type ParsedMessage<T extends z.ZodType> =
  | { ok: true; message: z.infer<T> }
  | { ok: false; error: string; ack: string | undefined };

// Parses a frame against a role's schema. On failure, `ack` is the frame's __ACK__ id when it has one,
// so the sender can still be answered.
export function parseMessage<T extends z.ZodType>(schema: T, raw: string | Buffer): ParsedMessage<T> {
  let json: unknown;

  try {
    json = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    return { ok: false, error: 'Message is not valid JSON', ack: undefined };
  }

  const result = schema.safeParse(json);

  if (result.success) {
    return { ok: true, message: result.data };
  }

  const ackId = json && typeof json === 'object' && '__ACK__' in json ? json['__ACK__'] : undefined;
  const issue = result.error.issues[0];
  const path = issue?.path.length ? ` (${issue.path.join('.')})` : '';

  return {
    ok: false,
    error: `Invalid message${path}: ${issue?.message ?? 'unknown error'}`,
    ack: typeof ackId === 'string' ? ackId : undefined
  };
}

// The schema's active item must fit the shared ActiveItem type.
type Assert<T extends true> = T;
export type ActiveItemSchemaFitsType = Assert<z.infer<typeof ActiveItemSchema> extends ActiveItem ? true : false>;
