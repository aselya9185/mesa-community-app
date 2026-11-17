'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Avatar } from './Avatar';
import styles from './chat.module.css';

export type Person = { name: string; photo: string | null };
export type ChatMessage = { id: string; sender_id: string | null; kind: 'user' | 'system'; event: string | null; body: string; created_at: string };

const COLUMNS = 'id, sender_id, kind, event, body, created_at';

export function ChatPanel({
  planId,
  meId,
  initial,
  people: initialPeople,
  goingCount,
  status,
  canPost,
  closedNote,
  children,
}: {
  planId: string;
  meId: string;
  initial: ChatMessage[];
  people: Record<string, Person>;
  goingCount: number;
  status: string | null;
  canPost: boolean;
  closedNote?: string;
  children?: React.ReactNode;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [people, setPeople] = useState<Record<string, Person>>(initialPeople);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const router = useRouter();
  const knownIds = useRef(new Set(initial.map((m) => m.id)));
  const lastRefresh = useRef(0);

  // joins, leaves, edits, the +1 and cancellations all arrive as system messages: when one does, the plan page beside
  // the chat (who is going, the +1 card, the cancelled banner) is out of date, so refresh it in place
  const pendingRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshPlan = useCallback(() => {
    // at most one refresh every 2 seconds, but never drop one: a change that arrives too soon waits its turn
    const wait = 2000 - (Date.now() - lastRefresh.current);
    if (wait > 0) {
      if (!pendingRefresh.current) {
        pendingRefresh.current = setTimeout(() => {
          pendingRefresh.current = null;
          lastRefresh.current = Date.now();
          router.refresh();
        }, wait);
      }
      return;
    }
    lastRefresh.current = Date.now();
    router.refresh();
  }, [router]);
  useEffect(() => () => { if (pendingRefresh.current) clearTimeout(pendingRefresh.current); }, []);

  const add = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (fresh.length === 0) return prev;
      return [...prev, ...fresh].sort((a, b) => (a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at)));
    });
  }, []);

  // people who wrote before we looked (they may have left since): fetch their name and photo
  const learnPeople = useCallback(async (ids: string[]) => {
    const missing = ids.filter((id) => id && !people[id]);
    if (missing.length === 0) return;
    const sb = supabaseBrowser();
    const { data } = await sb.from('profiles').select('id, name, photo_path').in('id', missing);
    if (!data?.length) return;
    const paths = data.map((p: { photo_path: string | null }) => p.photo_path).filter((x: string | null): x is string => !!x);
    const signed = paths.length ? (await sb.storage.from('avatars').createSignedUrls(paths, 3600)).data ?? [] : [];
    const urlFor = new Map<string, string>(signed.map((r: { path: string | null; signedUrl: string }) => [r.path ?? '', r.signedUrl]));
    setPeople((prev) => ({
      ...prev,
      ...Object.fromEntries(data.map((p: { id: string; name: string; photo_path: string | null }) => [p.id, { name: p.name, photo: p.photo_path ? (urlFor.get(p.photo_path) ?? null) : null }])),
    }));
  }, [people]);

  const markRead = useCallback(() => {
    if (document.visibilityState === 'visible') void supabaseBrowser().rpc('mark_read', { p_plan: planId });
  }, [planId]);

  // live: new messages arrive as they are written. RLS decides whether she may receive them.
  useEffect(() => {
    const sb = supabaseBrowser();
    let channel: ReturnType<typeof sb.channel> | undefined;
    let cancelled = false;
    const refetch = async () => {
      const { data } = await sb.from('plan_messages').select(COLUMNS).eq('plan_id', planId).order('created_at', { ascending: false }).limit(100);
      if (data) {
        add(data as ChatMessage[]);
        void learnPeople((data as ChatMessage[]).map((m) => m.sender_id ?? '').filter(Boolean));
      }
    };
    (async () => {
      // realtime must listen as HER (her token), not as an anonymous visitor, or the database would hide every row
      const { data: session } = await sb.auth.getSession();
      if (cancelled) return;
      if (session.session) await sb.realtime.setAuth(session.session.access_token);
      channel = sb
        .channel(`chat:${planId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'plan_messages', filter: `plan_id=eq.${planId}` }, (payload: { new: unknown }) => {
          const m = payload.new as ChatMessage;
          add([m]);
          if (m.kind === 'system') refreshPlan();
          if (m.sender_id) void learnPeople([m.sender_id]);
          markRead();
        })
        .subscribe((s: string) => {
          setLive(s === 'SUBSCRIBED');
          if (s === 'SUBSCRIBED') void refetch(); // fill any gap after a reconnect
        });
    })();
    markRead();
    document.addEventListener('visibilitychange', markRead);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', markRead);
      if (channel) void sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  // safety net: some networks block websockets, and a live connection can still miss an event, so we also look for news
  // now and then: every 8 seconds without a live connection, every 20 with one
  useEffect(() => {
    const sb = supabaseBrowser();
    const id = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      const { data } = await sb.from('plan_messages').select(COLUMNS).eq('plan_id', planId).order('created_at', { ascending: false }).limit(100);
      if (!data) return;
      const list = data as ChatMessage[];
      if (list.some((m) => m.kind === 'system' && !knownIds.current.has(m.id))) refreshPlan();
      add(list);
      void learnPeople(list.map((m) => m.sender_id ?? '').filter(Boolean));
      if (list.some((m) => m.sender_id !== meId)) markRead();
    }, live ? 20000 : 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, planId]);

  useEffect(() => {
    knownIds.current = new Set(messages.map((m) => m.id));
  }, [messages]);

  // coming back to the tab (or the installed app): show who joined while she was away, including bookings
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshPlan();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshPlan]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const { data, error: err } = await supabaseBrowser()
      .from('plan_messages')
      .insert({ plan_id: planId, sender_id: meId, kind: 'user', body })
      .select(COLUMNS)
      .single();
    setSending(false);
    if (err || !data) {
      setError(err?.message === 'too_fast' ? 'easy there. give it a few seconds.' : "couldn't send that. try again.");
      return;
    }
    setText('');
    stick.current = true;
    add([data as ChatMessage]);
  }

  return (
    <section className={styles.panel} aria-label="plan chat">
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>plan chat</h2>
          <p className={styles.sub}>only the {goingCount} going can see this</p>
        </div>
        {status && <span className={styles.status}>{status}</span>}
      </header>
      {children}
      <div
        ref={listRef}
        className={styles.log}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {messages.length === 0 && <p className={styles.empty}>no messages yet. say hi.</p>}
        {messages.map((m) => {
          if (m.kind === 'system') {
            return (
              <p key={m.id} className={`${styles.system} ${m.event === 'plus_given' ? styles.systemHot : ''}`}>
                {m.body}
              </p>
            );
          }
          const mine = m.sender_id === meId;
          const person = m.sender_id ? people[m.sender_id] : undefined;
          const name = person?.name ?? 'a member';
          return mine ? (
            <div key={m.id} className={styles.mine}>
              {m.body}
            </div>
          ) : (
            <div key={m.id} className={styles.other}>
              <Avatar id={m.sender_id ?? 'x'} name={name} size={36} src={person?.photo} />
              <div className={styles.otherBody}>
                {m.sender_id ? (
                  <Link href={`/members/${m.sender_id}?plan=${planId}`} className={styles.who}>
                    {name.split(' ')[0]}
                  </Link>
                ) : (
                  <span className={styles.who}>{name.split(' ')[0]}</span>
                )}
                <div className={styles.bubble}>{m.body}</div>
              </div>
            </div>
          );
        })}
      </div>
      {canPost ? (
        <form onSubmit={send} className={styles.form}>
          <label htmlFor="chat-input" className="sr-only">
            message
          </label>
          <input id="chat-input" value={text} onChange={(e) => setText(e.target.value)} className={styles.input} placeholder="say something to the girls" maxLength={1000} autoComplete="off" />
          <button type="submit" className={styles.send} aria-label="send" disabled={sending || !text.trim()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12l16-8-6 16-3-7z" />
            </svg>
          </button>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </form>
      ) : (
        <p className={styles.closed}>{closedNote ?? 'this chat is closed.'}</p>
      )}
    </section>
  );
}

export function LockedChat() {
  return (
    <section className={styles.locked} aria-label="plan chat, locked">
      <span className={styles.lockIcon} aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="10" rx="3" />
          <path d="M8 11V8a4 4 0 018 0v3" />
        </svg>
      </span>
      <h2 className={styles.lockedTitle}>join to peek inside</h2>
      <p>the chat opens when you say you&apos;re in. you&apos;ll see what was said and who&apos;s coming.</p>
    </section>
  );
}
