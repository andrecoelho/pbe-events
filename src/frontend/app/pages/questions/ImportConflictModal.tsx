import { modal } from '@/frontend/components/Modal';
import { useState } from 'react';
import type { ImportConflict, ImportOptions } from './questionsValt';

// Shown when an import answers 409: asks which file language the stranded teams move to and/or
// whether to erase the recorded answers. Resolves with the options to retry with, or null to cancel.
function ImportConflictModal(props: { conflict: ImportConflict; options: ImportOptions }) {
  const { missingLanguages, answerCount, fileLanguages } = props.conflict;
  const [teamLanguage, setTeamLanguage] = useState(props.options.teamLanguage ?? fileLanguages[0]?.code ?? '');

  const teamCount = missingLanguages.reduce((sum, language) => sum + language.teamCount, 0);
  const languageNames = missingLanguages.map((language) => `${language.name} (${language.code})`).join(', ');

  const handleCancel = () => importConflictModal.close(null);

  const handleImport = () =>
    importConflictModal.close({
      ...props.options,
      ...(missingLanguages.length > 0 && { teamLanguage }),
      ...(answerCount > 0 && { deleteAnswers: true })
    });

  return (
    <div className='modal-box'>
      <h3 className='font-bold text-lg mb-4'>Before importing</h3>

      {missingLanguages.length > 0 && (
        <fieldset className='fieldset mb-4'>
          <p className='mb-2'>
            {teamCount} {teamCount === 1 ? 'team uses' : 'teams use'} {languageNames}, which{' '}
            {missingLanguages.length === 1 ? "isn't" : "aren't"} in this file.
          </p>
          <label className='label' htmlFor='import-team-language'>
            Move {teamCount === 1 ? 'it' : 'them'} to
          </label>
          <select
            id='import-team-language'
            className='select w-full'
            value={teamLanguage}
            onChange={(e) => setTeamLanguage(e.target.value)}
          >
            {fileLanguages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.name} ({language.code})
              </option>
            ))}
          </select>
        </fieldset>
      )}

      {answerCount > 0 && (
        <div role='alert' className='alert alert-warning alert-soft mb-4'>
          <span>
            This event has {answerCount} recorded {answerCount === 1 ? 'answer' : 'answers'}. Importing will erase{' '}
            {answerCount === 1 ? 'it' : 'them'} and {answerCount === 1 ? 'its grade' : 'their grades'}.
          </span>
        </div>
      )}

      <div className='modal-action flex justify-between'>
        <button className='btn btn-secondary' onClick={handleCancel}>
          Cancel
        </button>
        <button className={answerCount > 0 ? 'btn btn-error' : 'btn btn-primary'} onClick={handleImport}>
          {answerCount > 0 ? 'Erase and import' : 'Import'}
        </button>
      </div>
    </div>
  );
}

ImportConflictModal.displayName = 'ImportConflictModal';

class ImportConflictModalManager {
  // Closing with Escape resolves undefined, which counts as cancel.
  async open(conflict: ImportConflict, options: ImportOptions) {
    return (
      (await modal.open<ImportOptions | null>(<ImportConflictModal conflict={conflict} options={options} />)) ?? null
    );
  }

  close(options: ImportOptions | null) {
    modal.close(options);
  }
}

export const importConflictModal = new ImportConflictModalManager();
