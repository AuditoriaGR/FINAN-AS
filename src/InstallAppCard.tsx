import {CheckCircle2,Download,ExternalLink,Smartphone} from 'lucide-react';

type Props={installed:boolean;canPrompt:boolean;isIOS:boolean;onInstall:()=>void};

export default function InstallAppCard({installed,canPrompt,isIOS,onInstall}:Props){
 return <section className="panel">
  <div className="panel-head"><div><h2>Instalar Meu Financeiro</h2>
   <p>Use como aplicativo no celular, sem baixar APK e sem perder seus dados.</p></div>
   <span className="icon-badge blue"><Smartphone size={20}/></span>
  </div>
  {installed?<div className="pwa-installed"><CheckCircle2 size={20}/>
   <div><strong>Instalado neste dispositivo</strong>
    <p>Abra o Meu Financeiro pelo ícone na tela inicial ou na lista de aplicativos.</p></div>
  </div>:<>
   <p className="settings-text">A instalação usa o próprio site seguro. Depois, ele abre em uma janela independente, como um aplicativo, com o mesmo login do casal.</p>
   {canPrompt&&<button className="primary full" type="button" onClick={onInstall}>
    <Download size={18}/> Instalar pelo navegador
   </button>}
   {isIOS?<div className="pwa-howto">
    <strong>iPhone ou iPad</strong>
    <p>No Safari, abra o site, toque em <strong>Compartilhar</strong> e escolha <strong>Adicionar à Tela de Início</strong>.</p>
   </div>:<div className="pwa-howto">
    <strong>Android · Google Chrome</strong>
    <p>1. Abra <strong>meu-financeiro-casal.vercel.app</strong> no Google Chrome.</p>
    <p>2. Toque no menu <strong>⋮</strong>, no canto superior direito.</p>
    <p>3. Escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong> e confirme.</p>
    <p>4. Abra o aplicativo pelo novo ícone na tela inicial.</p>
   </div>}
  </>}
  <p className="small-hint"><ExternalLink size={14}/> Não é uma publicação na Google Play Store. A instalação é feita pelo Chrome, usando a mesma versão do site. É necessária conexão à internet para acessar saldos e registrar movimentos.</p>
 </section>;
}
