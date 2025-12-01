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
    const result = await fetch(`/api/events/${eventId}/slides`);

    if (result.status !== 200) {
      return { ok: false, error: 'Failed to load slides' } as const;
    }

    const response = (await result.json()) as {
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

  async updateTitleRemarks(value: string) {
    const result = await fetch(`/api/events/${this.store.eventId}/title-remarks`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titleRemarks: value })
    });

    if (result.status !== 200) {
      const response = (await result.json()) as { error: string };
      return { ok: false, error: response.error };
    }

    return { ok: true };
  }

  setSlideContent(slideId: string, content: string) {
    const slide = this.store.slides.find((s) => s.id === slideId);
    if (slide) {
      slide.content = content;
    }
  }

  async updateSlide(slideId: string, content: string) {
    const result = await fetch(`/api/slides/${slideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    if (result.status !== 200) {
      const response = (await result.json()) as { error: string };
      return { ok: false, error: response.error };
    }

    return { ok: true };
  }

  async addSlide() {
    const result = await fetch(`/api/events/${this.store.eventId}/slides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '' })
    });

    if (result.status !== 200) {
      const response = (await result.json()) as { error: string };
      return { ok: false, error: response.error };
    }

    const response = (await result.json()) as { slideId: string; number: number };
    this.store.slides.push({
      id: response.slideId,
      number: response.number,
      content: ''
    });

    return { ok: true };
  }

  async deleteSlide(slideId: string) {
    const slideToDelete = this.store.slides.find((s) => s.id === slideId);

    if (!slideToDelete) {
      return { ok: false, error: 'Slide not found' };
    }

    const result = await fetch(`/api/slides/${slideId}`, {
      method: 'DELETE'
    });

    if (result.status !== 200) {
      const response = (await result.json()) as { error: string };
      return { ok: false, error: response.error };
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
