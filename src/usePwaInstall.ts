import {useEffect,useState} from 'react';

interface InstallPromptEvent extends Event {
 prompt:()=>Promise<void>;
 userChoice:Promise<{outcome:'accepted'|'dismissed';platform:string}>;
}

function standalone():boolean {
 return window.matchMedia('(display-mode: standalone)').matches ||
  Boolean((navigator as Navigator & {standalone?:boolean}).standalone);
}
export function usePwaInstall(){
 const [promptEvent,setPromptEvent]=useState<InstallPromptEvent|null>(null);
 const [installed,setInstalled]=useState(standalone);
 const [isIOS,setIsIOS]=useState(false);

 useEffect(()=>{
  setIsIOS(/iPhone|iPad|iPod/i.test(navigator.userAgent));
  const onBefore=(event:Event)=>{
   const installEvent=event as InstallPromptEvent;
   installEvent.preventDefault();
   setPromptEvent(installEvent);
  };
  const onInstalled=()=>{setInstalled(true);setPromptEvent(null)};
  const media=window.matchMedia('(display-mode: standalone)');
  const onDisplay=()=>setInstalled(standalone());
  window.addEventListener('beforeinstallprompt',onBefore);
  window.addEventListener('appinstalled',onInstalled);
  media.addEventListener?.('change',onDisplay);
  return()=>{
   window.removeEventListener('beforeinstallprompt',onBefore);
   window.removeEventListener('appinstalled',onInstalled);
   media.removeEventListener?.('change',onDisplay);
  };
 },[]);

 const install=async():Promise<boolean>=>{
  if(!promptEvent||installed)return false;
  const event=promptEvent;
  setPromptEvent(null);
  try{
   // prompt() ocorre no clique do usuário (antes de qualquer await).
   await event.prompt();
   const choice=await event.userChoice;
   // O estado "instalado" só é confirmado quando "appinstalled" acontecer.
   return choice.outcome==='accepted';
  }catch{
   return false;
  }
 };
 return {installed,canPrompt:!!promptEvent&&!installed,isIOS,install};
}
