import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { queryClient } from './lib/queryClient';
import { CurrencyProvider } from './context/CurrencyContext';
import { TimezoneProvider } from './context/TimezoneContext';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <CurrencyProvider>
          <TimezoneProvider>
            <App />
          </TimezoneProvider>
        </CurrencyProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>,
);
