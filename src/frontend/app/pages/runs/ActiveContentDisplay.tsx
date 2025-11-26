import { useSnapshot } from 'valtio';
import { useHostValt } from './hostValt';
import { TimerDisplay } from './TimerDisplay';

export function ActiveContentDisplay() {
  const valt = useHostValt();
  const snap = useSnapshot(valt.store);

  if (!snap.run) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-center text-base-content/50'>
          <p className='text-2xl font-semibold'>No active run</p>
        </div>
      </div>
    );
  }

  const { activeQuestion, activeSlide } = snap.run;

  // No active content
  if (!activeQuestion && !activeSlide) {
    return (
      <div className='flex items-center justify-center h-full'>
        <div className='text-center text-base-content/50'>
          <p className='text-2xl font-semibold'>Ready for next content</p>
        </div>
      </div>
    );
  }

  // Slide phase
  if (activeSlide) {
    return (
      <div className='p-6 h-full overflow-y-auto'>
        <div className='card bg-base-100 shadow-xl'>
          <div className='card-body'>
            <h2 className='card-title text-3xl mb-4'>Slide {activeSlide.number}</h2>
            <div className='prose max-w-none'>
              <pre className='whitespace-pre-wrap text-lg'>{activeSlide.content}</pre>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Question phases
  if (activeQuestion) {
    // Fetch the full question details
    const question = snap.questions.find((q) => q.questionId === activeQuestion.id);

    if (!question) {
      return (
        <div className='flex items-center justify-center h-full'>
          <div className='text-center text-base-content/50'>
            <p className='text-2xl font-semibold'>Question not found</p>
          </div>
        </div>
      );
    }

    return (
      <div className='p-6 h-full overflow-y-auto space-y-4'>
        {/* Question header */}
        <div className='card bg-base-100 shadow-xl'>
          <div className='card-body'>
            <h2 className='card-title text-3xl mb-2'>Question {question.number}</h2>
            <div className='flex gap-4 text-sm opacity-70'>
              <div>Type: {question.type}</div>
              <div>Points: {question.maxPoints}</div>
              <div>Time: {question.seconds}s</div>
            </div>
          </div>
        </div>

        {/* Language-specific content */}
        <div className='space-y-2'>
          {Array.from(snap.languages.entries()).map(([code, name]) => {
            const teamsForLanguage = Array.from(snap.teams.values()).filter(
              (team) => team.languageCode === code
            );
            const answeredCount = teamsForLanguage.filter((team) => team.hasAnswer).length;

            return (
              <div key={code} className='collapse collapse-arrow bg-base-200'>
                <input type='checkbox' defaultChecked />
                <div className='collapse-title text-xl font-medium'>
                  {name} ({code.toUpperCase()})
                  <span className='ml-2 badge badge-info'>
                    {answeredCount}/{teamsForLanguage.length} answered
                  </span>
                </div>
                <div className='collapse-content'>
                  <div className='space-y-4 pt-2'>
                    <div>
                      <h4 className='font-semibold mb-1'>Content:</h4>
                      <p className='whitespace-pre-wrap'>Question content here...</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}

ActiveContentDisplay.displayName = 'ActiveContentDisplay';
