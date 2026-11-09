import { useState, type FormEvent } from 'react';
import {
  IonButton,
  IonContent,
  IonCheckbox,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonModal,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { eyeOffOutline, eyeOutline } from 'ionicons/icons';
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
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

    if (!termsAccepted) {
      setError('Please read and accept the Terms and Conditions to create an account.');
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
              <IonInput
                type="text"
                value={fullName}
                autocomplete="name"
                onIonInput={(event) => setFullName(event.detail.value ?? '')}
              />
            </IonItem>
            <IonItem className="app-form-field">
              <IonLabel position="stacked">Email</IonLabel>
              <IonInput
                type="email"
                value={email}
                autocomplete="email"
                onIonInput={(event) => setEmail(event.detail.value ?? '')}
              />
            </IonItem>
            <IonItem className="app-form-field">
              <IonLabel position="stacked">Password</IonLabel>
              <IonInput
                type={showPassword ? 'text' : 'password'}
                value={password}
                autocomplete="new-password"
                onIonInput={(event) => setPassword(event.detail.value ?? '')}
              >
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
              </IonInput>
            </IonItem>
            <IonItem className="app-form-field">
              <IonLabel position="stacked">Confirm password</IonLabel>
              <IonInput
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                autocomplete="new-password"
                onIonInput={(event) => setConfirmPassword(event.detail.value ?? '')}
              >
                <IonButton
                  slot="end"
                  fill="clear"
                  type="button"
                  className="auth-page__password-toggle"
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  aria-pressed={showConfirmPassword}
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                >
                  <IonIcon slot="icon-only" icon={showConfirmPassword ? eyeOffOutline : eyeOutline} />
                </IonButton>
              </IonInput>
            </IonItem>

            <IonItem lines="none" className="auth-page__terms">
              <IonCheckbox
                slot="start"
                checked={termsAccepted}
                aria-label="Agree to Terms and Conditions"
                onIonChange={(event) => setTermsAccepted(event.detail.checked)}
              />
              <IonLabel>
                I agree to the{' '}
                <button
                  type="button"
                  className="auth-page__terms-link"
                  onClick={() => setTermsOpen(true)}
                >
                  Terms and Conditions
                </button>
                .
              </IonLabel>
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
        <IonModal isOpen={termsOpen} onDidDismiss={() => setTermsOpen(false)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>Terms and Conditions</IonTitle>
            </IonToolbar>
          </IonHeader>
          <IonContent className="auth-page__terms-content">
            <article className="auth-page__terms-document">
              <p>
                By creating an account, you agree to use SkillForge for learning,
                teaching, skill practice, and collaboration in a lawful and respectful way.
              </p>
              <h2>Account use</h2>
              <p>
                Provide accurate account information, keep your sign-in credentials private,
                and take responsibility for activity performed through your account. You must
                be permitted to use the service under the rules that apply where you live.
              </p>
              <h2>Respectful participation</h2>
              <p>
                Do not harass, threaten, impersonate, discriminate against, or exploit other
                users. Do not post unlawful, deceptive, or harmful content. SkillForge may
                review reports and restrict accounts or content that violate these terms or
                put the community at risk.
              </p>
              <h2>Learning content and submissions</h2>
              <p>
                You retain responsibility for content you submit and must have the rights
                needed to share it. You give SkillForge permission to host and display that
                content as needed to operate learning, review, and collaboration features.
                Peer feedback and learning materials are educational aids, not guarantees of
                accuracy, qualifications, or outcomes.
              </p>
              <h2>In-app rewards</h2>
              <p>
                XP, achievements, and Skill Exchange Credits are in-app features only. They
                have no cash value and are not money or a promise of payment.
              </p>
              <h2>Service and changes</h2>
              <p>
                Features may change or be unavailable, and SkillForge may update these terms.
                Continued use after an update means you accept the revised terms. If you do
                not agree, do not create or continue using an account.
              </p>
              <p>
                These terms are a general summary for this student learning app and are not
                legal advice. The service operator should review them for applicable legal
                requirements before relying on them as a formal agreement.
              </p>
            </article>
            <div className="auth-page__terms-actions">
              <IonButton onClick={() => setTermsOpen(false)}>Close</IonButton>
            </div>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default Register;
