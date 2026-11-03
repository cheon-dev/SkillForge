import { IonContent, IonPage, IonSpinner, IonText } from '@ionic/react';
import './AuthLoading.css';

const AuthLoading = () => (
  <IonPage>
    <IonContent fullscreen>
      <div className="auth-loading">
        <IonSpinner name="crescent" />
        <IonText color="medium">Checking your session...</IonText>
      </div>
    </IonContent>
  </IonPage>
);

export default AuthLoading;
