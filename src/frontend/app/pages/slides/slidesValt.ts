import { api, type Outcome } from '@/frontend/utils/api';
import { proxy } from 'valtio';

interface Slide {
  id: string;
  number: number;
  content: string;
}

interface SlidesStore {
  initialized: boolean;
  eventId: string;
  eventName: string;
  titleRemarks: string;
  slides: Slide[];
}

export class SlidesValt {
  store: SlidesStore;

  constructor() {
    this.store = proxy<SlidesStore>({
      initialized: false,
      eventId: '',
      eventName: '',
      titleRemarks: '',
      slides: []
    });
  }

  async init(eventId: string) {
    const result = await api(`/api/events/${eventId}/slides`);

    if (!result.ok) {
      return { ok: false, error: `Couldn’t load the slides. ${result.error}` } as const;
    }

    const response = result.data as {
      eventName: string;
      titleRemarks: string;
      slides: Slide[];
    };

    this.store.eventId = eventId;
    this.store.eventName = response.eventName;
    this.store.titleRemarks = response.titleRemarks;
    this.store.slides = response.slides;
    this.store.initialized = true;

    return { ok: true } as const;
  }

  setTitleRemarks(value: string) {
    this.store.titleRemarks = value;
  }

  async updateTitleRemarks(value: string): Promise<Outcome> {
    const result = await api(`/api/events/${this.store.eventId}/title-remarks`, {
      method: 'PATCH',
      json: { titleRemarks: value }
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return { ok: true };
  }

  setSlideContent(slideId: string, content: string) {
    const slide = this.store.slides.find((s) => s.id === slideId);
    if (slide) {
      slide.content = content;
    }
  }

  async updateSlide(slideId: string, content: string): Promise<Outcome> {
    const result = await api(`/api/slides/${slideId}`, { method: 'PATCH', json: { content } });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return { ok: true };
  }

  async addSlide(): Promise<Outcome> {
    const result = await api(`/api/events/${this.store.eventId}/slides`, { method: 'POST', json: { content: '' } });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    const response = result.data as { slideId: string; number: number };
    this.store.slides.push({
      id: response.slideId,
      number: response.number,
      content: ''
    });

    return { ok: true };
  }

  async deleteSlide(slideId: string): Promise<Outcome> {
    const slideToDelete = this.store.slides.find((s) => s.id === slideId);

    if (!slideToDelete) {
      return { ok: false, error: 'Slide not found' };
    }

    const result = await api(`/api/slides/${slideId}`, { method: 'DELETE' });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    // Remove the deleted slide
    this.store.slides = this.store.slides.filter((s) => s.id !== slideId);

    // Renumber slides with higher numbers to close the gap
    this.store.slides.forEach((slide) => {
      if (slide.number > slideToDelete.number) {
        slide.number -= 1;
      }
    });

    return { ok: true };
  }
}
