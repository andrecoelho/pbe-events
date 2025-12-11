import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { toast } from '@/frontend/components/Toast';
import { debounce } from 'lodash';
import { useMemo } from 'react';
import { useSnapshot } from 'valtio';
import './Slides.css';
import { SlidesValt } from './slidesValt';

const init = () => {
  const valt = new SlidesValt();
  const url = new URL(window.location.href);
  const match = url.pathname.match(/^\/slides\/([^/]+)$/);
  const eventId = match ? match[1] : undefined;

  if (eventId) {
    valt.init(eventId).then((result) => {
      if (!result.ok) {
        toast.show({ message: `Error: ${result.error}`, type: 'error', persist: true });
      }
    });
  }

  const debouncedUpdateTitleRemarks = debounce(async (value: string) => {
    const result = await valt.updateTitleRemarks(value);
    if (!result.ok) {
      toast.show({ message: result.error || 'Failed to save title remarks', type: 'error' });
    }
  }, 500);

  const debouncedUpdateSlide = debounce(async (slideId: string, content: string) => {
    const result = await valt.updateSlide(slideId, content);
    if (!result.ok) {
      toast.show({ message: result.error || 'Failed to save slide', type: 'error' });
    }
  }, 500);

  const handleTitleRemarksChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    valt.setTitleRemarks(e.target.value);
    debouncedUpdateTitleRemarks(e.target.value);
  };

  const handleSlideContentChange = (slideId: string, content: string) => {
    valt.setSlideContent(slideId, content);
    debouncedUpdateSlide(slideId, content);
  };

  const handleAddSlide = async () => {
    const result = await valt.addSlide();
    if (!result.ok) {
      toast.show({ message: result.error || 'Failed to add slide', type: 'error' });
    }
  };

  const handleDeleteSlide = async (slide: { id: string; number: number }) => {
    const confirmation = await confirmModal.open(`Are you sure you want to delete slide ${slide.number}?`);

    if (confirmation) {
      const result = await valt.deleteSlide(slide.id);
      if (!result.ok) {
        toast.show({ message: result.error || 'Failed to delete slide', type: 'error' });
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
        <h1 className='text-3xl font-bold mb-1 text-center'>Event Slides</h1>
        <h2 className='text-2xl font-bold mb-6 text-center text-neutral brightness-75'>{snap.eventName}</h2>

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
