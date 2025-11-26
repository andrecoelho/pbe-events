import { useSnapshot } from 'valtio';
import { useHostValt, type Question, type Slide } from './hostValt';

export function QuestionSlideNavigator() {
  const valt = useHostValt();
  const snap = useSnapshot(valt.store);

  const handleSlideClick = (slideNumber: number) => {
    valt.navigateToSlide(slideNumber);
  };

  const handleQuestionClick = (questionId: string, phase: 'prompt' | 'answer' | 'ended') => {
    valt.navigateToQuestion(questionId, phase);
  };

  const stripMarkdown = (text: string) => text.replace(/[#*_`]/g, '');

  return (
    <div className='overflow-y-auto h-full bg-base-100'>
      <div className='p-4'>
        {/* Slides Section */}
        <div className='mb-6'>
          <h3 className='text-lg font-bold mb-2'>Slides</h3>
          <div className='space-y-1'>
            {snap.slides.map((slide: Slide) => {
              const isActive = snap.run?.activeSlide?.id === slide.slideId;
              const preview = stripMarkdown(slide.content).slice(0, 50);
              const displayText = preview.length < slide.content.length ? `${preview}...` : preview;

              return (
                <button
                  key={slide.slideId}
                  onClick={() => handleSlideClick(slide.number)}
                  className={`btn btn-sm w-full justify-start text-left ${isActive ? 'border-l-4 border-primary bg-primary/10' : 'btn-ghost'}`}
                >
                  📄 Slide {slide.number}: {displayText}
                </button>
              );
            })}
          </div>
        </div>

        {/* Questions Section */}
        <div>
          <h3 className='text-lg font-bold mb-2'>Questions</h3>
          <div className='space-y-3'>
            {snap.questions.map((question: Question) => {
              const isActiveQuestion = snap.run?.activeQuestion?.id === question.questionId;

              return (
                <div key={question.questionId} className='space-y-1'>
                  <div className='font-semibold text-sm opacity-70'>❓ Q{question.number}</div>
                  <div className='pl-4 space-y-1'>
                    <button
                      onClick={() => handleQuestionClick(question.questionId, 'prompt')}
                      className={`btn btn-xs w-full justify-start ${
                        isActiveQuestion ? 'border-l-4 border-primary bg-primary/10' : 'btn-ghost'
                      }`}
                    >
                      Prompt
                    </button>
                    <button
                      onClick={() => handleQuestionClick(question.questionId, 'answer')}
                      className='btn btn-xs w-full justify-start btn-ghost'
                    >
                      Answer
                    </button>
                    <button
                      onClick={() => handleQuestionClick(question.questionId, 'ended')}
                      className='btn btn-xs w-full justify-start btn-ghost'
                    >
                      Ended
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

QuestionSlideNavigator.displayName = 'QuestionSlideNavigator';
