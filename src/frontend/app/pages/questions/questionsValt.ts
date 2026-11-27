import { api, NO_CONNECTION, type Outcome } from '@/frontend/utils/api';
import { createContext, useContext } from 'react';
import { proxy, type Snapshot } from 'valtio';

export type QuestionType = 'PG' | 'PS' | 'TF' | 'FB';

export interface IQuestionTranslation {
  id?: string; // Optional for new translations
  languageCode: string;
  prompt: string;
  answer: string;
  clarification?: string | null; // Required for TF questions
}

export interface Question {
  id: string;
  number: number;
  type: QuestionType;
  maxPoints: number;
  seconds: number;
  translations: Record<string, IQuestionTranslation>; // key: language code, value: translation
}

export interface QuestionsStore {
  initialized: boolean;
  eventId: string;
  eventName: string;
  languages: Record<string, string>; // key: language code, value: language name
  questions: Record<string, Question>; // key: question id, value: question
  selectedQuestion: Question | null;
}

export interface ImportOptions {
  teamLanguage?: string;
  deleteAnswers?: boolean;
}

export interface ImportConflict {
  error: string;
  missingLanguages: { code: string; name: string; teamCount: number }[];
  answerCount: number;
  fileLanguages: { code: string; name: string }[];
}

export type ImportResult = { ok: true } | { ok: false; error?: string; conflict?: ImportConflict };

export class QuestionsValt {
  store: QuestionsStore;
  // Translation creates in flight, by `${questionId}:${languageCode}`.
  private pendingCreates = new Map<string, Promise<Outcome>>();

  constructor() {
    this.store = proxy<QuestionsStore>({
      initialized: false,
      eventId: '',
      eventName: '',
      languages: {},
      questions: {},
      selectedQuestion: null
    });
  }

  async init(eventId: string) {
    const result = await api(`/api/events/${eventId}/questions`);

    if (!result.ok) {
      return { ok: false, error: `Couldn’t load the questions. ${result.error}` } as const;
    }

    const response = result.data as {
      eventName: string;
      languages: { [code: string]: string };
      questions: Record<string, Question>;
    };

    this.store.eventId = eventId;
    this.store.eventName = response.eventName;

    // Convert languages array to object
    this.store.languages = response.languages;
    this.store.questions = response.questions;

    // Ensure every question has a translation for each language
    for (const [, question] of Object.entries(this.store.questions)) {
      for (const languageCode of Object.keys(this.store.languages)) {
        // Check if translation exists for this language code
        if (!question.translations[languageCode]) {
          // Add placeholder translation without id
          question.translations[languageCode] = {
            languageCode,
            prompt: '',
            answer: '',
            clarification: null
          };
        }
      }
    }

    this.store.initialized = true;

    // Select first question if available (sorted by number)
    const sortedQuestions = Object.values(this.store.questions).sort((a, b) => a.number - b.number);

    if (sortedQuestions.length > 0) {
      const firstQuestion = sortedQuestions[0];

      if (firstQuestion) {
        this.store.selectedQuestion = firstQuestion;
      }
    }

    return { ok: true } as const;
  }

  setSelectedQuestion(questionNumber: number | null) {
    if (questionNumber === null) {
      this.store.selectedQuestion = null;
      return;
    }

    // Find question by number
    const question = Object.values(this.store.questions).find((q) => q.number === questionNumber);
    this.store.selectedQuestion = question ?? null;
  }

  changeStoreTranslation(
    question: Question,
    translation: IQuestionTranslation,
    updates: Partial<Pick<IQuestionTranslation, 'answer' | 'prompt' | 'clarification'>>
  ) {
    const questionInStore = this.store.questions[question.id];

    if (!questionInStore) {
      return;
    }

    const translationInStore = questionInStore.translations[translation.languageCode];

    if (!translationInStore) {
      return;
    }

    if (updates.prompt !== undefined) {
      translationInStore.prompt = updates.prompt;
    }

    if (updates.answer !== undefined) {
      translationInStore.answer = updates.answer;
    }

    if (updates.clarification !== undefined) {
      translationInStore.clarification = updates.clarification;
    }
  }

  /**
   * Create a new question (without translations)
   */
  async addQuestion(type: QuestionType, maxPoints: number, seconds: number): Promise<Outcome> {
    const result = await api(`/api/events/${this.store.eventId}/questions`, {
      method: 'POST',
      json: { type, maxPoints, seconds }
    });

    if (result.ok) {
      const response = result.data as { question: Question };

      // Create translations record with empty translations for each language (indexed by language code)
      const translations: Record<string, IQuestionTranslation> = {};
      for (const languageCode of Object.keys(this.store.languages)) {
        translations[languageCode] = {
          languageCode,
          prompt: '',
          answer: '',
          clarification: null
        };
      }

      const newQuestion: Question = {
        id: response.question.id,
        number: response.question.number,
        type: response.question.type,
        maxPoints: response.question.maxPoints,
        seconds: response.question.seconds,
        translations
      };

      // Add question to the record
      this.store.questions[newQuestion.id] = newQuestion;

      // Select the newly added question
      this.store.selectedQuestion = newQuestion;

      return { ok: true };
    }

    return { ok: false, error: result.error };
  }

  /**
   * Insert a new question before a specific question number
   */
  async insertQuestionBefore(
    beforeNumber: number,
    type: QuestionType,
    maxPoints: number,
    seconds: number
  ): Promise<Outcome> {
    const result = await api(`/api/events/${this.store.eventId}/questions`, {
      method: 'POST',
      json: { type, maxPoints, seconds, insertBefore: beforeNumber }
    });

    if (result.ok) {
      const response = result.data as { question: Question };

      // Create translations record with empty translations for each language (indexed by language code)
      const translations: Record<string, IQuestionTranslation> = {};
      for (const languageCode of Object.keys(this.store.languages)) {
        translations[languageCode] = {
          languageCode,
          prompt: '',
          answer: '',
          clarification: null
        };
      }

      // Update question numbers for all questions >= beforeNumber
      for (const q of Object.values(this.store.questions)) {
        if (q.number >= beforeNumber) {
          q.number += 1;
        }
      }

      // Create the new question
      const newQuestion: Question = {
        ...response.question,
        translations
      };

      // Add to questions record
      this.store.questions[newQuestion.id] = newQuestion;

      // Select the newly inserted question
      this.store.selectedQuestion = newQuestion;

      return { ok: true };
    }

    return { ok: false, error: result.error };
  }

  /**
   * Update question metadata (number, type, maxPoints, seconds)
   */
  async updateQuestion(
    question: Snapshot<Question>,
    updates: Partial<Pick<Question, 'number' | 'type' | 'maxPoints' | 'seconds'>>
  ): Promise<Outcome> {
    const questionInStore = this.store.questions[question.id];

    if (!questionInStore) {
      return { ok: false, error: 'Question not found in store' };
    }

    const result = await api(`/api/questions/${question.id}`, { method: 'PATCH', json: updates });

    if (result.ok) {
      // If number changed, we need to reorder questions in the store
      if (updates.number !== undefined && updates.number !== question.number) {
        const oldNumber = question.number;
        const newNumber = updates.number;

        // Update all affected question numbers
        for (const q of Object.values(this.store.questions)) {
          if (q.id === question.id) {
            q.number = newNumber;
          } else if (newNumber < oldNumber) {
            // Moving earlier: increment questions between new and old positions
            if (q.number >= newNumber && q.number < oldNumber) {
              q.number += 1;
            }
          } else {
            // Moving later: decrement questions between old and new positions
            if (q.number > oldNumber && q.number <= newNumber) {
              q.number -= 1;
            }
          }
        }
      }

      questionInStore.type = updates.type ?? questionInStore.type;
      questionInStore.maxPoints = updates.maxPoints ?? questionInStore.maxPoints;
      questionInStore.seconds = updates.seconds ?? questionInStore.seconds;

      return { ok: true };
    }

    return { ok: false, error: result.error };
  }

  /**
   * Delete a question
   */
  async deleteQuestion(question: Snapshot<Question>): Promise<Outcome> {
    const result = await api(`/api/questions/${question.id}`, { method: 'DELETE' });

    if (result.ok) {
      // Get sorted questions before deletion to find adjacent questions
      const sortedQuestions = Object.values(this.store.questions).sort((a, b) => a.number - b.number);
      const deletedIndex = sortedQuestions.findIndex((q) => q.id === question.id);

      // Remove from the questions record
      delete this.store.questions[question.id];

      // Shift down the question numbers for all questions after the deleted one
      for (const q of Object.values(this.store.questions)) {
        if (q.number > question.number) {
          q.number -= 1;
        }
      }

      // Select a different question if the deleted one was selected
      if (this.store.selectedQuestion?.id === question.id) {
        const remainingQuestions = Object.values(this.store.questions).sort((a, b) => a.number - b.number);
        if (remainingQuestions.length > 0) {
          // Try to select the next question (at the same index), or the previous one if it was the last
          const nextQuestion = remainingQuestions[deletedIndex] || remainingQuestions[deletedIndex - 1];
          this.store.selectedQuestion = nextQuestion ?? null;
        } else {
          this.store.selectedQuestion = null;
        }
      }

      return { ok: true };
    }

    return { ok: false, error: result.error };
  }

  /**
   * Update or create a translation for a question
   * If the translation has an id, update it. Otherwise, create it.
   */
  async upsertTranslation(
    question: Snapshot<Question>,
    translation: IQuestionTranslation,
    updates?: Partial<Pick<IQuestionTranslation, 'answer' | 'prompt' | 'clarification'>>
  ): Promise<Outcome> {
    const key = `${question.id}:${translation.languageCode}`;

    // An edit made while the translation is still being created waits for it, then updates it.
    await this.pendingCreates.get(key);

    // The id comes from the store: the caller's snapshot can predate the create that set it.
    const id = this.store.questions[question.id]?.translations[translation.languageCode]?.id;

    if (id) {
      return await this.updateTranslation(question, { ...translation, id }, updates);
    }

    const create = this.addTranslation(question, translation);
    this.pendingCreates.set(key, create);

    try {
      return await create;
    } finally {
      this.pendingCreates.delete(key);
    }
  }

  /**
   * Add a translation to a question
   */
  async addTranslation(question: Snapshot<Question>, translation: Snapshot<IQuestionTranslation>): Promise<Outcome> {
    const questionInStore = this.store.questions[question.id];

    if (!questionInStore) {
      return { ok: false, error: 'Question not found in store' };
    }

    const translationInStore = questionInStore.translations[translation.languageCode];

    if (!translationInStore) {
      return { ok: false, error: 'Translation not found in store' };
    }

    const result = await api(`/api/questions/${question.id}/translations`, {
      method: 'POST',
      json: {
        languageCode: translationInStore.languageCode,
        prompt: translationInStore.prompt,
        answer: translationInStore.answer,
        clarification: translationInStore.clarification
      }
    });

    if (result.ok) {
      const response = result.data as { translation: IQuestionTranslation };

      translationInStore.id = response.translation.id;

      return { ok: true };
    }

    return { ok: false, error: result.error };
  }

  /**
   * Update a question translation
   */
  async updateTranslation(
    question: Snapshot<Question>,
    translation: Snapshot<IQuestionTranslation>,
    updates?: Partial<Pick<IQuestionTranslation, 'answer' | 'prompt' | 'clarification'>>
  ): Promise<Outcome> {
    const questionInStore = this.store.questions[question.id];

    if (!questionInStore) {
      return { ok: false, error: 'Question not found in store' };
    }

    if (!translation.id) {
      return { ok: false, error: 'Translation must have an id to be updated' };
    }

    const translationInStore = questionInStore.translations[translation.languageCode];

    if (!translationInStore) {
      return { ok: false, error: 'Translation not found in store' };
    }

    const result = await api(`/api/questions/translations/${translation.id}`, {
      method: 'PATCH',
      json: { languageCode: translation.languageCode, ...updates }
    });

    if (result.ok) {
      return { ok: true };
    }

    return { ok: false, error: result.error };
  }

  /**
   * Import questions from a YAML file. A 409 comes back as `conflict`: the import needs the
   * user to choose a language for some teams and/or agree to erase recorded answers, then retry
   * with those options.
   */
  async importQuestions(file: File, options: ImportOptions = {}): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);

    if (options.teamLanguage) {
      formData.append('teamLanguage', options.teamLanguage);
    }

    if (options.deleteAnswers) {
      formData.append('deleteAnswers', 'true');
    }

    const result = await api(`/api/events/${this.store.eventId}/questions/import`, { method: 'POST', body: formData });

    if (result.ok) {
      // Reload questions after successful import
      await this.init(this.store.eventId);
      return { ok: true };
    }

    if (result.status === 409) {
      return { ok: false, conflict: result.body as ImportConflict };
    }

    return { ok: false, error: result.error };
  }

  /**
   * Export questions to a YAML file
   */
  async exportQuestions(): Promise<Outcome> {
    // A file download, so this reads the response itself rather than through api().
    let response: Response;

    try {
      response = await fetch(`/api/events/${this.store.eventId}/questions/export`);
    } catch {
      return { ok: false, error: NO_CONNECTION };
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      return { ok: false, error: `Couldn’t export the questions. ${body?.error ?? `Error ${response.status}.`}` };
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Get filename from Content-Disposition header or use default
    const filenameMatch = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/);

    a.download = filenameMatch?.[1] ?? 'questions-export.yaml';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return { ok: true };
  }
}

export const QuestionsValtContext = createContext<QuestionsValt>(new QuestionsValt());
export const useQuestionsValt = () => useContext(QuestionsValtContext);
