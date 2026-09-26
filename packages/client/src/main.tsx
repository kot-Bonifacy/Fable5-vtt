import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import { installE2EHook } from './e2e-hook.js';
// Pierwszy w kolejce: motyw definiuje tokeny, z których czytają oba pliki niżej.
import './theme.css';
import './styles.css';
// Po `styles.css`, przed `sheet.css`: skóra „stara kartka" chromu (18.09) nadpisuje
// tła, kroje i rogi okien tą samą specyficznością, więc liczy się kolejność.
import './chrome.css';
// Po `styles.css`: skóra karty postaci celowo przesłania kilka reguł okna
// (szerokość, belka tytułowa, zakładki) z etapów 07–08.
import './sheet.css';

// Martwy kod poza buildem `--mode e2e` (testy E2E, `e2e-hook.ts`).
installE2EHook();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
