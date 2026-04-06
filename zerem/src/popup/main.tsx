import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { SolanaWalletConnectors } from '@dynamic-labs/solana';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './popup.css';

const envId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {envId ? (
      <DynamicContextProvider
        settings={{
          environmentId: envId,
          walletConnectors: [SolanaWalletConnectors],
        }}
      >
        <App />
      </DynamicContextProvider>
    ) : (
      <App />
    )}
  </StrictMode>
);
