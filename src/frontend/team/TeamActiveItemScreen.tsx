import { Completed } from '@/frontend/components/ActiveItemScreens/Completed';
import { NotStarted } from '@/frontend/components/ActiveItemScreens/NotStarted';
import { Paused } from '@/frontend/components/ActiveItemScreens/Paused';
import { QuestionAnswer } from '@/frontend/components/ActiveItemScreens/QuestionAnswer';
import { QuestionReading } from '@/frontend/components/ActiveItemScreens/QuestionReading';
import { Slide } from '@/frontend/components/ActiveItemScreens/Slide';
import { useTeamValt } from '@/frontend/team/teamValt';
import { Title } from '@/frontend/components/ActiveItemScreens/Title';
import { useSnapshot } from 'valtio';
import { TeamQuestionPrompt } from '@/frontend/team/TeamQuestionPrompt';

export const TeamActiveItemScreen = () => {
  const valt = useTeamValt();
  const snap = useSnapshot(valt.store);

  const activeItem = snap.activeItem;

  if (snap.runStatus === 'not_started') {
    return <NotStarted />;
  }

  if (snap.runStatus === 'paused') {
    return <Paused />;
  }

  if (snap.runStatus === 'completed') {
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
    return <TeamQuestionPrompt item={activeItem} />;
  }

  if (activeItem?.type === 'question' && activeItem.phase === 'answer' && snap.languages) {
    return <QuestionAnswer item={activeItem} languages={snap.languages} />;
  }

  return null;
};

TeamActiveItemScreen.displayName = 'TeamActiveItemScreen';
