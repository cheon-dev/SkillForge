import { useCallback } from 'react';
import { useIonAlert } from '@ionic/react';

interface ConfirmOptions {
  header: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

export const useConfirm = () => {
  const [presentAlert] = useIonAlert();

  return useCallback(({
    header,
    message,
    confirmText = 'Continue',
    cancelText = 'Cancel',
    destructive = false,
  }: ConfirmOptions): Promise<boolean> => new Promise((resolve) => {
    let settled = false;
    const finish = (confirmed: boolean) => {
      if (settled) return;
      settled = true;
      resolve(confirmed);
    };

    void presentAlert({
      header,
      message,
      cssClass: 'app-confirm-alert',
      backdropDismiss: false,
      buttons: [
        { text: cancelText, role: 'cancel', handler: () => finish(false) },
        {
          text: confirmText,
          role: destructive ? 'destructive' : undefined,
          handler: () => finish(true),
        },
      ],
      onDidDismiss: () => finish(false),
    }).catch((error: unknown) => {
      console.error('Could not present the confirmation dialog.', error);
      finish(false);
    });
  }), [presentAlert]);
};
