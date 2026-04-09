import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { TurnkeySolanaWalletConnectors } from '@dynamic-labs/embedded-wallet-solana';
import { DynamicWaasSVMConnectors } from '@dynamic-labs/waas-svm';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './popup.css';

const envId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID;
const extensionRedirectUrl =
  typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL('popup.html')
    : typeof window !== 'undefined'
      ? window.location.href
      : undefined;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {envId ? (
      <DynamicContextProvider
        settings={{
          environmentId: envId,
          walletConnectors: [TurnkeySolanaWalletConnectors, DynamicWaasSVMConnectors],
          initialAuthenticationMode: 'connect-only',
          enableConnectOnlyFallback: true,
          redirectUrl: extensionRedirectUrl,
          social: { strategy: 'popup' },
        }}
      >
        <App />
      </DynamicContextProvider>
    ) : (
      <App />
    )}
  </StrictMode>
);
