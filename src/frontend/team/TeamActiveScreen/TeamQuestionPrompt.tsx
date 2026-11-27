import { QuestionTimer } from '@/frontend/components/ActiveItemScreens/QuestionTimer';
import { toast } from '@/frontend/components/Toast';
import { useTeamValt } from '@/frontend/team/teamValt';
import type { ActiveItem } from '@/types';
import { debounce } from '@/frontend/utils/debounce';
import { useServerNow } from '@/frontend/utils/serverClock';
import { useEffect, useMemo, useRef, useState } from 'react';
import logo from '@/assets/PBE-logo_600px.png';
import { useSnapshot, type Snapshot } from 'valtio';

// Parse prompt and return array of text segments and input placeholders
function parsePromptWithBlanks(prompt: string): Array<{ type: 'text' | 'blank'; content: string; index?: number }> {
  const parts: Array<{ type: 'text' | 'blank'; content: string; index?: number }> = [];

  // Split by 2 or more consecutive underscores
  const segments = prompt.split(/_{2,}/);

  let blankIndex = 0;
  segments.forEach((segment, i) => {
    if (segment) {
      parts.push({ type: 'text', content: segment });
    }
    // Add blank placeholder between segments (but not after the last one)
    if (i < segments.length - 1) {
      parts.push({ type: 'blank', content: '', index: blankIndex });
      blankIndex++;
    }
  });

  return parts;
}

// Whether the open question takes answers no more: locked by the host, or its time and grace period are up.
// The page works the deadline out itself (#47), so inputs close at the same instant the server stops taking
// answers, without waiting for its message.
function useAnswersClosed() {
  const snap = useSnapshot(useTeamValt().store);
  const item = snap.activeItem as Snapshot<Extract<ActiveItem, { type: 'question'; phase: 'prompt' }>>;
  const closesAt = item.endsAt === null ? null : item.endsAt + snap.gracePeriod * 1000;
  const now = useServerNow(closesAt !== null && !item.isTimeUp && !item.locked);

  return item.isTimeUp || item.locked || (closesAt !== null && now >= closesAt);
}

export const GeneralAnswer = () => {
  const valt = useTeamValt();
  const snap = useSnapshot(valt.store, { sync: true });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const disabled = useAnswersClosed();

  // Focus the answer box when it opens and again when the host unlocks the question.
  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  const handleAnswerChange = debounce(async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const result = await valt.submitAnswer(e.target.value);

    if (!result.ok) {
      toast.show({ type: 'error', message: result.error });
    }
  }, 1000);

  return (
    <div className={`card bg-base-100 text-base-content ${disabled ? 'opacity-50' : ''}`}>
      <textarea
        ref={textareaRef}
        className='w-full h-16 p-2 border rounded'
        disabled={disabled}
        placeholder='Type your answer here...'
        onChange={handleAnswerChange}
        defaultValue={typeof snap.answer === 'string' ? snap.answer : ''}
      />
    </div>
  );
};

GeneralAnswer.displayName = 'GeneralAnswer';

export const TrueFalseAnswer = () => {
  const valt = useTeamValt();
  const snap = useSnapshot(valt.store, { sync: true });
  // The team's pick on this device, else the answer the server has (after a reload or reconnect).
  const [picked, setAnswer] = useState<boolean | null>(null);
  const answer: boolean | null = picked ?? (snap.answer ? JSON.parse(snap.answer as string) : null);
  const trueButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    trueButtonRef.current?.focus();
  }, []);

  const handleAnswerTrue = async () => {
    setAnswer(true);

    const result = await valt.submitAnswer(true);

    if (!result.ok) {
      toast.show({ type: 'error', message: result.error });
    }
  };

  const handleAnswerFalse = async () => {
    setAnswer(false);

    const result = await valt.submitAnswer(false);

    if (!result.ok) {
      toast.show({ type: 'error', message: result.error });
    }
  };

  const disabled = useAnswersClosed();

  return (
    <div className='text-center'>
      <div className='flex gap-8 justify-center'>
        <button
          ref={trueButtonRef}
          disabled={disabled}
          className={`h-30 w-60 rounded-2xl text-4xl shadow-md ${
            disabled ? 'opacity-70' : 'cursor-pointer hover:brightness-90'
          } ${answer === true ? 'bg-success' : 'bg-neutral'}`}
          onClick={handleAnswerTrue}
        >
          True
        </button>
        <button
          className={`h-30 w-60 rounded-2xl text-4xl shadow-md ${
            disabled ? 'opacity-70' : 'cursor-pointer hover:brightness-90'
          } ${answer === false ? 'bg-error' : 'bg-neutral'}`}
          disabled={disabled}
          onClick={handleAnswerFalse}
        >
          False
        </button>
      </div>
    </div>
  );
};

TrueFalseAnswer.displayName = 'TrueFalseAnswer';

export const FillInTheBlankAnswer = ({
  translations,
  languageCode,
  maxPoints
}: {
  translations: Snapshot<Array<{ languageCode: string; prompt: string }>>;
  languageCode: string | null;
  maxPoints: number;
}) => {
  const valt = useTeamValt();
  const snap = useSnapshot(valt.store, { sync: true });
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // The blanks the server has saved ('__' marks an empty one), shown after a reload or reconnect.
  const savedAnswers = useMemo(() => {
    const parsed: Record<number, string> = {};

    if (typeof snap.answer === 'string' && snap.answer) {
      snap.answer.split(' | ').forEach((val, idx) => {
        if (val && val !== '__') {
          parsed[idx] = val;
        }
      });
    }

    return parsed;
  }, [snap.answer]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const translation = translations.find((t) => t.languageCode === languageCode);
  const parts = translation ? parsePromptWithBlanks(translation.prompt) : [];

  // One debounced save for the component's life, so re-renders (the timer ticks every second) don't
  // start a new debounce.
  const saveAnswer = useMemo(
    () =>
      debounce(async (answerText: string) => {
        const result = await valt.submitAnswer(answerText);

        if (!result.ok) {
          toast.show({ type: 'error', message: result.error });
        }
      }, 500),
    [valt]
  );

  // Every blank's value in order, read from the inputs next to the one that changed; '__' marks an empty one.
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputs = e.currentTarget.parentElement?.querySelectorAll('input') ?? [];

    saveAnswer(Array.from(inputs, (input) => input.value || '__').join(' | '));
  };

  const disabled = useAnswersClosed();

  if (!translation) {
    return null;
  }

  return (
    <div className='text-2xl font-serif leading-loose'>
      <span className='text-base-100'>({maxPoints} pts.) &nbsp;</span>
      {parts.map((part, i) =>
        part.type === 'text' ? (
          <span key={i} className='text-base-100'>
            {part.content}
          </span>
        ) : (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[part.index!] = el;
            }}
            disabled={disabled}
            type='text'
            className={`input input-bordered input-sm mx-1 w-40 inline-block text-xl ${disabled ? 'opacity-50' : ''}`}
            defaultValue={savedAnswers[part.index!] || ''}
            onChange={handleInputChange}
          />
        )
      )}
    </div>
  );
};

FillInTheBlankAnswer.displayName = 'FillInTheBlankAnswer';

export const TeamQuestionPrompt = () => {
  const valt = useTeamValt();
  const snap = useSnapshot(valt.store);

  const activeItem = snap.activeItem as Snapshot<Extract<ActiveItem, { type: 'question'; phase: 'prompt' }>>;
  const translation = activeItem?.translations.find((t) => t.languageCode === snap.team?.languageCode);

  return (
    <div className='absolute inset-0 flex flex-col gap-8 px-10'>
      <QuestionTimer
        active
        locked={activeItem.locked}
        seconds={activeItem.seconds}
        endsAt={activeItem.endsAt}
        pausedMs={activeItem.pausedMs}
      />
      <div className='flex items-center gap-10 mt-10'>
        <img src={logo} className='h-28' />
        <h1 className='text-5xl uppercase text-center text-base-100 font-serif'>Question #{activeItem.number}</h1>
      </div>
      {translation && activeItem.questionType !== 'FB' && (
        <div className='text-2xl font-serif text-base-100 leading-loose'>
          ({activeItem.maxPoints} pts.) &nbsp;
          {translation.prompt}
        </div>
      )}
      <div>
        {(activeItem.questionType === 'PG' || activeItem.questionType === 'PS') && <GeneralAnswer />}
        {activeItem.questionType === 'TF' && <TrueFalseAnswer />}
        {activeItem.questionType === 'FB' && (
          <FillInTheBlankAnswer
            translations={activeItem.translations}
            languageCode={snap.team?.languageCode || null}
            maxPoints={activeItem.maxPoints}
          />
        )}
      </div>
    </div>
  );
};

TeamQuestionPrompt.displayName = 'TeamQuestionPrompt';
