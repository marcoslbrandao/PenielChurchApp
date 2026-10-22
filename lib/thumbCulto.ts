// lib/thumbCulto.ts
//
// Thumb do culto da semana (1280x720), desenhada num <canvas> dentro de uma
// WebView — o mesmo desenho das thumbs feitas à mão em 21/10/2026: fundo em
// gradiente com brilhos, pregador recortado à direita, logo + tipo + data no
// topo, tema grande em branco, subtítulo dourado e a pílula com o texto base.
// A cor muda pelo tipo de culto; o layout é sempre o mesmo.
//
// Por que canvas e não no servidor: a Edge Function tem só 2 s de CPU, e
// desenhar a imagem lá levava ~4 s. No celular é instantâneo, a prévia é a
// própria imagem final e funciona por OTA (react-native-webview já existe).
//
// Fluxo: a tela chama `desenhar(dados)` a cada mudança (prévia ao vivo) e
// `exportar()` na hora de salvar — a WebView devolve o JPEG em base64 pelo
// postMessage.

import { LOGO_PENIEL_DATA_URI } from './logoPenielDataUri';

export type TipoCulto = 'adoracao' | 'ceia' | 'alive' | 'mulheres' | 'homens' | 'kids' | 'casais' | 'especial';

export const TIPOS_CULTO: { id: TipoCulto; nome: string; cor: string }[] = [
  { id: 'adoracao', nome: 'Culto de Adoração', cor: '#7B61FF' },
  { id: 'ceia', nome: 'Santa Ceia', cor: '#c2185b' },
  { id: 'alive', nome: 'Peniel Alive', cor: '#14b8a6' },
  { id: 'mulheres', nome: 'Mulheres', cor: '#ec4899' },
  { id: 'homens', nome: 'Homens', cor: '#3b82f6' },
  { id: 'kids', nome: 'Kids', cor: '#f97316' },
  { id: 'casais', nome: 'Casais', cor: '#ef4444' },
  { id: 'especial', nome: 'Especial', cor: '#d4a017' },
];

export type DadosThumb = {
  tipo: TipoCulto;
  dataTexto: string;      // "26 · 10 · 2026"
  tema: string;           // Enter força a quebra de linha
  subtitulo: string;
  referencia: string;
  pregador: string;
  fotoUrl: string | null; // PNG sem fundo (URL pública do bucket)
};

export function htmlThumbCulto(): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=block" rel="stylesheet">
<style>html,body{margin:0;padding:0;background:#1A1740;overflow:hidden}canvas{width:100vw;height:auto;display:block}</style>
</head><body><canvas id="c" width="1280" height="720"></canvas>
<script>
var TEMAS = {
  adoracao:{nome:'Culto de Adoração',fundo:['#0b0a2e','#1A1740','#2b1866','#3b1477'],b1:'35,65,214',b2:'123,97,255',b3:'59,20,119',acento:'#7B61FF',acentoRgb:'123,97,255'},
  ceia:{nome:'Santa Ceia',fundo:['#2a0a1a','#5a1030','#7a1a2e','#7a1a2e'],b1:'194,24,91',b2:'194,24,91',b3:'122,26,46',acento:'#c2185b',acentoRgb:'194,24,91'},
  alive:{nome:'Peniel Alive',fundo:['#04121f','#0a3a4a','#0e5c5c','#0e5c5c'],b1:'20,184,166',b2:'20,184,166',b3:'14,92,92',acento:'#14b8a6',acentoRgb:'20,184,166'},
  mulheres:{nome:'Culto de Mulheres',fundo:['#2a0a24','#5a1450','#7a2266','#7a2266'],b1:'236,72,153',b2:'244,114,182',b3:'122,34,102',acento:'#ec4899',acentoRgb:'236,72,153'},
  homens:{nome:'Culto de Homens',fundo:['#0a1420','#14283c','#1e3a52','#1e3a52'],b1:'59,130,246',b2:'96,165,250',b3:'30,58,82',acento:'#3b82f6',acentoRgb:'59,130,246'},
  kids:{nome:'Peniel Kids',fundo:['#2a1606','#5a300c','#7a4410','#7a4410'],b1:'249,115,22',b2:'251,146,60',b3:'122,68,16',acento:'#f97316',acentoRgb:'249,115,22'},
  casais:{nome:'Culto de Casais',fundo:['#1f0a0a','#4a1414','#6a1e1e','#6a1e1e'],b1:'239,68,68',b2:'248,113,113',b3:'106,30,30',acento:'#ef4444',acentoRgb:'239,68,68'},
  especial:{nome:'Culto Especial',fundo:['#1a1404','#3a2c08','#56420c','#56420c'],b1:'245,200,66',b2:'245,200,66',b3:'86,66,12',acento:'#d4a017',acentoRgb:'212,160,23'}
};
var W=1280,H=720,cv=document.getElementById('c'),ctx=cv.getContext('2d');
var logo=new Image(); logo.src=${JSON.stringify(LOGO_PENIEL_DATA_URI)};
var fotos={}, ultimo=null, fontesProntas=false;
function avisar(o){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }

function carregarFoto(url){
  if(!url) return null;
  if(fotos[url]) return fotos[url];
  var im=new Image(); im.crossOrigin='anonymous';
  im.onload=function(){ if(ultimo) desenhar(ultimo); };
  im.onerror=function(){ avisar({tipo:'erroFoto'}); };
  im.src=url; fotos[url]=im; return im;
}
function espacar(px){ try{ ctx.letterSpacing=px+'px'; }catch(e){} }
function radial(cx,cy,r,rgb,a){
  var g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
  g.addColorStop(0,'rgba('+rgb+','+a+')'); g.addColorStop(1,'rgba('+rgb+',0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
}
// Quebra automática equilibrada em até 3 linhas (Enter força a quebra).
function quebrar(tema){
  var manual=tema.split(/\\n+/).map(function(s){return s.trim();}).filter(Boolean);
  if(manual.length>1) return manual;
  var t=tema.trim(); if(!t) return [];
  var palavras=t.split(/\\s+/), total=t.length;
  var alvoLinhas= total<=14?1: total<=30?2:3, alvo=total/alvoLinhas, linhas=[], atual='';
  palavras.forEach(function(p){
    var tent= atual? atual+' '+p : p;
    if(atual && tent.length>alvo+1 && linhas.length<alvoLinhas-1){ linhas.push(atual); atual=p; } else atual=tent;
  });
  if(atual) linhas.push(atual);
  return linhas;
}
function pilula(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

function desenhar(d){
  ultimo=d; if(!fontesProntas) return;
  var t=TEMAS[d.tipo]||TEMAS.adoracao;
  ctx.save(); ctx.clearRect(0,0,W,H);
  // fundo 120deg como no CSS
  var ang=120*Math.PI/180, vx=Math.sin(ang), vy=-Math.cos(ang), L=Math.abs(W*vx)+Math.abs(H*vy);
  var g=ctx.createLinearGradient(W/2-vx*L/2,H/2-vy*L/2,W/2+vx*L/2,H/2+vy*L/2);
  g.addColorStop(0,t.fundo[0]); g.addColorStop(.38,t.fundo[1]); g.addColorStop(.70,t.fundo[2]); g.addColorStop(1,t.fundo[3]);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  // brilhos
  radial(130,90,433,t.b1,.45); radial(940,400,407,t.b2,.32); radial(1190,670,382,t.b3,.7);
  // linhas finas
  ctx.save(); ctx.globalAlpha=.07; ctx.strokeStyle='#fff'; ctx.lineWidth=1;
  ctx.translate(W/2,H/2); ctx.rotate(25*Math.PI/180);
  for(var x=-1600;x<=1600;x+=46){ ctx.beginPath(); ctx.moveTo(x,-1600); ctx.lineTo(x,1600); ctx.stroke(); }
  ctx.restore();
  // halo atrás do pregador
  radial(880,480,257,t.acentoRgb,.55);
  // pregador
  var foto=carregarFoto(d.fotoUrl), temFoto=foto&&foto.complete&&foto.naturalWidth>0;
  if(temFoto){
    var fh=640, fw=fh*foto.naturalWidth/foto.naturalHeight;
    ctx.save(); ctx.shadowColor='rgba(0,0,0,.55)'; ctx.shadowBlur=40; ctx.shadowOffsetY=20;
    ctx.drawImage(foto,W-20-fw,H-fh,fw,fh); ctx.restore();
  }
  // logo
  ctx.save(); ctx.shadowColor='rgba(0,0,0,.45)'; ctx.shadowBlur=30; ctx.shadowOffsetY=8;
  ctx.beginPath(); ctx.arc(110,98,50,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); ctx.restore();
  if(logo.complete){ ctx.save(); ctx.beginPath(); ctx.arc(110,98,50,0,Math.PI*2); ctx.clip(); ctx.drawImage(logo,60,48,100,100); ctx.restore(); }
  // tipo + data
  ctx.textBaseline='top'; ctx.fillStyle='#F5C842'; ctx.font='800 22px Manrope'; espacar(4.8);
  ctx.fillText(t.nome.toUpperCase(),178,70);
  ctx.fillStyle='rgba(255,255,255,.75)'; ctx.font='700 18px Manrope'; espacar(3.2);
  ctx.fillText(d.dataTexto||'',178,104);
  // tema
  var largura= temFoto? 700 : 1150, linhas=quebrar(d.tema||'').map(function(l){return l.toUpperCase();});
  var fs= linhas.length>=3? 78 : 100; espacar(0);
  function maior(){ var m=0; linhas.forEach(function(l){ ctx.font='800 '+fs+'px Manrope'; espacar(-fs*.03); m=Math.max(m,ctx.measureText(l).width); }); return m; }
  while(fs>44 && maior()>largura) fs-=2;
  ctx.font='800 '+fs+'px Manrope'; espacar(-fs*.03); ctx.fillStyle='#fff';
  ctx.save(); ctx.shadowColor='rgba(0,0,0,.45)'; ctx.shadowBlur=30; ctx.shadowOffsetY=6;
  var y=205; linhas.forEach(function(l){ ctx.fillText(l,64,y); y+=fs*1.02; }); ctx.restore();
  // subtítulo
  if(d.subtitulo){
    var sfs=46; espacar(0); ctx.font='800 '+sfs+'px Manrope';
    var sub=d.subtitulo.toUpperCase(); while(sfs>26 && ctx.measureText(sub).width>largura){ sfs-=2; ctx.font='800 '+sfs+'px Manrope'; }
    ctx.fillStyle='#F5C842'; ctx.fillText(sub,64,y+14);
  }
  // pílula + pregador
  var px=64, ph=56, py=H-58-ph; espacar(0);
  if(d.referencia){
    ctx.font='800 26px Manrope'; var rw=ctx.measureText(d.referencia).width+44;
    ctx.save(); ctx.shadowColor='rgba('+t.acentoRgb+',.6)'; ctx.shadowBlur=30; pilula(px,py,rw,ph,ph/2); ctx.fillStyle=t.acento; ctx.fill(); ctx.restore();
    ctx.fillStyle='#fff'; ctx.textBaseline='middle'; ctx.fillText(d.referencia,px+22,py+ph/2+1); px+=rw+16;
  }
  if(d.pregador){ ctx.font='700 24px Manrope'; ctx.fillStyle='rgba(255,255,255,.88)'; ctx.textBaseline='middle'; ctx.fillText(d.pregador,px,py+ph/2+1); }
  ctx.restore();
  avisar({tipo:'desenhou', temFoto:!!temFoto});
}
function exportar(){
  try{ avisar({tipo:'jpeg', base64: cv.toDataURL('image/jpeg',.9).split(',')[1]}); }
  catch(e){ avisar({tipo:'erroExportar', msg:String(e)}); }
}
var prontas=Promise.all([document.fonts.load('800 40px Manrope'),document.fonts.load('700 20px Manrope'),document.fonts.load('500 20px Manrope')]);
Promise.race([prontas,new Promise(function(r){setTimeout(r,4000);})]).then(function(){ fontesProntas=true; avisar({tipo:'pronto'}); if(ultimo) desenhar(ultimo); });
logo.onload=function(){ if(ultimo) desenhar(ultimo); };
</script></body></html>`;
}
