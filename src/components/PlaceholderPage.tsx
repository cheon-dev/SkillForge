import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import type { ReactNode } from 'react';
import NotificationsButton from './NotificationsButton';
import './PlaceholderPage.css';

export interface PlaceholderLink {
  label: string;
  description: string;
  href: string;
}

interface PlaceholderPageProps {
  title: string;
  description: string;
  links?: PlaceholderLink[];
  children?: ReactNode;
}

const PlaceholderPage = ({ title, description, links = [], children }: PlaceholderPageProps) => (
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>{title}</IonTitle>
        <IonButtons slot="end"><NotificationsButton /></IonButtons>
      </IonToolbar>
    </IonHeader>
    <IonContent className="placeholder-page">
      <div className="placeholder-page__content">
        <p className="placeholder-page__eyebrow">SKILLFORGE</p>
        <h1>{title}</h1>
        <p className="placeholder-page__description">{description}</p>
        <IonButton fill="outline" routerLink="/tabs/home">
          Back to Home
        </IonButton>
        {links.length > 0 && (
          <IonList inset>
            <IonListHeader>
              <IonLabel>Related areas</IonLabel>
            </IonListHeader>
            {links.map((link) => (
              <IonItem key={link.href} button detail routerLink={link.href}>
                <IonLabel>
                  <h2>{link.label}</h2>
                  <p>{link.description}</p>
                </IonLabel>
              </IonItem>
            ))}
          </IonList>
        )}
        {children}
      </div>
    </IonContent>
  </IonPage>
);

export default PlaceholderPage;
