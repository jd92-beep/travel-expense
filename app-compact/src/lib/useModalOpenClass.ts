import { useEffect } from 'react';

let modalCount = 0;

export function useModalOpenClass(isOpen: boolean) {
  useEffect(() => {
    if (isOpen) {
      modalCount++;
      document.documentElement.classList.add('modal-open');
    }
    return () => {
      if (isOpen) {
        modalCount--;
        if (modalCount <= 0) {
          modalCount = 0;
          document.documentElement.classList.remove('modal-open');
        }
      }
    };
  }, [isOpen]);
}
