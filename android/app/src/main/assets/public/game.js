'use strict';
/* ================================================================
   CONFIGURAÇÃO E BALANCEAMENTO — ajuste os valores daqui quando quiser.
   Todos os custos crescem multiplicando pelo fator de custo escolhido.
   ================================================================ */
const CONFIG = {
  SAVE_KEY: 'infinity_clicker_singlefile_v1', // chave local do save
  AUTOSAVE_MS: 5000,                         // intervalo de salvamento automático
  OFFLINE_CAP_SECONDS: 8 * 60 * 60,           // máximo de 8 horas fora do jogo
  COST_GROWTH: 1.15,                          // aumento de custo a cada compra
  CLICK_BASE: 1,                              // moedas base por clique
  CLICK_UPGRADE_GAIN: 1,                      // ganho extra base por nível de clique
  CLICK_UPGRADE_COST: 25,                     // custo inicial da melhoria de clique
  AUTO_UPGRADE_GAIN: 1,                       // moedas/s por nível automático inicial
  AUTO_UPGRADE_COST: 100,                     // custo inicial automático
  LUCK_UPGRADE_COST: 250,                     // custo inicial da melhoria de sorte
  CHEST_BASE_INTERVAL_MIN: 9000,              // intervalo mínimo base entre baús (ms)
  CHEST_BASE_INTERVAL_MAX: 17000,             // intervalo máximo base entre baús (ms)
  CHEST_LIFETIME_MS: 10000,                   // quanto tempo o baú fica no mapa
  CHEST_BASE_CHANCE_GOLD: 0.035,              // chance de baú dourado
  CHEST_BASE_CHANCE_SILVER: 0.09,             // chance de baú prateado
  CHEST_REWARD_NORMAL_MIN: 40,                // recompensa mínima do baú de madeira
  CHEST_REWARD_NORMAL_MAX: 110,               // recompensa máxima do baú de madeira
  CHEST_REWARD_SILVER_MIN: 180,               // recompensa mínima do baú prateado
  CHEST_REWARD_SILVER_MAX: 420,               // recompensa máxima do baú prateado
  CHEST_REWARD_GOLD_MIN: 700,                 // recompensa mínima do baú dourado
  CHEST_REWARD_GOLD_MAX: 1800,                // recompensa máxima do baú dourado
  TEMP_BONUS_MULTIPLIER: 2,                   // multiplicador de bônus temporário
  TEMP_BONUS_SECONDS: 20,                     // duração de bônus de baú
  WORLD_THRESHOLDS: [0, 1000, 100000, 10000000, 1000000000], // moedas acumuladas nesta rodada
  REBIRTH_UNLOCK_WORLD_INDEX: 2,               // renascer liberado ao desbloquear a Neve (mundo 3)
  REBIRTH_DIVISOR: 100000,                     // estrelas = raiz quadrada(moedas da rodada / divisor)
  STAR_GAIN_PER_STAR: 0.10,                    // cada estrela: +10% permanente
  LUCK_SPAWN_REDUCTION: 0.055,                 // redução do intervalo por nível de sorte
  LUCK_REWARD_BONUS: 0.12,                     // aumento das recompensas por nível de sorte
  MAX_LUCK_LEVEL: 30                           // limite para sorte não eliminar os intervalos
};
const WORLDS = [
  {name:'Campo de Grama',emoji:'🌿',threshold:0,colors:['#148849','#16964d','#08733e','#f0b744','#f6cb5c'],dot:'#10552f'},
  {name:'Deserto',emoji:'🏜️',threshold:1000,colors:['#d7ad54','#e9c56b','#c99545','#ef9b39','#f4c96a'],dot:'#987339'},
  {name:'Neve',emoji:'❄️',threshold:100000,colors:['#b8e5ef','#d8f4f5','#9ccbdc','#f3f8fa','#d8eaff'],dot:'#649bb0'},
  {name:'Vulcão',emoji:'🌋',threshold:10000000,colors:['#4a343b','#63313a','#332c38','#ec6a28','#ff9c37'],dot:'#211b27'},
  {name:'Céu',emoji:'☁️',threshold:1000000000,colors:['#438fca','#61b8e9','#367bb8','#ffe28c','#f5f9ff'],dot:'#28619a'}
];
const $ = id => document.getElementById(id);
const canvas=$('map'),ctx=canvas.getContext('2d',{alpha:false});
let state, currentTab='click', lastFrame=0, lastHudUpdate=0, lastAutoTick=performance.now(), lastChestSpawn=0, chestTimer=0, toastTimer=0, offlineGain=0, hiddenAt=0;
let screenW=innerWidth,screenH=innerHeight,dpr=1,tileSize=42,particles=[],chests=[],nextChestAt=0, tileDots=[];
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const rand=(a,b)=>Math.random()*(b-a)+a;
const randInt=(a,b)=>Math.floor(rand(a,b+1));
function fmt(value){
  const n=Math.max(0,Number(value)||0);
  if(n<1000)return Math.floor(n).toLocaleString('pt-BR');
  const units=['K','M','B','T','Qa','Qi'];let x=n,i=-1;
  while(x>=1000&&i<units.length-1){x/=1000;i++;}
  if(i===units.length-1&&x>=1000)return n.toExponential(2).replace('.',',');
  return x.toFixed(x<10?1:0).replace('.',',')+units[i];
}
function freshState(){return {version:1,coins:0,runEarned:0,lifetimeEarned:0,clickLevel:0,autoLevel:0,luckLevel:0,rebirths:0,stars:0,unlockedWorld:0,world:0,bonusUntil:0,bonusMultiplier:1,lastSaved:Date.now(),lastChestCollected:0};}
function loadState(){
  let s=freshState();
  try{const raw=localStorage.getItem(CONFIG.SAVE_KEY);if(raw){const p=JSON.parse(raw);if(p&&p.version===1){s={...s,...p};}}}catch(e){console.warn('Não foi possível ler o save:',e);}
  for(const key of Object.keys(s)){if(typeof s[key]==='number'&&!Number.isFinite(s[key]))s[key]=freshState()[key]||0;}
  s.coins=Math.max(0,s.coins);s.runEarned=Math.max(0,s.runEarned);s.lifetimeEarned=Math.max(0,s.lifetimeEarned);s.stars=Math.max(0,Math.floor(s.stars));s.world=clamp(Math.floor(s.world),0,4);s.unlockedWorld=clamp(Math.floor(s.unlockedWorld),0,4);
  const now=Date.now(),away=clamp((now-(s.lastSaved||now))/1000,0,CONFIG.OFFLINE_CAP_SECONDS);
  const passive=autoPerSecond(s)*away;
  if(passive>0){s.coins+=passive;s.runEarned+=passive;s.lifetimeEarned+=passive;offlineGain=passive;}
  s.lastSaved=now;return s;
}
function saveState(showMessage=false){state.lastSaved=Date.now();try{localStorage.setItem(CONFIG.SAVE_KEY,JSON.stringify(state));if(showMessage)showToast('Progresso salvo neste dispositivo!');}catch(e){if(showMessage)showToast('O navegador bloqueou o salvamento.');}}
function addCoins(amount){if(!(amount>0)||!Number.isFinite(amount))return;state.coins+=amount;state.runEarned+=amount;state.lifetimeEarned+=amount;unlockWorlds();}
function unlockWorlds(){let top=0;for(let i=0;i<WORLDS.length;i++)if(state.runEarned>=WORLDS[i].threshold)top=i;state.unlockedWorld=Math.max(state.unlockedWorld,top);if(state.world>state.unlockedWorld)state.world=state.unlockedWorld;}
function clickPower(){return (CONFIG.CLICK_BASE+state.clickLevel*CONFIG.CLICK_UPGRADE_GAIN)*(1+state.stars*CONFIG.STAR_GAIN_PER_STAR)*1.05*(Date.now()<state.bonusUntil?state.bonusMultiplier:1);}
function autoPerSecond(s=state){return s.autoLevel*CONFIG.AUTO_UPGRADE_GAIN*(1+s.stars*CONFIG.STAR_GAIN_PER_STAR);}
function chestInterval(){return rand(CONFIG.CHEST_BASE_INTERVAL_MIN,CONFIG.CHEST_BASE_INTERVAL_MAX)*Math.max(.25,1-state.luckLevel*CONFIG.LUCK_SPAWN_REDUCTION);}
function scheduleChest(){nextChestAt=performance.now()+chestInterval();}
function showToast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200);}
function addFloat(text,x,y,cls='float-text'){const el=document.createElement('div');el.className=cls;el.textContent=text;el.style.left=clamp(x,8,screenW-90)+'px';el.style.top=clamp(y,8,screenH-30)+'px';$('floatLayer').appendChild(el);el.addEventListener('animationend',()=>el.remove(),{once:true});}
function spawnParticles(x,y,count=14,colors=['#fff2a1','#ffffff','#ff6d52','#ffe36d']){for(let i=0;i<count;i++){const a=rand(0,Math.PI*2),speed=rand(35,170);particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:rand(.25,.65),max:.65,size:rand(2,5),color:colors[randInt(0,colors.length-1)]});}}
function doClick(ev){if($('shopBackdrop').classList.contains('hidden')===false)return;const gain=clickPower();addCoins(gain);addFloat('+'+fmt(gain),screenW/2+rand(-38,30),screenH/2+rand(35,70));spawnParticles(screenW/2,screenH/2,10);const btn=$('bigButton');btn.classList.add('pressed');setTimeout(()=>btn.classList.remove('pressed'),85);$('game').classList.remove('screen-shake');void $('game').offsetWidth;$('game').classList.add('screen-shake');setTimeout(()=>$('game').classList.remove('screen-shake'),170);if(navigator.vibrate)try{navigator.vibrate(12);}catch(_){}updateHud();if(Math.random()<.025)maybeDropExtraSpark();}
function maybeDropExtraSpark(){spawnParticles(screenW/2+rand(-50,50),screenH/2+rand(-40,40),5,['#a6faff','#ffffff','#ffe78a']);}
function buy(kind){
  if(kind==='click'){const cost=CONFIG.CLICK_UPGRADE_COST*Math.pow(CONFIG.COST_GROWTH,state.clickLevel);if(state.coins<cost)return showToast('Moedas insuficientes!');state.coins-=cost;state.clickLevel++;showToast('Ganho por clique aumentado!');}
  else if(kind==='auto'){const cost=CONFIG.AUTO_UPGRADE_COST*Math.pow(CONFIG.COST_GROWTH,state.autoLevel);if(state.coins<cost)return showToast('Moedas insuficientes!');state.coins-=cost;state.autoLevel++;showToast('Produção automática aumentada!');}
  else if(kind==='luck'){const cost=CONFIG.LUCK_UPGRADE_COST*Math.pow(CONFIG.COST_GROWTH,state.luckLevel);if(state.luckLevel>=CONFIG.MAX_LUCK_LEVEL)return showToast('Sorte no nível máximo!');if(state.coins<cost)return showToast('Moedas insuficientes!');state.coins-=cost;state.luckLevel++;showToast('Sua sorte aumentou!');}
  saveState();renderShop();updateHud();
}
function rebirthReward(){return Math.max(0,Math.floor(Math.sqrt(Math.max(0,state.runEarned)/CONFIG.REBIRTH_DIVISOR)));}
function rebirth(){if(state.unlockedWorld<CONFIG.REBIRTH_UNLOCK_WORLD_INDEX)return showToast('Desbloqueie o mundo Neve para renascer!');const reward=rebirthReward();if(reward<=0)return showToast('Continue juntando moedas nesta rodada.');if(!confirm('Renascer agora e ganhar '+reward+' estrela(s)? Moedas, melhorias e mundos desbloqueados voltarão ao início. As estrelas serão mantidas.'))return;const stars=state.stars+reward,lifetime=state.lifetimeEarned;const rebirthCount=state.rebirths+1;state=freshState();state.stars=stars;state.rebirths=rebirthCount;state.lifetimeEarned=lifetime;state.lastSaved=Date.now();chests=[];scheduleChest();saveState();renderShop();updateHud();showToast('Renascimento concluído! +'+reward+' estrela(s).');}
function buyCost(base,level){return base*Math.pow(CONFIG.COST_GROWTH,level);}
function renderShop(){
  $('shopWallet').textContent='🪙 '+fmt(state.coins)+' moedas · ⭐ '+fmt(state.stars)+' estrelas';
  document.querySelectorAll('.tab').forEach(b=>{const active=b.dataset.tab===currentTab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
  const content=$('shopContent');content.innerHTML='';
  const desc=document.createElement('p');desc.className='shop-desc';
  if(currentTab==='click'){
    desc.textContent='Cada nível aumenta as moedas recebidas por toque. Seu companheiro alado já oferece +5% e as estrelas aumentam todos os ganhos permanentemente.';content.appendChild(desc);
    content.appendChild(makeUpgradeRow('👆 Dedo poderoso','Nível '+state.clickLevel+' · +'+fmt(CONFIG.CLICK_UPGRADE_GAIN)+' de ganho base por clique',buyCost(CONFIG.CLICK_UPGRADE_COST,state.clickLevel),'click',true));
  } else if(currentTab==='auto'){
    desc.textContent='Drones produzem moedas sozinhos, mesmo quando você não está tocando. O ganho offline é calculado ao voltar, até o limite de 8 horas.';content.appendChild(desc);
    content.appendChild(makeUpgradeRow('⚙️ Drone coletor','Nível '+state.autoLevel+' · produz '+fmt(autoPerSecond())+' moedas/s',buyCost(CONFIG.AUTO_UPGRADE_COST,state.autoLevel),'auto',true));
  } else if(currentTab==='luck'){
    desc.textContent='Mais sorte faz os baús aparecerem com maior frequência e melhora as recompensas. Baús de prata e ouro são raros, mas valiosos.';content.appendChild(desc);
    content.appendChild(makeUpgradeRow('🍀 Amuleto da sorte','Nível '+state.luckLevel+'/'+CONFIG.MAX_LUCK_LEVEL+' · baús mais frequentes e recompensas maiores',buyCost(CONFIG.LUCK_UPGRADE_COST,state.luckLevel),'luck',state.luckLevel<CONFIG.MAX_LUCK_LEVEL));
    const info=document.createElement('div');info.className='upgrade-row';info.innerHTML='<div><strong>🎁 Chance de baú raro</strong><small>Prata: '+Math.round((CONFIG.CHEST_BASE_CHANCE_SILVER+state.luckLevel*.004)*100)+'% · Ouro: '+Math.round((CONFIG.CHEST_BASE_CHANCE_GOLD+state.luckLevel*.002)*100)+'%</small></div>';content.appendChild(info);
  } else {
    const b=document.createElement('div');b.className='rebirth-box';const reward=rebirthReward();const unlocked=state.unlockedWorld>=CONFIG.REBIRTH_UNLOCK_WORLD_INDEX;
    b.innerHTML='<h3>⭐ Poder das estrelas</h3><p>Você possui <b>'+fmt(state.stars)+' estrela(s)</b>. Cada estrela concede +10% permanente em todos os ganhos, inclusive após renascer.<br><br>Renascer requer desbloquear <b>Neve</b> (100 mil moedas acumuladas na rodada). A recompensa é ⌊√(moedas da rodada ÷ 100.000)⌋.<br><br>Rodada atual: <b>'+fmt(state.runEarned)+'</b> moedas · Recompensa agora: <b>'+reward+'</b> estrela(s).</p>';
    const button=document.createElement('button');button.className='primary-btn';button.textContent=unlocked?'⭐ Renascer e ganhar '+reward+' estrela(s)':'🔒 Renascer (desbloqueie Neve)';button.disabled=!unlocked||reward<=0;button.addEventListener('click',rebirth);b.appendChild(button);
    const bonus=document.createElement('p');bonus.style.marginTop='12px';bonus.textContent='Bônus permanente atual: +'+Math.round(state.stars*CONFIG.STAR_GAIN_PER_STAR*100)+'% · Renascimentos: '+state.rebirths;b.appendChild(bonus);content.appendChild(b);
  }
}
function makeUpgradeRow(title,subtitle,cost,kind,enabled){const row=document.createElement('div');row.className='upgrade-row';const info=document.createElement('div');const strong=document.createElement('strong');strong.textContent=title;const small=document.createElement('small');small.textContent=subtitle;info.append(strong,small);const button=document.createElement('button');button.className='buy-btn';button.dataset.kind=kind;button.dataset.cost=String(cost);button.dataset.allowed=String(enabled);button.textContent='Comprar · '+fmt(cost);button.disabled=!enabled||state.coins<cost;button.addEventListener('click',()=>buy(kind));row.append(info,button);return row;}
function openShop(tab=currentTab){currentTab=tab;$('shopBackdrop').classList.remove('hidden');renderShop();}
function closeShop(){$('shopBackdrop').classList.add('hidden');}
function changeWorld(){unlockWorlds();const available=[];for(let i=0;i<=state.unlockedWorld;i++)available.push(i);if(available.length<2)return showToast('Junte '+fmt(WORLDS[1].threshold)+' moedas para abrir o próximo mundo.');const idx=available.indexOf(state.world);state.world=available[(idx+1)%available.length];$('worldChip').animate([{opacity:.3,transform:'translateX(-50%) scale(.9)'},{opacity:1,transform:'translateX(-50%) scale(1)'}],{duration:350,easing:'ease-out'});updateHud();showToast(WORLDS[state.world].emoji+' Mundo: '+WORLDS[state.world].name);}
function updateHud(){unlockWorlds();$('money').textContent=fmt(state.coins);$('runCoins').textContent='Rodada: '+fmt(state.runEarned);$('clickGain').textContent='x'+fmt(clickPower())+' por clique';const w=WORLDS[state.world];$('worldName').textContent=w.emoji+' '+w.name;$('worldStatus').textContent='Mundo '+(state.world+1)+' de 5';
  const next=state.unlockedWorld>=4?null:WORLDS[state.unlockedWorld+1];const currentThreshold=WORLDS[state.unlockedWorld].threshold;const progress=next?clamp((state.runEarned-currentThreshold)/(next.threshold-currentThreshold),0,1):1;$('progressFill').style.height=(progress*100)+'%';$('progressLabel').textContent=next?'Próximo: '+next.name+' · '+fmt(Math.max(0,next.threshold-state.runEarned)):'Todos os mundos desbloqueados!';$('worldButton').textContent=state.unlockedWorld>0?'🌎 Mundo: '+w.name:'🌎 Trocar mundo';$('worldButton').disabled=state.unlockedWorld===0;$('worldButton').style.opacity=state.unlockedWorld===0?'.7':'1';if(!$('shopBackdrop').classList.contains('hidden')){ $('shopWallet').textContent='🪙 '+fmt(state.coins)+' moedas · ⭐ '+fmt(state.stars)+' estrelas';document.querySelectorAll('.buy-btn').forEach(b=>{b.disabled=b.dataset.allowed!=='true'||state.coins<Number(b.dataset.cost);});}}
/* Canvas: tiles determinísticos, baús e pequenas partículas são redesenhados sem criar DOM por quadro. */
function resize(){screenW=innerWidth;screenH=innerHeight;dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(screenW*dpr);canvas.height=Math.round(screenH*dpr);canvas.style.width=screenW+'px';canvas.style.height=screenH+'px';ctx.setTransform(dpr,0,0,dpr,0,0);tileSize=screenW<500?Math.max(34,Math.min(46,Math.round(screenW/8.4))):48;tileDots=[];const cols=Math.ceil(screenW/tileSize)+1,rows=Math.ceil(screenH/tileSize)+1;for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const seed=((x*73856093)^(y*19349663)^((state?state.world:0)*83492791))>>>0;const r=seed%100;tileDots.push({x,y,dot:r<43,sx:(seed%29)/tileSize,sy:((seed>>>5)%29)/tileSize,rr:1+(seed%2),yellow:r>93});}drawMap(performance.now()/1000);}
function drawChest(c){const x=c.x,y=c.y,s=c.size;ctx.save();ctx.translate(x,y);ctx.fillStyle='#15201c66';ctx.fillRect(-s*.48,s*.25,s*.96,s*.25);let top='#a7662e',front='#74401f',rim='#b47b34';if(c.type==='gold'){top='#ffd44f';front='#bd7b15';rim='#fff0a0'}else if(c.type==='silver'){top='#d8e6ea';front='#7a929d';rim='#f7ffff'}ctx.fillStyle=front;ctx.fillRect(-s*.45,-s*.05,s*.9,s*.47);ctx.fillStyle=top;ctx.fillRect(-s*.45,-s*.2,s*.9,s*.28);ctx.fillStyle=rim;ctx.fillRect(-s*.45,-s*.22,s*.9,s*.08);ctx.fillRect(-s*.4,s*.05,s*.8,s*.06);ctx.fillRect(-s*.08,-s*.18,s*.16,s*.53);ctx.fillStyle='#f6df7b';ctx.fillRect(-s*.09,-s*.01,s*.18,s*.17);ctx.fillStyle='#523b24';ctx.fillRect(-s*.035,s*.04,s*.07,s*.08);ctx.strokeStyle='#34271e';ctx.lineWidth=1.5;ctx.strokeRect(-s*.45,-s*.2,s*.9,s*.67);ctx.restore();}
function drawMap(time){const w=screenW,h=screenH;const world=WORLDS[state.world];ctx.clearRect(0,0,w,h);ctx.fillStyle=world.colors[0];ctx.fillRect(0,0,w,h);const cols=Math.ceil(w/tileSize)+1,rows=Math.ceil(h/tileSize)+1;let di=0;
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++,di++){const xx=x*tileSize,yy=y*tileSize;const cell=((x+y)%2===0)?world.colors[1]:world.colors[2];ctx.fillStyle=cell;ctx.fillRect(xx,yy,tileSize,tileSize);const dotData=tileDots[di];if(dotData&&dotData.yellow){ctx.fillStyle=world.colors[3];const s=tileSize*.8;ctx.fillRect(xx+tileSize*.1,yy+tileSize*.1,s,s);}if(dotData&&dotData.dot){ctx.fillStyle=world.dot;ctx.beginPath();ctx.arc(xx+tileSize*(.2+dotData.sx),yy+tileSize*(.2+dotData.sy),dotData.rr,0,Math.PI*2);ctx.fill();}}
  if(state.world===1){for(let i=0;i<8;i++){let x=(i*137+50)%w,y=(i*89+70)%h;ctx.fillStyle='#a8793c55';ctx.fillRect(x,y,6,6);}}
  if(state.world===2){for(let i=0;i<16;i++){const x=(i*97+22)%w,y=(i*61+35)%h;ctx.fillStyle='#ffffff55';ctx.fillRect(x,y,3,3);}}
  if(state.world===3){for(let i=0;i<12;i++){const x=(i*107+17)%w,y=(i*73+10)%h;ctx.fillStyle=i%2?'#ff8a30':'#b52e2a';ctx.fillRect(x,y,5+(i%4)*2,3);}}
  if(state.world===4){for(let i=0;i<10;i++){const x=(i*121+35)%w,y=(i*77+44)%h;ctx.fillStyle='#f4fbff77';ctx.beginPath();ctx.arc(x,y,3+(i%4),0,Math.PI*2);ctx.fill();}}
  for(const chest of chests)drawChest(chest);
  // Partículas atualizadas no Canvas, sem inserir elementos extras no DOM.
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];const dt=Math.min(.035,Math.max(0,(time-(p.last||time))));p.last=time;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=230*dt;p.life-=dt;ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size);if(p.life<=0)particles.splice(i,1);}ctx.globalAlpha=1;
}
function frame(now){const time=now/1000,dt=lastFrame?Math.min(.1,(now-lastFrame)/1000):0;lastFrame=now;
  if(state.autoLevel>0&&dt>0){const gain=autoPerSecond()*dt;addCoins(gain);if(!$('shopBackdrop').classList.contains('hidden')&&currentTab==='auto'){} }
  chests=chests.filter(c=>now<c.expires);if(now>=nextChestAt){spawnChest(now);scheduleChest();}
  drawMap(time);if(now-lastHudUpdate>.25){updateHud();lastHudUpdate=now;}requestAnimationFrame(frame);
}
function spawnChest(now){const chanceGold=clamp(CONFIG.CHEST_BASE_CHANCE_GOLD+state.luckLevel*.002,0,.18),chanceSilver=clamp(CONFIG.CHEST_BASE_CHANCE_SILVER+state.luckLevel*.004,.03,.35);let type='wood';const r=Math.random();if(r<chanceGold)type='gold';else if(r<chanceGold+chanceSilver)type='silver';const margin=tileSize*1.1;const cx=screenW*.5,cy=screenH*.5;let x,y,tries=0;do{x=rand(margin,Math.max(margin,screenW-margin));y=rand(margin+45,Math.max(margin+45,screenH-margin));tries++;}while(Math.hypot(x-cx,y-cy)<Math.min(150,screenW*.28)&&tries<20);const size=type==='gold'?39:type==='silver'?34:31;chests.push({x,y,size,type,expires:now+CONFIG.CHEST_LIFETIME_MS});showToast(type==='gold'?'✨ Baú dourado apareceu!':type==='silver'?'🥈 Baú prateado apareceu!':'🎁 Um baú apareceu no mapa!');}
function collectChest(x,y){const now=performance.now();let index=-1;for(let i=chests.length-1;i>=0;i--){const c=chests[i];if(now<c.expires&&Math.abs(x-c.x)<c.size*.85&&Math.abs(y-c.y)<c.size*.85){index=i;break;}}if(index<0)return false;const c=chests.splice(index,1)[0];let reward;if(c.type==='gold')reward=randInt(CONFIG.CHEST_REWARD_GOLD_MIN,CONFIG.CHEST_REWARD_GOLD_MAX);else if(c.type==='silver')reward=randInt(CONFIG.CHEST_REWARD_SILVER_MIN,CONFIG.CHEST_REWARD_SILVER_MAX);else reward=randInt(CONFIG.CHEST_REWARD_NORMAL_MIN,CONFIG.CHEST_REWARD_NORMAL_MAX);reward*=1+state.luckLevel*CONFIG.LUCK_REWARD_BONUS;reward*=1+state.stars*CONFIG.STAR_GAIN_PER_STAR;const label=c.type==='gold'?'BAÚ DOURADO':c.type==='silver'?'BAÚ PRATEADO':'BAÚ DE MADEIRA';if(Math.random()<.18){state.bonusUntil=Date.now()+CONFIG.TEMP_BONUS_SECONDS*1000;state.bonusMultiplier=CONFIG.TEMP_BONUS_MULTIPLIER;showToast('⚡ Bônus x'+CONFIG.TEMP_BONUS_MULTIPLIER+' por '+CONFIG.TEMP_BONUS_SECONDS+' segundos!');}addCoins(reward);spawnParticles(c.x,c.y,24,c.type==='gold'?['#fff2a1','#ffcc33','#fff','#ff8b35']:['#ffffff','#ffe780','#d5faff']);addFloat('+'+fmt(reward),c.x-8,c.y-10,'chest-float');showToast(label+': +'+fmt(reward)+' moedas!');if(navigator.vibrate)try{navigator.vibrate([15,25,15]);}catch(_){}updateHud();saveState();return true;}
canvas.addEventListener('pointerdown',e=>{const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;if(collectChest(x,y)){e.preventDefault();}});
$('bigButton').addEventListener('click',e=>{doClick(e);});$('bigButton').addEventListener('contextmenu',e=>e.preventDefault());$('upgradeButton').addEventListener('click',()=>openShop());$('closeShop').addEventListener('click',closeShop);$('shopBackdrop').addEventListener('click',e=>{if(e.target===$('shopBackdrop'))closeShop();});document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{currentTab=b.dataset.tab;renderShop();}));$('worldButton').addEventListener('click',changeWorld);$('saveButton').addEventListener('click',()=>saveState(true));$('resetButton').addEventListener('click',()=>{if(!confirm('Tem certeza que deseja ZERAR TUDO? Todas as moedas, melhorias, estrelas e mundos serão apagados deste dispositivo.'))return;try{localStorage.removeItem(CONFIG.SAVE_KEY);}catch(_){}state=freshState();chests=[];particles=[];scheduleChest();closeShop();saveState();updateHud();showToast('Jogo zerado. Uma nova aventura começa!');});window.addEventListener('resize',resize,{passive:true});window.addEventListener('orientationchange',()=>setTimeout(resize,150),{passive:true});document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenAt=Date.now();saveState();}else{const now=Date.now();const away=clamp((now-(hiddenAt||state.lastSaved))/1000,0,CONFIG.OFFLINE_CAP_SECONDS);const gain=autoPerSecond()*away;if(gain>0){addCoins(gain);showToast('Você ganhou '+fmt(gain)+' moedas enquanto estava fora!');}hiddenAt=0;state.lastSaved=now;updateHud();}});window.addEventListener('beforeunload',()=>saveState());
state=loadState();unlockWorlds();if(offlineGain>0)showToast('Bem-vindo de volta! +'+fmt(offlineGain)+' moedas offline.');scheduleChest();resize();updateHud();setInterval(()=>saveState(),CONFIG.AUTOSAVE_MS);requestAnimationFrame(frame);
