import { LanguagesValt, type Language } from '@/frontend/app/pages/languages/languagesValt';
import { showToast } from '@/frontend/app/pages/languages/showToast';
import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { useSnapshot } from 'valtio';

interface Props {
  language: Language;
  valt: LanguagesValt;
}

export function LanguageRow({ language, valt }: Props) {
  const snap = useSnapshot(valt.store);
  const isEditing = snap.editingId === language.id;

  const handleEdit = () => {
    valt.startEdit(language);
  };

  const handleCancel = () => {
    valt.cancelEdit();
  };

  const handleSave = async () => {
    const result = await valt.saveEdit();

    if (!result.ok && result.error) {
      showToast(result.error);
    }
  };

  const handleDelete = async () => {
    const confirmation = await confirmModal.open(
      `Are you sure you want to delete language "${language.name}"?` +
        `  This will delete all translations for this language.`
    );

    if (confirmation) {
      const result = await valt.deleteLanguage(language.id);

      if (!result.ok) {
        showToast(result.error || 'Failed to delete language');
      }
    }
  };

  if (isEditing) {
    return (
      <>
        <div className='col-code'>
          <input
            type='text'
            className={`input input-bordered w-full h-8 ${snap.errors.code ? 'input-error' : ''}`}
            value={snap.editForm.code}
            onChange={(e) => valt.updateEditForm('code', e.target.value)}
            placeholder='en'
          />
          {snap.errors.code && <div className='text-error text-xs mt-0.5'>{snap.errors.code}</div>}
        </div>
        <div className='col-name'>
          <input
            type='text'
            className={`input input-bordered w-full h-8 ${snap.errors.name ? 'input-error' : ''}`}
            value={snap.editForm.name}
            onChange={(e) => valt.updateEditForm('name', e.target.value)}
            placeholder='English'
          />
          {snap.errors.name && <div className='text-error text-xs mt-0.5'>{snap.errors.name}</div>}
        </div>
        <div className='col-actions'>
          <button className='tooltip tooltip-neutral' data-tip='Cancel' onClick={handleCancel} aria-label='Cancel edit'>
            <Icon name='x-mark' className='text-secondary cursor-pointer hover:brightness-75' />
          </button>
          <button className='tooltip tooltip-neutral' data-tip='Save' onClick={handleSave} aria-label='Save changes'>
            <Icon name='check' className='text-primary cursor-pointer hover:brightness-75' />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className='col-code'>{language.code}</div>
      <div className='col-name'>{language.name}</div>
      <div className='col-actions'>
        <button
          className='tooltip tooltip-neutral'
          data-tip='Edit'
          onClick={handleEdit}
          aria-label={`Edit language ${language.name}`}
        >
          <Icon name='pencil-square' className='text-accent cursor-pointer hover:brightness-75' />
        </button>
        <button
          className='tooltip tooltip-neutral'
          data-tip='Delete'
          onClick={handleDelete}
          aria-label={`Delete language ${language.name}`}
        >
          <Icon name='trash' className='text-error cursor-pointer hover:brightness-75' />
        </button>
      </div>
    </>
  );
}

LanguageRow.displayName = 'LanguageRow';
