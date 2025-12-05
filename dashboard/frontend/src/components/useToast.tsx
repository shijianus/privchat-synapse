import { useCallback } from 'react';

type ToastVariant = 'success' | 'error' | 'info';

// 简单的 alert/toast 占位实现，可按需替换成全局通知系统
export const useToast = () => {
  const addToast = useCallback((message: string, variant: ToastVariant = 'info') => {
     
    alert(`${variant.toUpperCase()}: ${message}`);
  }, []);

  return { addToast };
};

