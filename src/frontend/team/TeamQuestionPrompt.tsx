import { QuestionTimer } from '@/frontend/components/ActiveItemScreens/QuestionTimer';
import { useTeamValt } from '@/frontend/team/teamValt';
import { useState, useEffect, useRef } from 'react';
import logo from 'src/assets/favicon.svg';
import type { Snapshot } from 'valtio';

// Parse prompt and return array of text segments and input placeholders
function parsePromptWithBlanks(prompt: string): Array<{ type: 'text' | 'blank'; content: string; index?: number }> {
  const parts: Array<{ type: 'text' | 'blank'; content: string; index?: number }> = [];
  const segments = prompt.split('__');

  segments.forEach((segment, i) => {
    if (segment) {
      parts.push({ type: 'text', content: segment });
    }
    // Add blank placeholder between segments (but not after the last one)
    if (i < segments.length - 1) {
      parts.push({ type: 'blank', content: '', index: Math.floor(i / 2) });
    }
  });

  return parts;
}

export const GeneralAnswer = () => {
  return (
    <div className='card bg-base-100 text-base-content'>
      <textarea className='w-full h-16 p-2 border rounded' placeholder='Type your answer here...' />
    </div>
  );
};

GeneralAnswer.displayName = 'GeneralAnswer';

export const TrueFalseAnswer = () => {
  const valt = useTeamValt();
  const [answer, setAnswer] = useState<boolean | null>(null);

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
      <div className='join'>
        <button
          className={`btn btn-xl join-item btn-active ${answer === true ? 'btn-success' : ''}`}
          onClick={handleAnswerTrue}
        >
          True
        </button>
        <button
          className={`btn btn-xl join-item btn-active ${answer === false ? 'btn-error' : ''}`}
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
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = (blankIndex: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [blankIndex]: value }));

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer to submit after 1 second of no typing
    debounceTimerRef.current = setTimeout(() => {
      const updatedAnswers = { ...answers, [blankIndex]: value };
      // Convert answers object to array, preserving order by index
      const answerArray = Object.entries(updatedAnswers)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([_, val]) => val);
      valt.submitAnswer(answerArray.join(' | '));
    }, 1000);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Filter to only the team's selected language, fallback to first translation
  const translation = translations.find((t) => t.languageCode === languageCode) || translations[0];

  if (!translation) return null;

  const parts = parsePromptWithBlanks(translation.prompt);

  return (
    <div className='text-2xl font-serif leading-loose'>
      ({maxPoints} pts.) &nbsp;
      {parts.map((part, i) =>
        part.type === 'text' ? (
          <span key={i}>{part.content}</span>
        ) : (
          <input
            key={i}
            type='text'
            className='input input-bordered input-sm mx-1 w-32 inline-block'
            value={answers[part.index!] || ''}
            onChange={(e) => handleInputChange(part.index!, e.target.value)}
          />
        )
      )}
    </div>
  );
};

FillInTheBlankAnswer.displayName = 'FillInTheBlankAnswer';

export const TeamQuestionPrompt = ({
  item
}: {
  item: Snapshot<{
    type: 'question';
    id: string;
    number: number;
    questionType: 'PG' | 'PS' | 'TF' | 'FB';
    maxPoints: number;
    phase: 'prompt';
    seconds: number;
    startTime: string | null;
    translations: Array<{ languageCode: string; prompt: string }>;
  }>;
}) => {
  const valt = useTeamValt();
  const { team } = valt.store;

  // Filter to only the team's selected language, fallback to first translation
  const translation = item.translations.find((t) => t.languageCode === team?.languageCode) || item.translations[0];

  return (
    <div className='absolute inset-0 flex flex-col text-base-100 gap-8 px-10'>
      <QuestionTimer startTime={item.startTime} seconds={item.seconds} />
      <div className='flex items-center gap-10 mt-10'>
        <img src={logo} className='h-28' />
        <h1 className='text-5xl uppercase text-center font-serif'>Question #{item.number}</h1>
      </div>
      {translation && item.questionType !== 'FB' && (
        <div className='text-2xl font-serif'>
          ({item.maxPoints} pts.) &nbsp;
          {translation.prompt}
        </div>
      )}
      <div>
        {(item.questionType === 'PG' || item.questionType === 'PS') && <GeneralAnswer />}
        {item.questionType === 'TF' && <TrueFalseAnswer />}
        {item.questionType === 'FB' && (
          <FillInTheBlankAnswer
            translations={item.translations}
            languageCode={team?.languageCode || null}
            maxPoints={item.maxPoints}
          />
        )}
      </div>
    </div>
  );
};

TeamQuestionPrompt.displayName = 'TeamQuestionPrompt';
