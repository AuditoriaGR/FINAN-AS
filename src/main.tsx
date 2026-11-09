import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './style.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

// O SW atende somente a navegação offline com uma página pública de aviso.
// As respostas de autenticação e os dados financeiros nunca são armazenados.
if(import.meta.env.PROD&&'serviceWorker' in navigator){
 window.addEventListener('load',()=>{
  navigator.serviceWorker.register('/sw.js',{scope:'/'})
   .catch(error=>console.warn('Instalação do aplicativo indisponível:',error));
 });
}
