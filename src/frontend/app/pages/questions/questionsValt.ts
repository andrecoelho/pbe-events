import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

export type QuestionType = 'PG' | 'PS' | 'TF' | 'FB';

export interface QuestionTranslation {
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
  translations: QuestionTranslation[];
}

export interface QuestionsStore {
  initialized: boolean;
  eventId: string;
  eventName: string;
  languages: { code: string; name: string }[];
  questions: Question[];
  selectedQuestionNumber: number | null;
}

export class QuestionsValt {
  store: QuestionsStore;

  constructor() {
    this.store = proxy<QuestionsStore>({
      initialized: false,
      eventId: '',
      eventName: '',
      languages: [],
      questions: [],
      selectedQuestionNumber: null
    });
  }

  async init(eventId: string) {
    const result = await fetch(`/api/events/${eventId}/questions`);

    if (result.status === 200) {
      const response = (await result.json()) as {
        eventName: string;
        languages: { code: string; name: string }[];
        questions: Question[];
      };

      this.store.eventId = eventId;
      this.store.eventName = response.eventName;
      this.store.languages = response.languages;
      this.store.questions = response.questions;
      this.store.initialized = true;

      // Select first question if available
      if (response.questions.length > 0) {
        const firstQuestion = response.questions[0];
        if (firstQuestion) {
          this.store.selectedQuestionNumber = firstQuestion.number;
        }
      }
    }
  }

  setSelectedQuestion(questionNumber: number | null) {
    this.store.selectedQuestionNumber = questionNumber;
  }

  /**
   * Create a new question (without translations)
   */
  async createQuestion(type: QuestionType, maxPoints: number, seconds: number) {
    const result = await fetch(`/api/events/${this.store.eventId}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, maxPoints, seconds })
    });

    if (result.status === 200) {
      const response = (await result.json()) as {
        id: string;
        number: number;
        type: QuestionType;
        maxPoints: number;
        seconds: number;
      };

      // Create translations array with empty translations for each language
      const translations: QuestionTranslation[] = this.store.languages.map((lang) => ({
        languageCode: lang.code,
        prompt: '',
        answer: ''
      }));

      this.store.questions.push({
        id: response.id,
        number: response.number,
        type: response.type,
        maxPoints: response.maxPoints,
        seconds: response.seconds,
        translations
      });

      // Keep questions sorted by number
      this.store.questions.sort((a, b) => a.number - b.number);

      // Select the newly added question
      this.store.selectedQuestionNumber = response.number;

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
      const response = (await result.json()) as {
        id: string;
        number: number;
        type: QuestionType;
        maxPoints: number;
        seconds: number;
      };

      // Reload all questions to get updated numbers
      await this.init(this.store.eventId);

      // Select the newly inserted question
      this.store.selectedQuestionNumber = beforeNumber;

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  /**
   * Update question metadata (number, type, maxPoints, seconds)
   */
  async updateQuestion(
    questionId: string,
    updates: {
      number?: number;
      type?: QuestionType;
      maxPoints?: number;
      seconds?: number;
    }
  ) {
    const question = this.store.questions.find((q) => q.id === questionId);

    if (!question) {
      return { ok: false, error: 'Question not found' };
    }

    const result = await fetch(`/api/questions/${questionId}`, {
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
        this.store.questions.forEach((q) => {
          if (q.id === questionId) {
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
        });

        // Sort questions by number
        this.store.questions.sort((a, b) => a.number - b.number);
      }

      // Update other fields
      if (updates.type !== undefined) {
        question.type = updates.type;
      }

      if (updates.maxPoints !== undefined) {
        question.maxPoints = updates.maxPoints;
      }

      if (updates.seconds !== undefined) {
        question.seconds = updates.seconds;
      }

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  /**
   * Delete a question
   */
  async deleteQuestion(questionId: string) {
    const result = await fetch(`/api/questions/${questionId}`, {
      method: 'DELETE'
    });

    if (result.status === 200) {
      const deletedQuestion = this.store.questions.find((q) => q.id === questionId);
      const deletedQuestionNumber = deletedQuestion?.number;
      const deletedIndex = this.store.questions.findIndex((q) => q.id === questionId);

      // Remove the deleted question
      this.store.questions = this.store.questions.filter((q) => q.id !== questionId);

      // Shift down the question numbers for all questions after the deleted one
      if (deletedQuestionNumber !== undefined) {
        this.store.questions.forEach((q) => {
          if (q.number > deletedQuestionNumber) {
            q.number -= 1;
          }
        });
      }

      // Select a different question if the deleted one was selected
      if (this.store.selectedQuestionNumber === deletedQuestionNumber) {
        if (this.store.questions.length > 0) {
          // Try to select the next question (at the same index), or the previous one if it was the last
          const nextQuestion = this.store.questions[deletedIndex] || this.store.questions[deletedIndex - 1];
          if (nextQuestion) {
            this.store.selectedQuestionNumber = nextQuestion.number;
          }
        } else {
          this.store.selectedQuestionNumber = null;
        }
      }

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  /**
   * Update or create a translation for a question
   * If the translation exists, update it. Otherwise, create it.
   */
  async upsertTranslation(questionId: string, languageCode: string, prompt: string, answer: string) {
    const question = this.store.questions.find((q) => q.id === questionId);

    if (!question) {
      return { ok: false, error: 'Question not found' };
    }

    // Find existing translation
    const existingTranslation = question.translations.find((t) => t.languageCode === languageCode);

    if (existingTranslation && existingTranslation.id) {
      // Update existing translation
      return await this.updateTranslation(existingTranslation.id, prompt, answer);
    } else {
      // Create new translation
      const result = await this.addTranslation(questionId, languageCode, prompt, answer);

      // If translation was created but doesn't have an existing entry in the array, we need to update it
      if (result.ok && !existingTranslation) {
        // Translation was added by addTranslation
      } else if (result.ok && existingTranslation && !existingTranslation.id) {
        // Find the newly added translation (which has an id) and remove the placeholder
        const newTranslation = question.translations.find((t) => t.languageCode === languageCode && t.id !== undefined);
        if (newTranslation) {
          // Remove the placeholder
          const placeholderIndex = question.translations.findIndex(
            (t) => t.languageCode === languageCode && t.id === undefined
          );
          if (placeholderIndex >= 0) {
            question.translations.splice(placeholderIndex, 1);
          }
        }
      }

      return result;
    }
  }

  /**
   * Add a translation to a question
   */
  async addTranslation(questionId: string, languageCode: string, prompt: string, answer: string) {
    const question = this.store.questions.find((q) => q.id === questionId);

    if (!question) {
      return { ok: false, error: 'Question not found' };
    }

    const result = await fetch(`/api/questions/${questionId}/translations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ languageCode, questionPrompt: prompt, answer })
    });

    if (result.status === 200) {
      const response = (await result.json()) as {
        id: string;
        languageCode: string;
        prompt: string;
        answer: string;
      };

      question.translations.push({
        id: response.id,
        languageCode: response.languageCode,
        prompt: response.prompt,
        answer: response.answer
      });

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  /**
   * Update a question translation
   */
  async updateTranslation(translationId: string, prompt?: string, answer?: string) {
    // Find the question and translation
    let question: Question | undefined;
    let translation: QuestionTranslation | undefined;

    for (const q of this.store.questions) {
      translation = q.translations.find((t) => t.id === translationId);
      if (translation) {
        question = q;
        break;
      }
    }

    if (!question || !translation) {
      return { ok: false, error: 'Translation not found' };
    }

    const result = await fetch(`/api/questions/translations/${translationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionPrompt: prompt, answer })
    });

    if (result.status === 200) {
      if (prompt !== undefined) translation.prompt = prompt;
      if (answer !== undefined) translation.answer = answer;

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };
    return { ok: false, error: response.error };
  }

  /**
   * Delete a question translation
   */
  async deleteTranslation(translationId: string) {
    // Find the question with this translation
    let question: Question | undefined;

    for (const q of this.store.questions) {
      if (q.translations.some((t) => t.id === translationId)) {
        question = q;
        break;
      }
    }

    if (!question) {
      return { ok: false, error: 'Translation not found' };
    }

    const result = await fetch(`/api/questions/translations/${translationId}`, {
      method: 'DELETE'
    });

    if (result.status === 200) {
      question.translations = question.translations.filter((t) => t.id !== translationId);
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
