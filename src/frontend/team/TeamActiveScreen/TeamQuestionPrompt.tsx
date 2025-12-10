import { QuestionTimer } from '@/frontend/components/ActiveItemScreens/QuestionTimer';
import { useTeamValt } from '@/frontend/team/teamValt';
import type { ActiveItem } from '@/types';
import { debounce } from 'lodash';
import { useState, useEffect, useRef, useCallback } from 'react';
import logo from 'src/assets/favicon.svg';
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

export const GeneralAnswer = () => {
  const valt = useTeamValt();
  const snap = useSnapshot(valt.store);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleAnswerChange = debounce((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    valt.submitAnswer(e.target.value);
  }, 1000);

  return (
    <div className={`card bg-base-100 text-base-content ${snap.isTimeUp ? 'opacity-50' : ''}`}>
      <textarea
        ref={textareaRef}
        className='w-full h-16 p-2 border rounded'
        disabled={snap.isTimeUp}
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
  const snap = useSnapshot(valt.store);
  const [answer, setAnswer] = useState<boolean | null>(null);
  const trueButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Don't overwrite local state if already set
    if (answer === null) {
      setAnswer(snap.answer ? JSON.parse(snap.answer as string) : null);
    }
  }, [snap.answer]);

  useEffect(() => {
    trueButtonRef.current?.focus();
  }, []);

  const handleAnswerTrue = () => {
    setAnswer(true);
    valt.submitAnswer(true);
  };

  const handleAnswerFalse = () => {
    setAnswer(false);
    valt.submitAnswer(false);
  };

  return (
    <div className='text-center'>
      <div className='flex gap-8 justify-center'>
        <button
          ref={trueButtonRef}
          disabled={snap.isTimeUp}
          className={`h-30 w-60 rounded-2xl text-4xl shadow-md ${
            snap.isTimeUp ? 'opacity-70' : 'cursor-pointer hover:brightness-90'
          } ${answer === true ? 'bg-success' : 'bg-neutral'}`}
          onClick={handleAnswerTrue}
        >
          True
        </button>
        <button
          className={`h-30 w-60 rounded-2xl text-4xl shadow-md ${
            snap.isTimeUp ? 'opacity-70' : 'cursor-pointer hover:brightness-90'
          } ${answer === false ? 'bg-error' : 'bg-neutral'}`}
          disabled={snap.isTimeUp}
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
  const snap = useSnapshot(valt.store);
  const [savedAnswers, setSavedAnswers] = useState<Record<number, string>>({});
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (typeof snap.answer === 'string' && snap.answer) {
      const answerParts = snap.answer.split(' | ');

      const parsed = answerParts.reduce((acc, val, idx) => {
        if (val && val !== '__') {
          acc[idx] = val;
        }
        return acc;
      }, {} as Record<number, string>);

      setSavedAnswers(parsed);
    }
  }, [snap.answer]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const translation = translations.find((t) => t.languageCode === languageCode);

  if (!translation) {
    return null;
  }

  const parts = parsePromptWithBlanks(translation.prompt);
  const totalBlanks = parts.filter((p) => p.type === 'blank').length;

  const handleInputChange = debounce(() => {
    // Read values directly from DOM
    const answerArray = Array.from({ length: totalBlanks }, (_, idx) => {
      const value = inputRefs.current[idx]?.value || '';
      return value || '__';
    });

    valt.submitAnswer(answerArray.join(' | '));
  }, 500);

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
            disabled={snap.isTimeUp}
            type='text'
            className={`input input-bordered input-sm mx-1 w-40 inline-block text-xl ${
              snap.isTimeUp ? 'opacity-50' : ''
            }`}
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

  const handleTimeUp = useCallback(() => {
    valt.timeUp();
  }, [valt]);

  return (
    <div className='absolute inset-0 flex flex-col gap-8 px-10'>
      <QuestionTimer
        active
        seconds={activeItem.seconds}
        startTime={activeItem.startTime}
        gracePeriod={snap.gracePeriod}
        onTimeUp={handleTimeUp}
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
