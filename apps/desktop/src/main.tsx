import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { App } from './App';
import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
);
