import { Navigate, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import AuthProvider from './hooks/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './layouts/AppShell';
import Arena from './pages/Arena';
import Collaboration from './pages/Collaboration';
import Admin from './pages/Admin';
import Analytics from './pages/Analytics';
import Challenges from './pages/Challenges';
import Discover from './pages/Discover';
import Endorsements from './pages/Endorsements';
import Home from './pages/Home';
import Learning from './pages/Learning';
import Messages from './pages/Messages';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import SkillPassport from './pages/SkillPassport';
import SelfPaced from './pages/SelfPaced';
import Login from './pages/Login';
import Register from './pages/Register';
import { ThemeProvider } from './theme/ThemeProvider';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* SkillForge uses a consistent light palette across system themes. */

/* Theme variables */
import './theme/variables.css';
import './theme/app.css';

setupIonicReact();

const ProtectedApplication = () => (
  <ProtectedRoute>
    <AppShell>
      <Route path="home" element={<Home />} />
      <Route path="discover" element={<Discover />} />
      <Route path="learning" element={<Learning />} />
      <Route path="self-paced" element={<SelfPaced />} />
      <Route path="arena" element={<Arena />} />
      <Route path="challenges" element={<Challenges />} />
      <Route path="skill-passport" element={<SkillPassport />} />
      <Route path="analytics" element={<Analytics />} />
      <Route path="endorsements" element={<Endorsements />} />
      <Route path="collaboration" element={<Collaboration />} />
      <Route path="messages" element={<Messages />} />
      <Route path="notifications" element={<Notifications />} />
      <Route path="profile" element={<Profile />} />
      <Route path="settings" element={<Settings />} />
      <Route path="admin" element={<Admin />} />
      <Route index element={<Navigate to="home" replace />} />
    </AppShell>
  </ProtectedRoute>
);

const App: React.FC = () => (
  <ThemeProvider>
    <AuthProvider>
      <IonApp>
        <IonReactRouter>
          <IonRouterOutlet>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/tabs/*" element={<ProtectedApplication />} />
            <Route path="/" element={<Navigate to="/tabs/home" replace />} />
            <Route path="*" element={<Navigate to="/tabs/home" replace />} />
          </IonRouterOutlet>
        </IonReactRouter>
      </IonApp>
    </AuthProvider>
  </ThemeProvider>
);

export default App;
