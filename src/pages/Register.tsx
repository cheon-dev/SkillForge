import { useState, type FormEvent } from 'react';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthLoading from '../components/AuthLoading';
import { getFriendlyAuthError, registerUser } from '../services/auth';
import { useAuth } from '../hooks/useAuth';
import './Auth.css';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Register = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    setNotice(null);

    if (!fullName.trim()) {
      setError('Enter your full name.');
      return;
    }

    if (!emailPattern.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }

    if (!password) {
      setError('Create a password.');
      return;
    }

    if (password.length < 6) {
      setError('Your password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      const result = await registerUser(fullName, email.trim(), password);

      if (result.requiresEmailConfirmation) {
        setNotice('Account created. Check your email to confirm your address before signing in.');
      } else {
        navigate('/tabs/home', { replace: true });
      }
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
          <IonTitle>Create Account</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="auth-page__content">
        <main className="auth-page__shell">
          <section className="auth-page__brand">
            <h1>Join SkillForge</h1>
            <p>Learn from peers, practice your skills, and grow together.</p>
          </section>

          <form className="auth-page__form" onSubmit={handleSubmit} noValidate>
            <IonItem className="app-form-field">
              <IonLabel position="stacked">Full name</IonLabel>
              <IonInput fill="outline"
                type="text"
                value={fullName}
                autocomplete="name"
                onIonInput={(event) => setFullName(event.detail.value ?? '')}
              />
            </IonItem>
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
                type="password"
                value={password}
                autocomplete="new-password"
                onIonInput={(event) => setPassword(event.detail.value ?? '')}
              />
            </IonItem>
            <IonItem className="app-form-field">
              <IonLabel position="stacked">Confirm password</IonLabel>
              <IonInput fill="outline"
                type="password"
                value={confirmPassword}
                autocomplete="new-password"
                onIonInput={(event) => setConfirmPassword(event.detail.value ?? '')}
              />
            </IonItem>

            {error && (
              <IonText color="danger">
                <p className="auth-page__error">{error}</p>
              </IonText>
            )}
            {notice && (
              <IonText color="success">
                <p className="auth-page__notice">{notice}</p>
              </IonText>
            )}

            <IonButton type="submit" expand="block" disabled={submitting}>
              {submitting ? <IonSpinner name="crescent" /> : 'Create Account'}
            </IonButton>
          </form>

          <p className="auth-page__footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </main>
      </IonContent>
    </IonPage>
  );
};

export default Register;
