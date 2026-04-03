import { useState, useEffect } from 'react';
import ChatBot from 'react-simple-chatbot';
import { ThemeProvider } from 'styled-components';

const theme = {
  background: '#0a0a0a',
  fontFamily: 'Inter, sans-serif',
  headerBgColor: '#a855f7',
  headerFontColor: '#fff',
  headerFontSize: '16px',
  botBubbleColor: 'linear-gradient(135deg, #a855f7, #ec4899)',
  botFontColor: '#fff',
  userBubbleColor: 'rgba(255, 255, 255, 0.1)',
  userFontColor: '#fff',
};

const steps = [
  {
    id: '1',
    message: 'Hi there! I\'m here to help you schedule a meeting.',
    trigger: '2',
  },
  {
    id: '2',
    message: 'Let\'s find a time that works.',
    trigger: '3',
  },
  {
    id: '3',
    message: 'First, what\'s your name?',
    trigger: 'name',
  },
  {
    id: 'name',
    user: true,
    trigger: '4',
  },
  {
    id: '4',
    message: 'Nice to meet you, {previousValue}! What\'s your email address?',
    trigger: 'email',
  },
  {
    id: 'email',
    user: true,
    validator: (value: string) => {
      if (!/\S+@\S+\.\S+/.test(value)) {
        return 'Please enter a valid email address.';
      }
      return true;
    },
    trigger: '5',
  },
  {
    id: '5',
    message: 'What would you like to discuss?',
    trigger: 'purpose',
  },
  {
    id: 'purpose',
    options: [
      { value: 'consultation', label: 'Consultation', trigger: 'loading' },
      { value: 'project', label: 'Project Inquiry', trigger: 'loading' },
      { value: 'general', label: 'General Question', trigger: 'loading' },
    ],
  },
  {
    id: 'loading',
    message: 'Let me check the calendar...',
    trigger: 'fetch-availability',
  },
  {
    id: 'fetch-availability',
    component: <AvailabilityFetcher />,
    asMessage: true,
    trigger: 'end',
  },
  {
    id: 'end',
    message: 'Thanks! I\'ll be in touch soon.',
    end: true,
  },
];

function AvailabilityFetcher() {
  const [status, setStatus] = useState('Checking calendar...');

  useEffect(() => {
    fetch('/api/booking/availability')
      .then(r => r.json())
      .then(data => {
        if (data.days && data.days.length > 0) {
          setStatus(`Found ${data.days.length} available days!`);
        } else {
          setStatus('Sorry, no availability found. Please email us directly.');
        }
      })
      .catch(() => {
        setStatus('Error checking calendar. Please try again.');
      });
  }, []);

  return <div style={{ padding: '10px' }}>{status}</div>;
}

export default function ChatScheduler() {
  return (
    <ThemeProvider theme={theme}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        minHeight: '100vh',
        background: '#0a0a0a',
        padding: '20px'
      }}>
        <ChatBot
          steps={steps}
          floating={false}
          headerTitle="Schedule a Meeting"
          botAvatar="/favicon.svg"
          hideUserAvatar
          width="100%"
          style={{ 
            maxWidth: '600px',
            boxShadow: '0 0 40px rgba(168, 85, 247, 0.3)',
            borderRadius: '16px',
          }}
        />
      </div>
    </ThemeProvider>
  );
}
