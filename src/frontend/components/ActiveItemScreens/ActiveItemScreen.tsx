import { Completed } from '@/frontend/components/ActiveItemScreens/Completed';
import { NotStarted } from '@/frontend/components/ActiveItemScreens/NotStarted';
import { Paused } from '@/frontend/components/ActiveItemScreens/Paused';
import { QuestionAnswer } from '@/frontend/components/ActiveItemScreens/QuestionAnswer';
import { QuestionPrompt } from '@/frontend/components/ActiveItemScreens/QuestionPrompt';
import { QuestionReading } from '@/frontend/components/ActiveItemScreens/QuestionReading';
import { Slide } from '@/frontend/components/ActiveItemScreens/Slide';
import { Title } from '@/frontend/components/ActiveItemScreens/Title';
import type { ActiveItem } from '@/types';
import { type Snapshot } from 'valtio';

export const ActiveItemScreen = (props: {
  runStatus: 'not_started' | 'in_progress' | 'paused' | 'completed';
  languages: Snapshot<Record<string, { id: string; code: string; name: string }>>;
  activeItem: Snapshot<ActiveItem> | null;
}) => {
  const activeItem = props.activeItem;

  if (props.runStatus === 'not_started') {
    return <NotStarted />;
  }

  if (props.runStatus === 'paused') {
    return <Paused />;
  }

  if (props.runStatus === 'completed') {
    return <Completed />;
  }

  if (activeItem?.type === 'title') {
    return <Title item={activeItem} />;
  }

  if (activeItem?.type === 'slide') {
    return <Slide item={activeItem} />;
  }

  if (activeItem?.type === 'question' && activeItem.phase === 'reading') {
    return <QuestionReading item={activeItem} />;
  }

  if (activeItem?.type === 'question' && activeItem.phase === 'prompt') {
    return <QuestionPrompt item={activeItem} />;
  }

  if (activeItem?.type === 'question' && activeItem.phase === 'answer') {
    return <QuestionAnswer item={activeItem} languages={props.languages} />;
  }

  return null;
};

ActiveItemScreen.displayName = 'ActiveItemScreen';
