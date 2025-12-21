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
      startTime: string | null;
      remainingSeconds: number;
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
      translations: Array<{ languageCode: string; answer: string; clarification?: string }>;
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
