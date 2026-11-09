import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { chevronBackOutline } from 'ionicons/icons';
import { useLocation } from 'react-router-dom';
import type { RealtimeChannel } from '@supabase/supabase-js';
import NotificationsButton from '../components/NotificationsButton';
import { useAuth } from '../hooks/useAuth';
import { toggleMessageReaction } from '../services/messageReactions';
import {
  getConversationMessages,
  getFriendlyStudentError,
  getMyConversations,
  getSupabaseRealtimeClient,
  markConversationRead,
  sendMessage,
  type ChatMessage,
  type ConversationSummary,
} from '../services/student';
import './Messages.css';

const reactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const timeLabel = (value: string): string =>
  new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));

const dayLabel = (value: string): string =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(value));

const conversationTitle = (conversation: ConversationSummary): string => {
  if (conversation.title) return conversation.title;
  if (conversation.kind === 'session') return 'Session chat';
  const names = conversation.members.map((member) => member.name);
  return names.length > 0 ? names.join(' & ') : 'Conversation';
};

const Messages = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingClearRef = useRef<number | null>(null);
  const openedRef = useRef<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    try {
      setConversations(await getMyConversations());
    } catch (loadError) {
      setError(getFriendlyStudentError(loadError, 'We could not load your conversations.'));
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      await loadConversations();
      if (mounted) setLoading(false);
    };
    void load();
    return () => { mounted = false; };
  }, [user, loadConversations]);

  const active = conversations.find((c) => c.conversation_id === activeId) ?? null;

  const displayNameRef = useRef<string>('Someone');
  useEffect(() => {
    displayNameRef.current = user?.user_metadata?.full_name || 'Someone';
  }, [user]);

  // Subscribe to live messages and typing for whichever thread is open.
  // Realtime is the primary path; a short poll keeps the thread fresh if the
  // socket drops. Typing is a transient broadcast event, so it needs no table.
  useEffect(() => {
    const client = getSupabaseRealtimeClient();
    if (!client || !activeId) {
      channelRef.current = null;
      return undefined;
    }

    const channel = client
      .channel(`messages:${activeId}`, { config: { broadcast: { self: false } } })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` },
        async () => {
          try {
            setMessages(await getConversationMessages(activeId));
            // The thread is open, so an arriving message counts as read. Without
            // this the sender would never see a "Seen" receipt until the reader
            // navigated away and back.
            await markConversationRead(activeId);
            await loadConversations();
          } catch {
            // a failed refresh should not break an open thread
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        async () => {
          try {
            setMessages(await getConversationMessages(activeId));
          } catch {
            // The chat refresh can retry on its normal polling interval.
          }
        },
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const typed = payload as { typing?: boolean; name?: string } | null;
        if (!typed) return;
        if (typingClearRef.current) window.clearTimeout(typingClearRef.current);
        if (!typed.typing) {
          setPeerTyping(null);
          return;
        }
        setPeerTyping(typed.name ?? 'Someone');
        // Clear if the peer stops typing or the socket drops mid-keystroke.
        typingClearRef.current = window.setTimeout(() => setPeerTyping(null), 3000);
      })
      .subscribe();

    channelRef.current = channel;

    const poll = window.setInterval(() => {
      void (async () => {
        try {
          setMessages(await getConversationMessages(activeId));
        } catch {
          // ignore transient failures
        }
      })();
    }, 15000);

    return () => {
      window.clearInterval(poll);
      if (typingClearRef.current) window.clearTimeout(typingClearRef.current);
      // Tell the peer we stopped typing before leaving the thread.
      void channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { typing: false, name: null },
      });
      void client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [activeId, loadConversations]);

  // Throttled so holding a key down does not flood the channel.
  const broadcastTyping = (typing: boolean) => {
    const channel = channelRef.current;
    if (!channel) return;
    const now = Date.now();
    if (typing && now - lastTypingSentRef.current < 1200) return;
    lastTypingSentRef.current = typing ? now : 0;
    void channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { typing, name: typing ? displayNameRef.current : null },
    });
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);
    broadcastTyping(value.trim().length > 0);
  };

  const backToList = useCallback(() => {
    openedRef.current = null;
    setActiveId(null);
    setMessages([]);
    setDraft('');
    setAttachment('');
    setPeerTyping(null);
    setError(null);
  }, []);

  // Returning to the Messages tab always starts at the inbox list.
  useEffect(() => {
    if (location.pathname === '/tabs/messages') backToList();
  }, [location.pathname, backToList]);

  const openConversation = useCallback(async (conversationId: string) => {
    setActiveId(conversationId);
    setLoadingThread(true);
    setError(null);
    try {
      setMessages(await getConversationMessages(conversationId));
      await markConversationRead(conversationId);
      await loadConversations();
    } catch (loadError) {
      setError(getFriendlyStudentError(loadError, 'We could not open that conversation.'));
    } finally {
      setLoadingThread(false);
    }
  }, [loadConversations]);

  // A "Message" button elsewhere arrives as /tabs/messages?open=<id> so the
  // user lands in that thread directly. The plain tab link has no param and
  // therefore always shows the inbox, which is what the tab is for.
  useEffect(() => {
    const target = new URLSearchParams(location.search).get('open');
    if (!target || !user || openedRef.current === target) return;
    openedRef.current = target;
    void openConversation(target);
  }, [location.search, user, openConversation]);

  const handleSend = async () => {
    if (!activeId || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(activeId, draft.trim(), attachment.trim());
      setDraft('');
      setAttachment('');
      broadcastTyping(false);
      setMessages(await getConversationMessages(activeId));
      await loadConversations();
    } catch (sendError) {
      setError(getFriendlyStudentError(sendError, 'Your message could not be sent.'));
    } finally {
      setSending(false);
    }
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = (messageId: string) => {
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      setReactionPickerMessageId(messageId);
      longPressTimerRef.current = null;
    }, 500);
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    setReactionPickerMessageId(null);
    setError(null);
    try {
      await toggleMessageReaction(messageId, emoji);
      if (activeId) setMessages(await getConversationMessages(activeId));
    } catch (reactionError) {
      setError(getFriendlyStudentError(reactionError, 'Your reaction could not be saved.'));
    }
  };

  useEffect(() => () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
    }
  }, []);

  const totalUnread = conversations.reduce((total, c) => total + c.unread_count, 0);

  return (
    <IonPage className="messages-page">
      <IonHeader>
        <IonToolbar>
          {active && (
            <IonButtons slot="start">
              <IonButton fill="clear" onClick={backToList} aria-label="Back to conversations">
                <IonIcon slot="start" icon={chevronBackOutline} />
                Back
              </IonButton>
            </IonButtons>
          )}
          <IonTitle>{active ? conversationTitle(active) : 'Messages'}</IonTitle>
          <IonButtons slot="end"><NotificationsButton /></IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="student-page">
        {error && (
          <div className="student-page__alert student-page__alert--error" role="alert">
            <IonText color="danger">{error}</IonText>
          </div>
        )}

        {loading && (
          <div className="student-page__empty"><IonSpinner name="crescent" /></div>
        )}

        {!loading && !active && (
          <IonList>
            <IonListHeader>
              <IonLabel>
                <h2>Your conversations</h2>
                <p>
                  {totalUnread > 0
                    ? `${totalUnread} unread message${totalUnread === 1 ? '' : 's'}`
                    : 'You are all caught up'}
                </p>
              </IonLabel>
            </IonListHeader>
            {conversations.length === 0 ? (
              <div className="student-page__empty">
                <IonText color="medium">
                  No conversations yet. Open a peer from Discover and choose Message, or use the
                  chat button on a learning session.
                </IonText>
                <IonButton fill="outline" routerLink="/tabs/discover">Find a peer</IonButton>
              </div>
            ) : (
              conversations.map((conversation) => (
                <IonItem
                  key={conversation.conversation_id}
                  button
                  detail
                  onClick={() => void openConversation(conversation.conversation_id)}
                >
                  <div className="messages-page__conversation-avatars" slot="start" aria-hidden="true">
                    {conversation.members.slice(0, 3).map((member) => (
                      <span className="messages-page__conversation-avatar" key={member.id}>
                        {member.avatar_url
                          ? <img src={member.avatar_url} alt="" />
                          : member.name.charAt(0).toUpperCase()}
                      </span>
                    ))}
                  </div>
                  <IonLabel>
                    <h2>{conversationTitle(conversation)}</h2>
                    <p>
                      {conversation.last_message_body ?? 'No messages yet'}
                    </p>
                    {conversation.last_message_at && (
                      <p className="messages-page__meta">
                        {dayLabel(conversation.last_message_at)} · {timeLabel(conversation.last_message_at)}
                      </p>
                    )}
                  </IonLabel>
                  {conversation.unread_count > 0 && (
                    <IonBadge slot="end" color="danger">{conversation.unread_count}</IonBadge>
                  )}
                </IonItem>
              ))
            )}
          </IonList>
        )}

        {active && (
          <div className="messages-page__thread">
            {loadingThread && <IonSpinner name="crescent" />}
            {!loadingThread && messages.length === 0 && (
              <div className="student-page__empty">
                <IonText color="medium">No messages yet. Say hello.</IonText>
              </div>
            )}
            {messages.map((message, index) => {
              const isLastMine = message.is_mine
                && !messages.slice(index + 1).some((m) => m.is_mine);
              return (
                <article
                  key={message.id}
                  className={`messages-page__bubble${message.is_mine ? ' messages-page__bubble--mine' : ''}`}
                  onPointerDown={() => startLongPress(message.id)}
                  onPointerUp={clearLongPressTimer}
                  onPointerLeave={clearLongPressTimer}
                  onPointerCancel={clearLongPressTimer}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setReactionPickerMessageId(message.id);
                    clearLongPressTimer();
                  }}
                >
                  {!message.is_mine && (
                    <span className="messages-page__sender">
                      {message.sender_avatar_url && <img src={message.sender_avatar_url} alt="" />}
                      {message.sender_name}
                    </span>
                  )}
                  <p>{message.body}</p>
                  {message.attachment_url && (
                    <a href={message.attachment_url} target="_blank" rel="noreferrer">Shared link</a>
                  )}
                  {reactionPickerMessageId === message.id && (
                    <div
                      className="messages-page__reaction-picker"
                      role="group"
                      aria-label="Choose a reaction"
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      {reactionEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          aria-label={`React with ${emoji}`}
                          onClick={() => void handleReaction(message.id, emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        type="button"
                        aria-label="Close reaction picker"
                        onClick={() => setReactionPickerMessageId(null)}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <div className="messages-page__reaction-row">
                    {message.reactions.map((reaction) => (
                      <button
                        type="button"
                        key={reaction.emoji}
                        className={`messages-page__reaction${reaction.reacted_by_me ? ' messages-page__reaction--mine' : ''}`}
                        aria-label={`${reaction.emoji}, ${reaction.count} reaction${reaction.count === 1 ? '' : 's'}${reaction.reacted_by_me ? ', you reacted' : ''}`}
                        onClick={() => void handleReaction(message.id, reaction.emoji)}
                      >
                        <span>{reaction.emoji}</span>
                        <span>{reaction.count}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="messages-page__react-button"
                      aria-label="React to message"
                      onClick={() => setReactionPickerMessageId((current) => current === message.id ? null : message.id)}
                    >
                      +
                    </button>
                  </div>
                  <span className="messages-page__time">
                    {timeLabel(message.created_at)}
                    {isLastMine && (
                      <span className="messages-page__receipt">
                        {message.seen_by_peer ? ' · Seen' : ' · Delivered'}
                      </span>
                    )}
                  </span>
                </article>
              );
            })}

            {peerTyping && (
              <article className="messages-page__bubble messages-page__bubble--typing">
                <span className="messages-page__sender">{peerTyping}</span>
                <span className="messages-page__typing-dots" aria-label={`${peerTyping} is typing`}>
                  <i /><i /><i />
                </span>
              </article>
            )}
          </div>
        )}
      </IonContent>

      {active && (
        <IonFooter>
          <IonToolbar>
            <div className="messages-page__composer">
              <IonTextarea
                autoGrow
                rows={1}
                value={draft}
                placeholder="Write a message"
                onIonInput={(event) => handleDraftChange(event.detail.value ?? '')}
              />
              <IonInput
                value={attachment}
                placeholder="Link (optional)"
                onIonInput={(event) => setAttachment(event.detail.value ?? '')}
              />
              <IonButton onClick={() => void handleSend()} disabled={sending || !draft.trim()}>
                {sending ? <IonSpinner name="crescent" /> : 'Send'}
              </IonButton>
            </div>
          </IonToolbar>
        </IonFooter>
      )}
    </IonPage>
  );
};

export default Messages;
