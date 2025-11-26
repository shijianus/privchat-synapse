import React from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input } from '../components/ui';

interface MediaPolicyForm {
  retentionDays: number;
  enableDeduplication: boolean;
  maxFileSizeMb: number;
  enforceFriendVerification: boolean;
}

const SettingsPage: React.FC = () => {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
    reset,
  } = useForm<MediaPolicyForm>({
    defaultValues: {
      retentionDays: 30,
      enableDeduplication: true,
      maxFileSizeMb: 50,
      enforceFriendVerification: true,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    console.info('Saving dashboard policy', values);
    await new Promise((resolve) => setTimeout(resolve, 600));
    reset(values);
  });

  return (
    <div className="space-y-8">
      <section className="bg-white rounded-lg shadow border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Media Storage Policy</h2>
          <p className="mt-1 text-sm text-gray-500">
            Controls text retention, thumbnail storage, and metadata-only modes per REQUEST.md §VI.
          </p>
        </div>
        <form className="px-6 py-6 space-y-6" onSubmit={onSubmit}>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Input
              type="number"
              min={1}
              label="Retention days for thumbnails"
              {...register('retentionDays', { valueAsNumber: true })}
            />
            <Input
              type="number"
              min={1}
              label="Max file size (MB) before offloading"
              {...register('maxFileSizeMb', { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-4">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                className="h-4 w-4 text-primary-600 rounded border-gray-300"
                {...register('enableDeduplication')}
              />
              <span className="text-sm text-gray-700">
                Enable deduplication before pushing to object storage
              </span>
            </label>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                className="h-4 w-4 text-primary-600 rounded border-gray-300"
                {...register('enforceFriendVerification')}
              />
              <span className="text-sm text-gray-700">
                Require friend verification challenge for 2FA recovery
              </span>
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={isSubmitting}>
              Save Policy
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default SettingsPage;
