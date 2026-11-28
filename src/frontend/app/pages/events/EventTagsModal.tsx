import { MAX_TAG_LENGTH, MAX_TAGS, normalizeTag, normalizeTags, tagsProblem } from '@/eventTags';
import { Icon } from '@/frontend/components/Icon';
import { modal } from '@/frontend/components/Modal';
import { useState, type KeyboardEvent } from 'react';

interface Props {
  eventName: string;
  tags: readonly string[];
  // Tags used on the user's other events, offered as suggestions.
  suggestions: readonly string[];
}

// Edits an event's tags (#72): chips with a remove button, and a field that adds a tag on Enter or comma.
function EventTagsModal(props: Props) {
  const [tags, setTags] = useState<string[]>([...props.tags]);
  const [draft, setDraft] = useState('');
  // What Save would store: the chips plus whatever is still in the field.
  const pending = normalizeTags([...tags, draft]);
  const problem = tagsProblem(pending);
  const lowerTags = new Set(tags.map((t) => t.toLocaleLowerCase()));
  const suggestions = props.suggestions.filter((s) => !lowerTags.has(s.toLocaleLowerCase()));

  const addDraft = () => {
    if (normalizeTag(draft)) {
      setTags(normalizeTags([...tags, draft]));
    }

    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addDraft();
    } else if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  return (
    <div className='modal-box'>
      <h3 className='font-bold text-lg mb-1'>Tags</h3>
      <p className='text-sm text-base-content/70 mb-4'>
        For <span className='font-medium'>{props.eventName}</span>. Everyone on the event sees them. Up to {MAX_TAGS},
        like “Regional” or “2027”.
      </p>

      <div className='flex flex-wrap gap-2 mb-3 min-h-6'>
        {tags.length === 0 && <span className='text-sm text-base-content/50'>No tags yet.</span>}
        {tags.map((tag) => (
          <span key={tag} className='badge badge-neutral gap-1'>
            {tag}
            <button
              className='cursor-pointer opacity-70 hover:opacity-100'
              aria-label={`Remove tag ${tag}`}
              onClick={() => setTags(tags.filter((t) => t !== tag))}
            >
              <Icon name='x-mark' className='size-3' />
            </button>
          </span>
        ))}
      </div>

      <div className='join w-full'>
        <input
          type='text'
          className='input join-item flex-1'
          placeholder='Add a tag'
          aria-label='New tag'
          list='EventTagsModal__suggestions'
          maxLength={MAX_TAG_LENGTH + 10}
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <button className='btn join-item' onClick={addDraft} disabled={!normalizeTag(draft)}>
          Add
        </button>
      </div>
      <datalist id='EventTagsModal__suggestions'>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {problem && (
        <p role='alert' className='text-sm text-error mt-2'>
          {problem}
        </p>
      )}

      <div className='modal-action flex justify-between'>
        <button className='btn btn-secondary' onClick={() => eventTagsModal.close()}>
          Cancel
        </button>
        <button className='btn btn-primary' disabled={problem !== null} onClick={() => eventTagsModal.close(pending)}>
          Save
        </button>
      </div>
    </div>
  );
}

EventTagsModal.displayName = 'EventTagsModal';

class EventTagsModalManager {
  // The new tags, or null when cancelled.
  open = async (props: Props) => await modal.open<string[] | null>(<EventTagsModal {...props} />);

  close = (tags: string[] | null = null) => modal.close(tags);
}

export const eventTagsModal = new EventTagsModalManager();
