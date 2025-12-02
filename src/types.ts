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
      phase: 'reading';
      translations: Array<{ languageCode: string; prompt: string }>;
    }
  | {
      type: 'question';
      id: string;
      number: number;
      questionType: 'PG' | 'PS' | 'TF' | 'FB';
      phase: 'prompt';
      seconds: number;
      startTime: string;
      translations: Array<{ languageCode: string; prompt: string }>;
    }
  | {
      type: 'question';
      id: string;
      number: number;
      phase: 'answer';
      translations: Array<{ languageCode: string; answer: string; clarification?: string }>;
    };
