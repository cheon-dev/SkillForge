import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import {
  arrowForwardOutline,
  chatbubblesOutline,
  gameControllerOutline,
  peopleOutline,
} from 'ionicons/icons';
import NotificationsButton from '../components/NotificationsButton';
import './Home.css';

const Home: React.FC = () => {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>SkillForge</IonTitle>
          <IonButtons slot="end"><NotificationsButton /></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="home-page">
        <IonHeader collapse="condense">
          <IonToolbar>
            <IonTitle size="large">SkillForge</IonTitle>
          </IonToolbar>
        </IonHeader>
        <main className="home-page__content">
          <section className="home-page__hero">
            <p className="home-page__eyebrow">PEER-POWERED GROWTH</p>
            <h1>Match. Learn. Build.</h1>
            <p>
              Find students who can help you grow, share what you know, and turn
              learning into proof through practice.
            </p>
            <IonButton expand="block" routerLink="/tabs/discover">
              Discover skills
              <IonIcon slot="end" icon={arrowForwardOutline} />
            </IonButton>
          </section>

          <article className="home-page__arena">
            <div>
              <p className="home-page__eyebrow">SKILL ARENA</p>
              <h2>Play. Duel. Climb.</h2>
              <p>
                Rapid-fire practice rounds and ranked one-on-one duels. Earn XP, build a
                streak, and climb the leaderboard.
              </p>
            </div>
            <IonButton expand="block" routerLink="/tabs/arena">
              Enter Arena
              <IonIcon slot="end" icon={gameControllerOutline} />
            </IonButton>
          </article>

          <IonList inset>
            <IonListHeader>
              <IonLabel>Continue your journey</IonLabel>
            </IonListHeader>
            <IonItem button detail routerLink="/tabs/self-paced">
              <IonLabel>
                <h2>Self-paced lessons</h2>
                <p>Study short guided lessons and save your progress.</p>
              </IonLabel>
            </IonItem>
            <IonItem button detail routerLink="/tabs/learning">
              <IonLabel>
                <h2>Learning sessions</h2>
                <p>Review sessions and keep your next step in sight.</p>
              </IonLabel>
            </IonItem>
            <IonItem button detail routerLink="/tabs/skill-passport">
              <IonLabel>
                <h2>Skill Passport</h2>
                <p>Track skills, challenges, achievements, and projects.</p>
              </IonLabel>
            </IonItem>
            <IonItem button detail routerLink="/tabs/analytics">
              <IonLabel>
                <h2>Learning analytics</h2>
                <p>See verified progress over time and by skill.</p>
              </IonLabel>
            </IonItem>
          </IonList>

          <IonList inset>
            <IonListHeader>
              <IonLabel>Workspace</IonLabel>
            </IonListHeader>
            <IonItem button detail routerLink="/tabs/messages">
              <IonIcon slot="start" icon={chatbubblesOutline} />
              <IonLabel>
                <h2>Messages</h2>
                <p>Connect with peers and learning partners.</p>
              </IonLabel>
            </IonItem>
            <IonItem button detail routerLink="/tabs/collaboration">
              <IonIcon slot="start" icon={peopleOutline} />
              <IonLabel>
                <h2>Collaboration</h2>
                <p>Build projects with complementary skills.</p>
              </IonLabel>
            </IonItem>
          </IonList>
        </main>
      </IonContent>
    </IonPage>
  );
};

export default Home;
