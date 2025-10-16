import { Icon } from '@/frontend/components/Icon';
import { modal } from '@/frontend/components/Modal';

interface Props {
  name?: string;
}

function PermissionsModal(props: Props) {
  const handleCancel = () => permissionsModal.close();

  return (
    <div className='modal-box'>
      <h3 className='font-bold text-lg mb-4'>{props.name ? 'Edit User' : 'Add User'}</h3>
      <label className='input w-full'>
        <Icon name='magnifying-glass' className='size-4 text-stone-400' />
        <input
          type='search'
          name='email'
          autoComplete='off'
          className='placeholder:text-stone-400'
          placeholder='Email search'
        />
      </label>
      <div className='modal-action flex justify-between'>
        <button className='btn btn-secondary' onClick={handleCancel}>
          Cancel
        </button>
        <button className='btn btn-primary' disabled>
          Save
        </button>
      </div>
    </div>
  );
}

PermissionsModal.displayName = 'PermissionsModal';

class PermissionsModalManager {
  open = async (name?: string) => {
    return await modal.open<string | null>(<PermissionsModal name={name} />);
  };

  close = (name: string | null = null) => {
    modal.close(name);
  };
}

export const permissionsModal = new PermissionsModalManager();
