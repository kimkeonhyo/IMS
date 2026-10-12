import { useToastStore } from '../../store/toast.store';

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();
  if (!toasts.length) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg text-sm text-white ${
            t.type === 'error' ? 'bg-red-600' : 'bg-green-600'
          }`}
        >
          <span className="text-base leading-none mt-0.5">{t.type === 'error' ? '⚠️' : '✅'}</span>
          <span className="flex-1 leading-snug">{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="opacity-70 hover:opacity-100 text-lg leading-none cursor-pointer">×</button>
        </div>
      ))}
    </div>
  );
}
