import { IonButton, IonButtons, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { LiveKitRoom, RoomAudioRenderer, VideoConference } from '@livekit/components-react';
import type { LiveKitCallCredentials } from '../services/videoCalls';
import '@livekit/components-styles';
import './ConversationVideoCall.css';

interface ConversationVideoCallProps {
  isOpen: boolean;
  credentials: LiveKitCallCredentials | null;
  canEndForEveryone: boolean;
  ending: boolean;
  onClose: () => void;
  onEndForEveryone: () => void;
  onError: (message: string) => void;
}

const ConversationVideoCall = ({
  isOpen,
  credentials,
  canEndForEveryone,
  ending,
  onClose,
  onEndForEveryone,
  onError,
}: ConversationVideoCallProps) => (
  <IonModal
    isOpen={isOpen && credentials !== null}
    onDidDismiss={onClose}
    backdropDismiss={false}
    className="conversation-video-call-modal"
  >
    {credentials && (
      <LiveKitRoom
        serverUrl={credentials.server_url}
        token={credentials.token}
        connect={isOpen}
        audio
        video
        data-lk-theme="default"
        className="conversation-video-call"
        onDisconnected={onClose}
        onError={(error) => onError(error.message)}
      >
        <IonHeader>
          <IonToolbar>
            <IonTitle>Video call</IonTitle>
            <IonButtons slot="end">
              {canEndForEveryone && (
                <IonButton color="danger" onClick={onEndForEveryone} disabled={ending}>
                  {ending ? 'Ending…' : 'End for everyone'}
                </IonButton>
              )}
              <IonButton onClick={onClose}>Leave</IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <div className="conversation-video-call__conference">
          <VideoConference />
          <RoomAudioRenderer />
        </div>
      </LiveKitRoom>
    )}
  </IonModal>
);

export default ConversationVideoCall;
