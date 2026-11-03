import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import type { ReactNode } from 'react';
import './FormModal.css';

interface FormModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  onDismiss: () => void;
  onSubmit?: () => void;
  submitting?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  children: ReactNode;
}

/**
 * The shared shell for every add/edit dialog in the app.
 *
 * Pages that add or change information show it as read-only content and open
 * this modal for the form. The content area scrolls on its own so long forms
 * never push the Save button off a small screen, and the footer keeps Save and
 * Cancel reachable.
 */
const FormModal = ({
  isOpen,
  title,
  subtitle,
  onDismiss,
  onSubmit,
  submitting = false,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  children,
}: FormModalProps) => (
  <IonModal isOpen={isOpen} onDidDismiss={onDismiss} className="app-modal">
    <IonHeader className="app-modal__header">
      <IonToolbar>
        <IonTitle>{title}</IonTitle>
        <IonButtons slot="end">
          <IonButton fill="clear" onClick={onDismiss} aria-label="Close" disabled={submitting}>
            <IonIcon slot="icon-only" icon={closeOutline} />
          </IonButton>
        </IonButtons>
      </IonToolbar>
    </IonHeader>

    <IonContent className="app-modal__content">
      <div className="app-modal__body">
        {subtitle && <p className="student-page__card-note">{subtitle}</p>}
        {children}
      </div>
    </IonContent>

    <IonFooter className="app-modal__footer-bar">
      <IonToolbar>
        <div className="app-modal__footer">
          {onSubmit && (
            <IonButton onClick={onSubmit} disabled={submitting}>
              {submitting ? <IonSpinner name="crescent" /> : submitLabel}
            </IonButton>
          )}
          <IonButton fill="clear" onClick={onDismiss} disabled={submitting}>
            {onSubmit ? cancelLabel : 'Close'}
          </IonButton>
        </div>
      </IonToolbar>
    </IonFooter>
  </IonModal>
);

export default FormModal;
