import { LanguagesValt } from '@/frontend/app/pages/languages/languagesValt';
import { showToast } from '@/frontend/app/pages/languages/showToast';
import { Icon } from '@/frontend/components/Icon';
import { useState } from 'react';

interface Props {
  valt: LanguagesValt;
}

export function AddLanguageRow({ valt }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [codeError, setCodeError] = useState('');
  const [nameError, setNameError] = useState('');
  const [isAdding, setIsAdding] = useState(false);

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

    const result = await valt.addLanguage(code, name);

    if (result.ok) {
      setCode('');
      setName('');
      setIsAdding(false);
    } else {
      showToast(result.error || 'Failed to add language');
    }
  };

  const handleCancel = () => {
    setCode('');
    setName('');
    setCodeError('');
    setNameError('');
    setIsAdding(false);
  };

  if (!isAdding) {
    return (
      <>
        <div className='col-add-button col-span-3 text-right'>
          <button className='btn btn-primary' onClick={() => setIsAdding(true)}>
            <Icon name='plus' className='size-4' />
            Add Language
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className='col-code col-add-row'>
        <input
          type='text'
          className={`input input-bordered w-full h-8 ${codeError ? 'input-error' : ''}`}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setCodeError('');
          }}
          placeholder='en'
        />
        {codeError && <div className='text-error text-xs mt-0.5'>{codeError}</div>}
      </div>
      <div className='col-name col-add-row'>
        <input
          type='text'
          className={`input input-bordered w-full h-8 ${nameError ? 'input-error' : ''}`}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError('');
          }}
          placeholder='English'
        />
        {nameError && <div className='text-error text-xs mt-0.5'>{nameError}</div>}
      </div>
      <div className='col-actions col-add-row'>
        <button className='tooltip tooltip-neutral' data-tip='Cancel' onClick={handleCancel} aria-label='Cancel add'>
          <Icon name='x-mark' className='text-secondary cursor-pointer hover:brightness-75' />
        </button>
        <button className='tooltip tooltip-neutral' data-tip='Add' onClick={handleAdd} aria-label='Add language'>
          <Icon name='check' className='text-primary cursor-pointer hover:brightness-75' />
        </button>
      </div>
    </>
  );
}

AddLanguageRow.displayName = 'AddLanguageRow';
