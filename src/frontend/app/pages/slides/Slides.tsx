import { eventIdFromPath } from '@/eventUrls';
import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { toast } from '@/frontend/components/Toast';
import { debounce } from '@/frontend/utils/debounce';
import { useMemo } from 'react';
import { useSnapshot } from 'valtio';
import './Slides.css';
import { SlidesValt } from './slidesValt';

const init = () => {
  const valt = new SlidesValt();
  const url = new URL(window.location.href);
  const eventId = eventIdFromPath(url.pathname);

  if (eventId) {
    valt.init(eventId).then((result) => {
      if (!result.ok) {
        toast.show({ message: result.error, type: 'error', persist: true });
      }
    });
  }

  const debouncedUpdateTitleRemarks = debounce(async (value: string) => {
    const result = await valt.updateTitleRemarks(value);
    if (!result.ok) {
      toast.show({ message: result.error, type: 'error' });
    }
  }, 500);

  // One delayed save per slide, so editing another slide within the delay doesn't drop this one's.
  const slideSavers = new Map<string, (content: string) => void>();

  const saveSlideSoon = (slideId: string, content: string) => {
    let save = slideSavers.get(slideId);

    if (!save) {
      save = debounce(async (latest: string) => {
        const result = await valt.updateSlide(slideId, latest);
        if (!result.ok) {
          toast.show({ message: result.error, type: 'error' });
        }
      }, 500);
      slideSavers.set(slideId, save);
    }

    save(content);
  };

  const handleTitleRemarksChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    valt.setTitleRemarks(e.target.value);
    debouncedUpdateTitleRemarks(e.target.value);
  };

  const handleSlideContentChange = (slideId: string, content: string) => {
    valt.setSlideContent(slideId, content);
    saveSlideSoon(slideId, content);
  };

  const handleAddSlide = async () => {
    const result = await valt.addSlide();
    if (!result.ok) {
      toast.show({ message: result.error, type: 'error' });
    }
  };

  const handleDeleteSlide = async (slide: { id: string; number: number }) => {
    const confirmation = await confirmModal.open(`Are you sure you want to delete slide ${slide.number}?`);

    if (confirmation) {
      const result = await valt.deleteSlide(slide.id);
      if (!result.ok) {
        toast.show({ message: result.error, type: 'error' });
      }
    }
  };

  return { valt, handleTitleRemarksChange, handleSlideContentChange, handleAddSlide, handleDeleteSlide };
};

export function Slides() {
  const { valt, handleTitleRemarksChange, handleSlideContentChange, handleAddSlide, handleDeleteSlide } = useMemo(
    init,
    []
  );

  const snap = useSnapshot(valt.store, { sync: true });

  return (
    <div className='Slides bg-base-100/95 flex-1 relative flex flex-col overflow-auto'>
      <div className='flex-1 overflow-auto p-8'>
        <div className='slides-content'>
          {/* Title Remarks */}
          <div className='slide-section'>
            <label className='label'>
              <span className='label-text font-semibold'>Title Remarks</span>
            </label>
            <textarea
              className='textarea textarea-bordered w-full'
              rows={3}
              placeholder='Opening remarks shown on title slide...'
              value={snap.titleRemarks}
              onChange={handleTitleRemarksChange}
              disabled={!snap.initialized}
            />
          </div>

          {/* Slides */}
          {snap.slides.map((slide) => (
            <div key={slide.id} className='slide-section'>
              <div className='slide-header'>
                <label className='label'>
                  <span className='label-text font-semibold'>Slide {slide.number}</span>
                </label>
                <button
                  className='btn btn-ghost btn-sm text-error'
                  onClick={() => handleDeleteSlide(slide)}
                  aria-label={`Delete slide ${slide.number}`}
                >
                  <Icon name='trash' className='size-5' />
                </button>
              </div>
              <textarea
                className='textarea textarea-bordered w-full'
                rows={4}
                placeholder='slide content'
                value={slide.content}
                onChange={(e) => handleSlideContentChange(slide.id, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <footer className='bg-base-200 text-base-content p-4 flex flex-none justify-end shadow-md-top'>
        <button className='btn btn-primary' disabled={!snap.initialized} onClick={handleAddSlide}>
          <Icon name='plus' className='size-4' />
          Add Slide
        </button>
      </footer>
    </div>
  );
}

Slides.displayName = 'Slides';
