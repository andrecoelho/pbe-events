// Shared types used across server and frontend

// Discriminated union for active item types stored in runs.active_item JSONB column
export type ActiveItem =
  | { type: 'blank' }
  | { type: 'title'; remarks: string | null }
  | { type: 'slide'; content: string }
  | {
      type: 'question';
      id: string;
      number: number;
      questionType: 'PG' | 'PS' | 'TF' | 'FB';
      phase: 'prompt' | 'answer' | 'ended';
      seconds: number;
      startTime: string;
      hasTimer: boolean;
      translations: Array<{ languageCode: string; prompt: string }>;
    };
