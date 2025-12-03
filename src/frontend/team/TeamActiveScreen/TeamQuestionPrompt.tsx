import { QuestionTimer } from '@/frontend/components/ActiveItemScreens/QuestionTimer';
import { useTeamValt } from '@/frontend/team/teamValt';
import { debounce } from 'lodash';
import { useState, useEffect, useRef } from 'react';
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

  const handleAnswerChange = debounce((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    valt.submitAnswer(e.target.value);
  }, 1000);

  return (
    <div className='card bg-base-100 text-base-content'>
      <textarea
        className='w-full h-16 p-2 border rounded'
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

  useEffect(() => {
    // Don't overwrite local state if already set
    if (answer === null) {
      setAnswer(snap.answer ? JSON.parse(snap.answer as string) : null);
    }
  }, [snap.answer]);

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
            type='text'
            className='input input-bordered input-sm mx-1 w-40 inline-block text-xl'
            defaultValue={savedAnswers[part.index!] || ''}
            onChange={handleInputChange}
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
    <div className='absolute inset-0 flex flex-col gap-8 px-10'>
      <QuestionTimer active startTime={item.startTime} seconds={item.seconds} />
      <div className='flex items-center gap-10 mt-10'>
        <img src={logo} className='h-28' />
        <h1 className='text-5xl uppercase text-center text-base-100 font-serif'>Question #{item.number}</h1>
      </div>
      {translation && item.questionType !== 'FB' && (
        <div className='text-2xl font-serif text-base-100 leading-loose'>
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
