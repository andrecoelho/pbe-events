import { LanguagesValt, type Language } from '@/frontend/app/pages/languages/languagesValt';
import { toast } from '@/frontend/components/Toast';
import { confirmModal } from '@/frontend/components/ConfirmModal';
import { Icon } from '@/frontend/components/Icon';
import { useSnapshot } from 'valtio';
import { useState } from 'react';

interface Props {
  language?: Language;
  valt: LanguagesValt;
  isAddMode?: boolean;
  onCancelAdd?: () => void;
}

export function LanguageRow({ language, valt, isAddMode, onCancelAdd }: Props) {
  const snap = useSnapshot(valt.store);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [codeError, setCodeError] = useState('');
  const [nameError, setNameError] = useState('');

  const isEditing = language && snap.editingId === language.id;

  const handleEdit = () => {
    if (language) {
      valt.startEdit(language);
    }
  };

  const handleCancel = () => {
    valt.cancelEdit();
  };

  const handleSave = async () => {
    const result = await valt.saveEdit();

    if (!result.ok && result.error) {
      toast.show({ message: result.error, type: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!language) return;

    const confirmation = await confirmModal.open(
      `Are you sure you want to delete language "${language.name}"?` +
        `  This will delete all translations for this language.`
    );

    if (confirmation) {
      const result = await valt.deleteLanguage(language.id);

      if (!result.ok) {
        toast.show({ message: result.error || 'Failed to delete language', type: 'error' });
      }
    }
  };

  const handleAdd = async () => {
    // Reset errors
    setCodeError('');
    setNameError('');

    // Validate
    let hasError = false;

    if (!code.trim()) {
      setCodeError('Code is required');
      hasError = true;
    }

    if (!name.trim()) {
      setNameError('Name is required');
      hasError = true;
    }

    if (hasError) return;

    const result = await valt.addLanguage(code.trim(), name.trim());

    if (result.ok) {
      setCode('');
      setName('');
      setCodeError('');
      setNameError('');
      onCancelAdd?.();
    } else {
      toast.show({ message: result.error || 'Failed to add language', type: 'error' });
    }
  };

  const handleCancelAdd = () => {
    setCode('');
    setName('');
    setCodeError('');
    setNameError('');
    onCancelAdd?.();
  };

  // Add mode rendering
  if (isAddMode) {
    return (
      <>
        <div className='col-code col-border-bottom'>
          <input
            type='text'
            className={`input input-bordered input-sm w-full ${codeError ? 'input-error' : ''}`}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeError('');
            }}
            placeholder='en'
            maxLength={10}
            autoFocus
          />
          {codeError && <div className='text-error text-xs mt-0.5'>{codeError}</div>}
        </div>
        <div className='col-name col-border-bottom'>
          <input
            type='text'
            className={`input input-bordered input-sm w-full ${nameError ? 'input-error' : ''}`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError('');
            }}
            placeholder='English'
          />
          {nameError && <div className='text-error text-xs mt-0.5'>{nameError}</div>}
        </div>
        <div className='col-actions col-border-bottom flex gap-2 justify-center'>
          <button
            className='tooltip tooltip-neutral'
            data-tip='Save'
            onClick={handleAdd}
            aria-label='Save language'
          >
            <Icon name='check' className='text-success cursor-pointer hover:brightness-75' />
          </button>
          <button
            className='tooltip tooltip-neutral'
            data-tip='Cancel'
            onClick={handleCancelAdd}
            aria-label='Cancel'
          >
            <Icon name='x-mark' className='text-error cursor-pointer hover:brightness-75' />
          </button>
        </div>
      </>
    );
  }

  // Edit mode rendering
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

  // Display mode rendering
  if (!language) return null;

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
