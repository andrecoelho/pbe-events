// Shared types used across server and frontend

// Discriminated union for active item types stored in runs.active_item JSONB column
export type ActiveItem =
  | { type: 'title'; title: string; remarks: string | null }
  | { type: 'slide'; number: number; content: string }
  | {
      type: 'question';
      id: string;
      number: number;
      questionType: 'PG' | 'PS' | 'TF' | 'FB';
      maxPoints: number;
      phase: 'reading';
      seconds: number;
      translations: Array<{ languageCode: string; prompt: string }>;
    }
  | {
      type: 'question';
      id: string;
      number: number;
      questionType: 'PG' | 'PS' | 'TF' | 'FB';
      maxPoints: number;
      phase: 'prompt';
      seconds: number;
      locked: boolean;
      graded: boolean;
      // The timer (#47), in server time (ms since the epoch): `endsAt` while it runs, `pausedMs` (time left)
      // while the run is paused, both null when there's no timer. Pages count down to `endsAt` on their own,
      // using their offset from the server clock (src/frontend/utils/serverClock.ts).
      endsAt: number | null;
      pausedMs: number | null;
      // Set by the server once the time and the grace period have passed; answers are refused from then on.
      isTimeUp: boolean;
      translations: Array<{ languageCode: string; prompt: string }>;
      answers: Record<
        string, // teamId
        {
          answerId: string | null;
          answerText: string | null;
          languageCode: string | null;
          teamId: string;
          teamNumber: number;
          points: number | null;
          autoPoints: number | null;
          challenged: boolean | null;
        }
      >;
    }
  | {
      type: 'question';
      id: string;
      number: number;
      phase: 'answer';
      locked: boolean;
      graded: boolean;
      translations: Array<{ languageCode: string; answer: string; clarification?: string | null }>;
      answers: Record<
        string, // teamId
        {
          answerId: string | null;
          answerText: string | null;
          languageCode: string | null;
          teamId: string;
          teamNumber: number;
          points: number | null;
          autoPoints: number | null;
          challenged: boolean | null;
        }
      >;
    };

// WebSocket close code for a host, judge or presenter socket whose session logged out or expired.
export const SESSION_ENDED_CLOSE_CODE = 4001;
