import { useState } from 'react';

export const useToast = () => {
  const [toast, setToast] = useState(null);

  const showToast = ({ title, description, variant }) => {
    setToast({ title, description, variant });

    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  return {
    toast,
    toastComponent: toast && (
      <div className={`p-4 rounded-md fixed bottom-4 right-4 shadow-lg ${toast.variant === 'destructive' ? 'bg-red-100 text-red-900' : 'bg-blue-100 text-blue-900'}`}>
        <p className="font-bold">{toast.title}</p>
        <p>{toast.description}</p>
      </div>
    ),
    toast,
  };
};
