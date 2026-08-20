import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
// Pierwszy w kolejce: motyw definiuje tokeny, z których czytają oba pliki niżej.
import './theme.css';
import './styles.css';
// Po `styles.css`: skóra karty postaci celowo przesłania kilka reguł okna
// (szerokość, belka tytułowa, zakładki) z etapów 07–08.
import './sheet.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
