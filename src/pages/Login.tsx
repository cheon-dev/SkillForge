import { useState, type FormEvent } from 'react';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { eyeOffOutline, eyeOutline } from 'ionicons/icons';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import AuthLoading from '../components/AuthLoading';
import { getFriendlyAuthError, loginUser } from '../services/auth';
import { useAuth } from '../hooks/useAuth';
import './Auth.css';

const Login = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return <AuthLoading />;
  }

  if (isAuthenticated) {
    return <Navigate to="/tabs/home" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.');
      return;
    }

    setSubmitting(true);

    try {
      await loginUser(email.trim(), password);
      navigate('/tabs/home', { replace: true });
    } catch (authError) {
      setError(getFriendlyAuthError(authError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Sign In</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="auth-page__content">
        <main className="auth-page__shell">
          <section className="auth-page__brand">
            <h1>SkillForge</h1>
            <p>Continue building skills with your peers.</p>
          </section>

          <form className="auth-page__form" onSubmit={handleSubmit} noValidate>
            <IonItem className="app-form-field">
              <IonLabel position="stacked">Email</IonLabel>
              <IonInput fill="outline"
                type="email"
                value={email}
                autocomplete="email"
                onIonInput={(event) => setEmail(event.detail.value ?? '')}
              />
            </IonItem>
            <IonItem className="app-form-field">
              <IonLabel position="stacked">Password</IonLabel>
              <IonInput fill="outline"
                type={showPassword ? 'text' : 'password'}
                value={password}
                autocomplete="current-password"
                onIonInput={(event) => setPassword(event.detail.value ?? '')}
              />
              <IonButton
                slot="end"
                fill="clear"
                type="button"
                className="auth-page__password-toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                <IonIcon slot="icon-only" icon={showPassword ? eyeOffOutline : eyeOutline} />
              </IonButton>
            </IonItem>

            {error && (
              <IonText color="danger">
                <p className="auth-page__error">{error}</p>
              </IonText>
            )}

            <IonButton type="submit" expand="block" disabled={submitting}>
              {submitting ? <IonSpinner name="crescent" /> : 'Sign In'}
            </IonButton>
          </form>

          <p className="auth-page__footer">
            New to SkillForge? <Link to="/register">Create an account</Link>
          </p>
        </main>
      </IonContent>
    </IonPage>
  );
};

export default Login;
