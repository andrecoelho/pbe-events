import { createContext, useContext } from 'react';
import { proxy, type Snapshot } from 'valtio';

export type QuestionType = 'PG' | 'PS' | 'TF' | 'FB';

export interface IQuestionTranslation {
  id?: string; // Optional for new translations
  languageCode: string;
  prompt: string;
  answer: string;
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

export class QuestionsValt {
  store: QuestionsStore;

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
    const result = await fetch(`/api/events/${eventId}/questions`);

    if (result.status === 200) {
      const response = (await result.json()) as {
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
              answer: ''
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
    }
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
    updates: Partial<Pick<IQuestionTranslation, 'answer' | 'prompt'>>
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
  }

  /**
   * Create a new question (without translations)
   */
  async addQuestion(type: QuestionType, maxPoints: number, seconds: number) {
    const result = await fetch(`/api/events/${this.store.eventId}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, maxPoints, seconds })
    });

    if (result.status === 200) {
      const response = (await result.json()) as { question: Question };

      // Create translations record with empty translations for each language (indexed by language code)
      const translations: Record<string, IQuestionTranslation> = {};
      for (const languageCode of Object.keys(this.store.languages)) {
        translations[languageCode] = {
          languageCode,
          prompt: '',
          answer: ''
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

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  /**
   * Insert a new question before a specific question number
   */
  async insertQuestionBefore(beforeNumber: number, type: QuestionType, maxPoints: number, seconds: number) {
    const result = await fetch(`/api/events/${this.store.eventId}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, maxPoints, seconds, insertBefore: beforeNumber })
    });

    if (result.status === 200) {
      const response = (await result.json()) as { question: Question };

      // Create translations record with empty translations for each language (indexed by language code)
      const translations: Record<string, IQuestionTranslation> = {};
      for (const languageCode of Object.keys(this.store.languages)) {
        translations[languageCode] = {
          languageCode,
          prompt: '',
          answer: ''
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

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  /**
   * Update question metadata (number, type, maxPoints, seconds)
   */
  async updateQuestion(
    question: Snapshot<Question>,
    updates: Partial<Pick<Question, 'number' | 'type' | 'maxPoints' | 'seconds'>>
  ) {
    const questionInStore = this.store.questions[question.id];

    if (!questionInStore) {
      return { ok: false, error: 'Question not found in store' };
    }

    const result = await fetch(`/api/questions/${question.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });

    if (result.status === 200) {
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

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  /**
   * Delete a question
   */
  async deleteQuestion(question: Snapshot<Question>) {
    const result = await fetch(`/api/questions/${question.id}`, { method: 'DELETE' });

    if (result.status === 200) {
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

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  /**
   * Update or create a translation for a question
   * If the translation has an id, update it. Otherwise, create it.
   */
  async upsertTranslation(
    question: Snapshot<Question>,
    translation: IQuestionTranslation,
    updates?: Partial<Pick<IQuestionTranslation, 'answer' | 'prompt'>>
  ) {
    if (translation.id) {
      // Update existing translation
      return await this.updateTranslation(question, translation, updates);
    } else {
      // Create new translation
      return await this.addTranslation(question, translation);
    }
  }

  /**
   * Add a translation to a question
   */
  async addTranslation(question: Snapshot<Question>, translation: Snapshot<IQuestionTranslation>) {
    const questionInStore = this.store.questions[question.id];

    if (!questionInStore) {
      return { ok: false, error: 'Question not found in store' };
    }

    const translationInStore = questionInStore.translations[translation.languageCode];

    if (!translationInStore) {
      return { ok: false, error: 'Translation not found in store' };
    }

    const result = await fetch(`/api/questions/${question.id}/translations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        languageCode: translationInStore.languageCode,
        prompt: translationInStore.prompt,
        answer: translationInStore.answer
      })
    });

    if (result.status === 200) {
      const response = (await result.json()) as { translation: IQuestionTranslation };

      translationInStore.id = response.translation.id;

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  /**
   * Update a question translation
   */
  async updateTranslation(
    question: Snapshot<Question>,
    translation: Snapshot<IQuestionTranslation>,
    updates?: Partial<Pick<IQuestionTranslation, 'answer' | 'prompt'>>
  ) {
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

    const result = await fetch(`/api/questions/translations/${translation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ languageCode: translation.languageCode, ...updates })
    });

    if (result.status === 200) {
      return { ok: true };
    }

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  /**
   * Import questions from a YAML file
   */
  async importQuestions(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const result = await fetch(`/api/events/${this.store.eventId}/questions/import`, {
      method: 'POST',
      body: formData
    });

    if (result.status === 200) {
      // Reload questions after successful import
      await this.init(this.store.eventId);
      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  /**
   * Export questions to a YAML file
   */
  async exportQuestions() {
    try {
      const result = await fetch(`/api/events/${this.store.eventId}/questions/export`);

      if (result.status === 200) {
        // Create a blob from the response and trigger download
        const blob = await result.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Get filename from Content-Disposition header or use default
        const contentDisposition = result.headers.get('Content-Disposition');
        const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
        const filename = filenameMatch?.[1] ?? 'questions-export.yaml';

        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        return { ok: true };
      }

      const response = (await result.json()) as { error: string };
      return { ok: false, error: response.error };
    } catch (error) {
      return { ok: false, error: 'Failed to export questions' };
    }
  }
}

export const QuestionsValtContext = createContext<QuestionsValt>(new QuestionsValt());
export const useQuestionsValt = () => useContext(QuestionsValtContext);
