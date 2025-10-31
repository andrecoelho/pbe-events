import { createContext, useContext } from 'react';
import { proxy } from 'valtio';

interface Language {
  id: string;
  code: string;
  name: string;
}

interface LanguagesStore {
  initialized: boolean;
  eventId: string;
  eventName: string;
  languages: Language[];
  editingId: string | null;
  editForm: {
    code: string;
    name: string;
  };
  errors: {
    code?: string;
    name?: string;
  };
}

export class LanguagesValt {
  store: LanguagesStore;

  constructor() {
    this.store = proxy({
      initialized: false,
      eventId: '',
      eventName: '',
      languages: [],
      editingId: null,
      editForm: { code: '', name: '' },
      errors: {}
    } as LanguagesStore);
  }

  async init(eventId: string) {
    const result = await fetch(`/api/events/${eventId}/languages`);
    const response = (await result.json()) as { eventName: string; languages: Language[] };

    this.store.eventId = eventId;
    this.store.eventName = response.eventName;
    this.store.languages = response.languages;
    this.store.initialized = true;
  }

  startEdit(language: Language) {
    this.store.editingId = language.id;
    this.store.editForm = { code: language.code, name: language.name };
    this.store.errors = {};
  }

  cancelEdit() {
    this.store.editingId = null;
    this.store.editForm = { code: '', name: '' };
    this.store.errors = {};
  }

  updateEditForm(field: 'code' | 'name', value: string) {
    this.store.editForm[field] = value;
    // Clear error when user starts typing
    if (this.store.errors[field]) {
      delete this.store.errors[field];
    }
  }

  validate(): boolean {
    const errors: { code?: string; name?: string } = {};

    if (!this.store.editForm.code.trim()) {
      errors.code = 'Code is required';
    }

    if (!this.store.editForm.name.trim()) {
      errors.name = 'Name is required';
    }

    this.store.errors = errors;

    return Object.keys(errors).length === 0;
  }

  async saveEdit(): Promise<{ ok: boolean; error?: string }> {
    if (!this.validate()) {
      return { ok: false, error: 'Please fix validation errors' };
    }

    const result = await fetch(`/api/events/${this.store.eventId}/languages`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: this.store.editingId,
        code: this.store.editForm.code.trim(),
        name: this.store.editForm.name.trim()
      })
    });

    if (result.status === 200) {
      const language = this.store.languages.find((l) => l.id === this.store.editingId);

      if (language) {
        language.code = this.store.editForm.code.trim();
        language.name = this.store.editForm.name.trim();
      }

      this.cancelEdit();

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  async addLanguage(code: string, name: string): Promise<{ ok: boolean; error?: string }> {
    const result = await fetch(`/api/events/${this.store.eventId}/languages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim(), name: name.trim() })
    });

    if (result.status === 200) {
      const response = (await result.json()) as { id: string };
      this.store.languages.push({ id: response.id, code: code.trim(), name: name.trim() });
      // Sort by code
      this.store.languages.sort((a, b) => a.code.localeCompare(b.code));

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }

  async deleteLanguage(id: string): Promise<{ ok: boolean; error?: string }> {
    const result = await fetch(`/api/events/${this.store.eventId}/languages`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });

    if (result.status === 200) {
      this.store.languages = this.store.languages.filter((l) => l.id !== id);

      return { ok: true };
    }

    const response = (await result.json()) as { error: string };

    return { ok: false, error: response.error };
  }
}

export const LanguagesValtContext = createContext<LanguagesValt>(new LanguagesValt());
export const useLanguagesValt = () => useContext(LanguagesValtContext);
export type { Language };
