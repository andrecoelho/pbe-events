import { Completed } from '@/frontend/components/ActiveItemScreens/Completed';
import { NotStarted } from '@/frontend/components/ActiveItemScreens/NotStarted';
import { Paused } from '@/frontend/components/ActiveItemScreens/Paused';
import { Slide } from '@/frontend/components/ActiveItemScreens/Slide';
import { useTeamValt } from '@/frontend/team/teamValt';
import { Title } from '@/frontend/components/ActiveItemScreens/Title';
import { useSnapshot } from 'valtio';
import { TeamQuestionPrompt } from '@/frontend/team/TeamActiveScreen/TeamQuestionPrompt';
import { TeamQuestionReading } from '@/frontend/team/TeamActiveScreen/TeamQuestionReading';
import { TeamQuestionAnswer } from '@/frontend/team/TeamActiveScreen/TeamQuestionAnswer';

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
    return <TeamQuestionReading item={activeItem} />;
  }

  if (activeItem?.type === 'question' && activeItem.phase === 'prompt') {
    return <TeamQuestionPrompt item={activeItem} />;
  }

  if (activeItem?.type === 'question' && activeItem.phase === 'answer' && snap.languages) {
    return <TeamQuestionAnswer item={activeItem} languages={snap.languages} />;
  }

  return null;
};

TeamActiveItemScreen.displayName = 'TeamActiveItemScreen';
