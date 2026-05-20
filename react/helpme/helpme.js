/**
 * Ready4Exam Help Bot — self-contained React widget
 * Loaded lazily from index.html via dynamic import.
 * No build step: uses React 18 from esm.sh CDN.
 */
import React, { useState, useRef, useEffect } from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';

const h = React.createElement;

// ─── Brand tokens ──────────────────────────────────────────────────────────
const C = {
  navy:    '#1a3e6a',
  navyD:   '#0f2849',
  gold:    '#f5a623',
  white:   '#ffffff',
  bg:      '#f8fafc',
  border:  '#e2e8f0',
  text:    '#1e293b',
  muted:   '#64748b',
};

// ─── FAQ knowledge base ────────────────────────────────────────────────────
const TOPICS = [
  {
    id: 'login', label: 'Login & Access', icon: '🔑',
    faqs: [
      {
        q: 'How do I log in?',
        a: 'Enter your username (or email) and password on the homepage, then click **Log In**. School students receive credentials from their school admin.'
      },
      {
        q: 'I forgot my password',
        a: 'Click **"Forgot Password?"** below the login button. Enter your registered email and student name — a reset link will be sent immediately.'
      },
      {
        q: 'Who can access the platform?',
        a: 'Four roles are supported: **Students**, **Parents**, **Teachers**, and **School Admins**. Each gets a tailored console after login.'
      },
      {
        q: 'My account is blocked or inactive',
        a: 'Account access is managed by your school admin. Contact them or reach us on **WhatsApp at +91 85209 77573** for quick resolution.'
      },
      {
        q: 'Can I log in from multiple devices?',
        a: 'Yes — each account can be used across devices. Parent and student logins are completely independent; a parent logging in **never** blocks the student.'
      },
    ]
  },
  {
    id: 'quiz', label: 'Taking Quizzes', icon: '📝',
    faqs: [
      {
        q: 'How do I start a quiz?',
        a: 'On the homepage select **Board → Class → Subject → Chapter → Difficulty**, then click **Start Quiz**. Simple difficulty is free — no login needed!'
      },
      {
        q: 'Which boards are supported?',
        a: '**CBSE** and **SCERT (Telangana)** are fully live. More boards coming soon. Use the **Request Onboarding** form to fast-track yours.'
      },
      {
        q: 'What is Simple / Medium / Advanced?',
        a: '**Simple** covers core concepts and is free for all. **Medium** tests application of knowledge. **Advanced** mirrors actual board exam patterns. Medium & Advanced require registration.'
      },
      {
        q: 'What types of questions appear?',
        a: 'Three types: **MCQ** (Multiple Choice), **AR** (Assertion-Reason), and **CB** (Case-Based) — perfectly aligned with CBSE board exam formats.'
      },
      {
        q: 'Can I pause mid-quiz?',
        a: 'Quizzes are single sessions. Complete in one go for accurate performance tracking. Your score saves automatically when you click **Submit**.'
      },
      {
        q: 'Why are Medium and Advanced locked?',
        a: 'Medium and Advanced levels require a school subscription and a registered account. Ask your school admin to activate your access.'
      },
    ]
  },
  {
    id: 'notebook', label: 'Mistake Notebook', icon: '📔',
    faqs: [
      {
        q: 'What is the Mistake Notebook?',
        a: 'It automatically captures every wrong answer across all your quizzes, organised by subject and chapter. It highlights **Friction zones** (recurring mistakes) and **Victory zones** (questions you\'ve now mastered).'
      },
      {
        q: 'What is Friction vs Victory?',
        a: '**Friction** = questions wrong in your latest attempt. **Victory** = questions previously wrong but answered correctly in your most recent attempt. This tracks your growth arc over time.'
      },
      {
        q: 'Who can see my Mistake Notebook?',
        a: 'Only **you** and your **linked parent** (via Parent Dashboard) can see your Mistake Notebook. School admins and teachers see only aggregate class-level data.'
      },
      {
        q: 'How do I navigate the Mistake Notebook?',
        a: 'After login, go to **Mistake Notebook** from your Student Console. Click a subject to expand chapters, then click a chapter to inspect individual questions by difficulty.'
      },
    ]
  },
  {
    id: 'parent', label: 'Parent Dashboard', icon: '👨‍👧',
    faqs: [
      {
        q: 'How does the Parent Dashboard work?',
        a: 'After login, you see your linked child\'s real-time quiz scores, mistake patterns, and a **Sync Wall** for direct messaging. Use **Launch Mirror** to open the student console in a new window.'
      },
      {
        q: 'What is Launch Mirror?',
        a: '**Launch Mirror** opens your linked child\'s student console in a new tab — read-only. You see exactly what your child sees: scores, progress charts, and mistake patterns.'
      },
      {
        q: 'Does parent login block the student?',
        a: 'No. Parent and student are independent accounts. A parent logging in **never** prevents the student from logging in simultaneously on another device.'
      },
      {
        q: 'My child\'s data is not showing',
        a: 'Your parent account must be **linked** to your child\'s account by your school admin. Contact the admin or message us on WhatsApp at +91 85209 77573.'
      },
      {
        q: 'Can a parent see another student\'s data?',
        a: 'No. A parent account is linked to one specific child\'s UID. The system only ever loads data for that child — another student\'s data is not accessible.'
      },
    ]
  },
  {
    id: 'plans', label: 'Registration & Plans', icon: '🎓',
    faqs: [
      {
        q: 'Is Ready4Exam free?',
        a: '**Simple difficulty** quizzes are completely free — no login needed. Full access (Medium, Advanced, Mistake Notebook, Dashboards) requires a school subscription.'
      },
      {
        q: 'How does school onboarding work?',
        a: 'Schools subscribe as institutions. **Gather 10 students** and we deploy your full curriculum in **24 hours**. Use the Request Onboarding form on the homepage.'
      },
      {
        q: 'How do I register as a student?',
        a: 'Student registration is done by your school admin. Ask your school to add you — they\'ll share your login credentials once your account is active.'
      },
      {
        q: 'Which subjects and classes are covered?',
        a: '**Mathematics, Science, and Social Science** for Classes 9–10 (CBSE). Classes 6–12 for SCERT TS. More subjects and boards are being added continuously.'
      },
      {
        q: 'How long does subscription last?',
        a: 'Subscription terms are agreed between Ready4Exam and your school institution. Contact your school admin or WhatsApp us for pricing details.'
      },
    ]
  },
  {
    id: 'tech', label: 'Technical Help', icon: '🛠️',
    faqs: [
      {
        q: 'Quiz is not loading',
        a: 'Refresh the page (Ctrl + Shift + R) and check your internet connection. Clear your browser cache, or switch to **Google Chrome** for the best experience.'
      },
      {
        q: 'My score did not save',
        a: 'Scores save automatically on quiz **submission**. Never close the tab mid-quiz — always use the Submit button. If a score is missing, retake the quiz.'
      },
      {
        q: 'The page looks broken or misaligned',
        a: 'Ready4Exam is optimised for modern browsers: **Chrome, Firefox, and Edge**. If you\'re on an older browser or unsupported mobile browser, try Chrome for the best experience.'
      },
      {
        q: 'How do I contact support?',
        a: 'WhatsApp us at **+91 85209 77573** or use the Request form on the homepage. We typically respond within a few hours on working days.'
      },
      {
        q: 'I see an error on the dashboard',
        a: 'Take a screenshot of the error and WhatsApp it to **+91 85209 77573** with a brief description. Our team will investigate and fix it promptly.'
      },
    ]
  },
];

// ─── Keyword matching ──────────────────────────────────────────────────────
function findFAQ(query) {
  const q = query.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  let best = null, bestScore = 0;
  for (const topic of TOPICS) {
    for (const faq of topic.faqs) {
      const words = (faq.q + ' ' + faq.a).toLowerCase().split(/\W+/).filter(w => w.length > 3);
      const score = words.filter(w => q.includes(w) || w.includes(q.split(' ')[0])).length;
      if (score > bestScore) { bestScore = score; best = faq; }
    }
  }
  return bestScore >= 2 ? best : null;
}

// ─── Message factories ─────────────────────────────────────────────────────
const botMsg  = (text, chips = []) => ({ role: 'bot',  text, chips, id: Math.random() });
const userMsg = (text)             => ({ role: 'user', text,         id: Math.random() });

const TOPIC_CHIPS = TOPICS.map(t => ({ label: `${t.icon} ${t.label}`, value: t.id }));
const BACK_CHIPS  = [
  { label: '← All Topics',   value: '__topics__' },
  { label: '💬 WhatsApp Us', value: '__wa__'     },
];

// ─── Sub-components ────────────────────────────────────────────────────────
function BotText({ text }) {
  // Render **bold** markdown
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return h('span', null,
    ...parts.map((p, i) => i % 2 === 1 ? h('strong', { key: i }, p) : p)
  );
}

function Chip({ label, onClick }) {
  const [hov, setHov] = useState(false);
  return h('button', {
    onClick,
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
    style: {
      background:  hov ? C.navy : C.white,
      color:       hov ? C.white : C.navy,
      border:      `1.5px solid ${C.navy}`,
      borderRadius: 20,
      padding:     '5px 11px',
      fontSize:    11.5,
      fontWeight:  600,
      cursor:      'pointer',
      fontFamily:  'inherit',
      lineHeight:  1.4,
      transition:  'all 0.15s',
    }
  }, label);
}

function BotBubble({ text, chips, onChip }) {
  return h('div', { style: { marginBottom: 6 } },
    h('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-start' } },
      h('div', {
        style: {
          width: 28, height: 28, borderRadius: '50%', background: C.navy,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, flexShrink: 0, marginTop: 2,
        }
      }, '🎓'),
      h('div', {
        style: {
          background: C.white, border: `1px solid ${C.border}`,
          borderRadius: '2px 12px 12px 12px',
          padding: '9px 12px', maxWidth: '84%',
          fontSize: 13, color: C.text, lineHeight: 1.55,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }
      }, h(BotText, { text }))
    ),
    chips?.length > 0 && h('div', {
      style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7, marginLeft: 36 }
    }, ...chips.map((c, i) => h(Chip, { key: i, label: c.label, onClick: () => onChip(c) })))
  );
}

function UserBubble({ text }) {
  return h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 6 } },
    h('div', {
      style: {
        background: C.navy, color: C.white,
        borderRadius: '12px 2px 12px 12px',
        padding: '9px 12px', maxWidth: '78%',
        fontSize: 13, lineHeight: 1.55,
      }
    }, text)
  );
}

function TypingIndicator() {
  return h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 } },
    h('div', { style: { width: 28, height: 28, borderRadius: '50%', background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 } }, '🎓'),
    h('div', { style: { background: C.white, border: `1px solid ${C.border}`, borderRadius: '2px 12px 12px 12px', padding: '10px 14px', display: 'flex', gap: 4, alignItems: 'center' } },
      ...[0, 1, 2].map(i =>
        h('span', {
          key: i,
          style: {
            width: 6, height: 6, borderRadius: '50%', background: C.muted, display: 'inline-block',
            animation: `r4eDot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }
        })
      )
    )
  );
}

// ─── Main chat panel ───────────────────────────────────────────────────────
function ChatPanel({ onClose }) {
  const [messages, setMessages] = useState([
    botMsg(
      'Hi! 👋 I\'m the **Ready4Exam Help Bot**. Pick a topic below or type your question.',
      TOPIC_CHIPS
    )
  ]);
  const [input,   setInput]   = useState('');
  const [typing,  setTyping]  = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const push = (msg) => setMessages(prev => [...prev, msg]);

  const reply = (msg, delay = 350) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      push(msg);
    }, delay);
  };

  const handleChip = (chip) => {
    if (chip.value === '__topics__') {
      push(userMsg('← All Topics'));
      reply(botMsg('What else can I help you with?', TOPIC_CHIPS));

    } else if (chip.value === '__wa__') {
      window.open('https://wa.me/918520977573?text=Hi%20Ready4Exam,%20I%20need%20help.', '_blank');

    } else if (chip.answer) {
      push(userMsg(chip.q));
      reply(botMsg(chip.answer, BACK_CHIPS));

    } else {
      const topic = TOPICS.find(t => t.id === chip.value);
      if (!topic) return;
      push(userMsg(`${topic.icon} ${topic.label}`));
      reply(botMsg(
        `Here are common questions about **${topic.label}**:`,
        topic.faqs.map(f => ({ label: f.q, value: f.q, answer: f.a, q: f.q }))
      ));
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    push(userMsg(text));
    setInput('');
    const faq = findFAQ(text);
    if (faq) {
      reply(botMsg(faq.a, BACK_CHIPS));
    } else {
      reply(botMsg(
        'I couldn\'t find an exact match. Try one of these topics or reach us directly:',
        [...TOPIC_CHIPS.slice(0, 3), { label: '💬 WhatsApp Us', value: '__wa__' }]
      ), 450);
    }
  };

  return h('div', {
    style: {
      position: 'fixed', bottom: 90, right: 20,
      width: 340, maxWidth: 'calc(100vw - 32px)',
      background: C.white, borderRadius: 20,
      boxShadow: '0 12px 48px rgba(0,0,0,0.18)',
      border: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      zIndex: 9999,
      animation: 'r4eSlideUp 0.22s ease-out',
    }
  },
    // ── Header ─────────────────────────────────────────────────────────────
    h('div', {
      style: {
        background: `linear-gradient(135deg, ${C.navy}, ${C.navyD})`,
        padding: '12px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }
    },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
        h('div', {
          style: {
            width: 34, height: 34, borderRadius: '50%', background: C.gold,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
          }
        }, '🎓'),
        h('div', null,
          h('div', { style: { color: C.white, fontWeight: 700, fontSize: 13.5, letterSpacing: '-0.01em' } }, 'Ready4Exam Help'),
          h('div', { style: { color: 'rgba(255,255,255,0.55)', fontSize: 11 } }, 'Instant answers · 24 / 7')
        )
      ),
      h('button', {
        onClick: onClose,
        title: 'Close',
        style: {
          background: 'rgba(255,255,255,0.12)', border: 'none',
          color: 'rgba(255,255,255,0.85)', cursor: 'pointer',
          width: 28, height: 28, borderRadius: '50%',
          fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }
      }, '×')
    ),

    // ── Messages ────────────────────────────────────────────────────────────
    h('div', {
      style: {
        height: 340, overflowY: 'auto', padding: '14px 14px 8px',
        background: C.bg, display: 'flex', flexDirection: 'column', gap: 2,
      }
    },
      ...messages.map(m =>
        m.role === 'bot'
          ? h(BotBubble,  { key: m.id, text: m.text, chips: m.chips, onChip: handleChip })
          : h(UserBubble, { key: m.id, text: m.text })
      ),
      typing && h(TypingIndicator, { key: 'typing' }),
      h('div', { ref: bottomRef })
    ),

    // ── Input ───────────────────────────────────────────────────────────────
    h('div', {
      style: {
        padding: '10px 12px', borderTop: `1px solid ${C.border}`,
        background: C.white, display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0,
      }
    },
      h('input', {
        ref: inputRef,
        value: input,
        onChange: e => setInput(e.target.value),
        onKeyDown: e => e.key === 'Enter' && !e.shiftKey && handleSend(),
        placeholder: 'Type your question…',
        style: {
          flex: 1, border: `1.5px solid ${C.border}`, borderRadius: 20,
          padding: '8px 14px', fontSize: 13, outline: 'none',
          fontFamily: 'inherit', color: C.text, background: C.bg,
          transition: 'border-color 0.15s',
        },
        onFocus: e => { e.target.style.borderColor = C.navy; },
        onBlur:  e => { e.target.style.borderColor = C.border; },
      }),
      h('button', {
        onClick: handleSend,
        title: 'Send',
        style: {
          width: 34, height: 34, borderRadius: '50%', background: C.navy,
          border: 'none', cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.2s',
        },
        onMouseEnter: e => { e.currentTarget.style.background = C.navyD; },
        onMouseLeave: e => { e.currentTarget.style.background = C.navy; },
      },
        h('svg', {
          width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none',
          stroke: C.white, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round',
        },
          h('line',    { x1: 22, y1: 2,  x2: 11, y2: 13 }),
          h('polygon', { points: '22 2 15 22 11 13 2 9 22 2' })
        )
      )
    )
  );
}

// ─── Floating action button ────────────────────────────────────────────────
function Widget() {
  const [open,  setOpen]  = useState(false);
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 6000);
    return () => clearTimeout(t);
  }, []);

  const toggle = () => { setOpen(o => !o); setPulse(false); };

  return h(React.Fragment, null,
    h('style', null, `
      @keyframes r4eSlideUp {
        from { opacity: 0; transform: translateY(18px); }
        to   { opacity: 1; transform: translateY(0);    }
      }
      @keyframes r4ePulse {
        0%, 100% { box-shadow: 0 4px 20px rgba(0,0,0,0.25), 0 0 0 0   rgba(245,166,35,0.55); }
        60%       { box-shadow: 0 4px 20px rgba(0,0,0,0.25), 0 0 0 12px rgba(245,166,35,0);   }
      }
      @keyframes r4eDot {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40%            { transform: scale(1);   opacity: 1;   }
      }
      #r4e-fab { transition: transform 0.2s, background 0.2s; }
      #r4e-fab:hover { transform: scale(1.1) !important; }
    `),

    // FAB
    h('button', {
      id: 'r4e-fab',
      onClick: toggle,
      title: open ? 'Close Help' : 'Help & FAQ',
      'aria-label': open ? 'Close chat' : 'Open help chat',
      style: {
        position: 'fixed', bottom: 20, right: 85,
        width: 50, height: 50, borderRadius: '50%',
        background: open
          ? `linear-gradient(135deg, #334155, #1e293b)`
          : `linear-gradient(135deg, ${C.navy}, ${C.navyD})`,
        border: `2.5px solid ${C.gold}`,
        color: C.white, cursor: 'pointer', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: open ? 22 : 20,
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        animation: pulse && !open ? 'r4ePulse 2.2s ease-in-out infinite' : 'none',
      }
    }, open ? '×' : '💬'),

    // Tooltip on first visit
    pulse && !open && h('div', {
      style: {
        position: 'fixed', bottom: 76, right: 68,
        background: C.navyD, color: C.white,
        fontSize: 11, fontWeight: 600, padding: '5px 10px',
        borderRadius: 8, whiteSpace: 'nowrap', zIndex: 9998,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        animation: 'r4eSlideUp 0.3s ease-out',
        pointerEvents: 'none',
        fontFamily: "'Inter', sans-serif",
      }
    },
      'Need help? Ask me! 👋',
      h('div', {
        style: {
          position: 'absolute', bottom: -5, right: 18,
          width: 10, height: 10, background: C.navyD,
          transform: 'rotate(45deg)',
        }
      })
    ),

    // Chat panel
    open && h(ChatPanel, { onClose: () => setOpen(false) })
  );
}

// ─── Public API ────────────────────────────────────────────────────────────
export function mount(container) {
  createRoot(container).render(h(Widget, null));
}
