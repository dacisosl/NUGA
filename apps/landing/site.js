const video=document.querySelector('#growth-video');
const motionButton=document.querySelector('#motion-control');
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
let motionAllowed=!reduced.matches;
let heroVisible=true;
// Recording-method films play only on their own screen (and only with motion allowed, unless the visitor asks), lighting the step under the playhead.
const methods=[...document.querySelectorAll('.method')].map(screen=>({screen,player:screen.querySelector('video'),toggle:screen.querySelector('.method-play'),items:[...screen.querySelectorAll('.method-steps li')],chosen:false,userPaused:false}));
let methodTimer=0;
function syncMethods(){
  clearTimeout(methodTimer);
  for(const m of methods)if(!m.screen.classList.contains('is-active')){m.player.pause();m.chosen=false;m.userPaused=false}
  // Wait until the visitor settles on a screen, so scrolling past does not start downloads.
  methodTimer=window.setTimeout(()=>{
    for(const m of methods){
      const here=m.screen.classList.contains('is-active'),next=m.screen.previousElementSibling?.classList.contains('is-active');
      if((here||next)&&(motionAllowed||m.chosen)&&!navigator.connection?.saveData)m.player.preload='auto';
      if(here&&!document.hidden&&!m.userPaused&&(motionAllowed||m.chosen))m.player.play().catch(()=>{});
      else if(here)m.player.pause();
    }
  },400);
}
methods.forEach(m=>{
  const at=m.items.map(li=>Number(li.dataset.at));
  const mark=()=>{
    const t=m.player.currentTime;let i=0;at.forEach((a,k)=>{if(t>=a)i=k});
    const end=at[i+1]??(m.player.duration||at[i]+1);
    m.items.forEach((li,k)=>{const on=k===i,button=li.querySelector('button');li.classList.toggle('is-current',on);if(on)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');li.querySelector('i').style.transform=`scaleX(${on?Math.min(1,Math.max(0,(t-at[i])/(end-at[i]))):0})`});
  };
  const label=()=>{const paused=m.player.paused;m.toggle.textContent=paused?'영상 재생':'영상 일시정지';m.toggle.classList.toggle('is-paused',paused)};
  const start=time=>{m.chosen=true;m.userPaused=false;m.player.preload='auto';if(time!==undefined)m.player.currentTime=time;m.player.play().catch(()=>{});mark()};
  m.player.addEventListener('timeupdate',mark);
  m.player.addEventListener('play',label);
  m.player.addEventListener('pause',label);
  m.items.forEach((li,k)=>li.querySelector('button').addEventListener('click',()=>start(at[k]+.05)));
  m.toggle.addEventListener('click',()=>{if(m.player.paused)start();else{m.userPaused=true;m.player.pause()}});
  label();mark();
});
function syncMotion(){
  if(motionAllowed && heroVisible && !document.hidden) video.play().catch(error=>{if(error.name==='AbortError')return;motionAllowed=false;updateMotionButton()});
  else video.pause();
  updateMotionButton();
  syncMethods();
}
function updateMotionButton(){motionButton.textContent=motionAllowed?'모션 일시정지':'모션 재생';motionButton.setAttribute('aria-pressed',String(motionAllowed))}
motionButton.addEventListener('click',()=>{motionAllowed=!motionAllowed;syncMotion()});
document.addEventListener('visibilitychange',syncMotion);
syncMotion();

const screens=[...document.querySelectorAll('.screen')];
const dots=[...document.querySelectorAll('.screen-nav a')];
const header=document.querySelector('.header');
const nav=document.querySelector('.screen-nav');
const counter=document.querySelector('.screen-counter');
const progress=document.querySelector('#page-progress');
document.querySelectorAll('.reel-number').forEach((number,numberIndex)=>{
  const value=number.dataset.value;
  number.textContent='';
  [...value].forEach((char,index)=>{
    const digit=Number(char),window=document.createElement('span'),strip=document.createElement('span');
    window.className='digit-window';strip.className='digit-strip';
    const landing=20+digit;
    strip.style.setProperty('--landing',`-${landing}em`);
    strip.style.setProperty('--delay',`${index*.06+(numberIndex%3)*.1}s`);
    for(let i=0;i<=landing;i++){const item=document.createElement('span');item.textContent=String(i%10);strip.append(item)}
    window.append(strip);number.append(window);
  });
});

let currentIndex=-1;
let reelStart=0;
function activateScreen(index){
  if(index===currentIndex)return;
  currentIndex=index;
  const screen=screens[index],light=screen.dataset.tone==='light';
  screens.forEach((item,i)=>item.classList.toggle('is-active',i===index));
  dots.forEach((dot,i)=>{if(i===index)dot.setAttribute('aria-current','location');else dot.removeAttribute('aria-current')});
  [header,nav,counter].forEach(element=>element.classList.toggle('is-light',light));
  document.querySelector('#current-screen').textContent=String(index+1).padStart(2,'0');
  progress.style.width=`${(index+1)/screens.length*100}%`;
  heroVisible=index===0;syncMotion();
  clearTimeout(reelStart);
  screens.forEach(item=>item.querySelectorAll('.reel-number').forEach(number=>number.classList.remove('is-running')));
  reelStart=window.setTimeout(()=>{
    if(reduced.matches || currentIndex!==index)return;
    screen.querySelectorAll('.reel-number').forEach(number=>number.classList.add('is-running'));
  },180);
}
const visibility=new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting && entry.intersectionRatio>=.55)activateScreen(screens.indexOf(entry.target));
},{threshold:[.55,.75]});
screens.forEach(screen=>visibility.observe(screen));
// Short viewports can grow naturally; the closest scene still owns navigation.
let queued=false;
window.addEventListener('scroll',()=>{
  if(queued)return;queued=true;
  requestAnimationFrame(()=>{queued=false;const center=window.innerHeight*.48;let nearest=0,distance=Infinity;screens.forEach((screen,i)=>{const rect=screen.getBoundingClientRect();if(rect.top<=center && rect.bottom>=center){nearest=i;distance=0}else if(distance!==0){const gap=Math.abs(rect.top);if(gap<distance){nearest=i;distance=gap}}});activateScreen(nearest)});
},{passive:true});
activateScreen(0);
reduced.addEventListener('change',()=>{motionAllowed=!reduced.matches;syncMotion()});

const evidenceButton=document.querySelector('#evidence-button');
evidenceButton.addEventListener('click',()=>{
  const expanded=evidenceButton.getAttribute('aria-expanded')==='true';
  evidenceButton.setAttribute('aria-expanded',String(!expanded));
  document.querySelector('#evidence-detail').hidden=expanded;
  evidenceButton.innerHTML=`관찰 근거 ${expanded?'보기':'접기'} <span aria-hidden="true">${expanded?'+':'−'}</span>`;
});
const faqs=[...document.querySelectorAll('.faq-list details')];
faqs.forEach(item=>item.addEventListener('toggle',()=>{if(item.open)faqs.forEach(other=>{if(other!==item)other.open=false})}));
// The app opens on the same navy night, so a short fade into that colour carries the visitor in without a white flash.
// App links carry the full published address so they also work when this page is opened as a file.
const appLinks=[...document.querySelectorAll('[data-app-link]')];
let appPrefetched=false,leaveTimer=0;
function prefetchApp(){
  if(appPrefetched||navigator.connection?.saveData||location.protocol==='file:')return;appPrefetched=true;
  const base=appLinks[0].href;
  fetch(base).then(response=>response.ok?response.text():'').then(html=>{for(const [,href] of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)){const link=document.createElement('link');link.rel='prefetch';link.as=href.endsWith('.css')?'style':'script';link.crossOrigin='anonymous';link.href=new URL(href,base).href;document.head.append(link)}}).catch(()=>{});
}
appLinks.forEach(link=>{
  ['pointerenter','focus','touchstart'].forEach(type=>link.addEventListener(type,prefetchApp,{once:true,passive:true}));
  link.addEventListener('click',event=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||reduced.matches)return;
    event.preventDefault();prefetchApp();
    document.documentElement.classList.add('is-leaving');video.pause();
    clearTimeout(leaveTimer);
    // If the navigation never commits (offline, stopped), lift the veil instead of leaving a blank page.
    leaveTimer=window.setTimeout(()=>{window.location.assign(link.href);leaveTimer=window.setTimeout(liftVeil,4000)},380);
  });
});
function liftVeil(){clearTimeout(leaveTimer);document.documentElement.classList.remove('is-leaving');syncMotion()}
// Coming back with the browser's back button restores this page from cache; lift the veil again.
window.addEventListener('pageshow',event=>{if(event.persisted)liftVeil()});

// A restrained, eased movement keeps the glass staircase responsive to the pointer.
let desiredX=0,desiredY=0,currentX=0,currentY=0,parallaxFrame=0;
const hero=document.querySelector('.hero');
function easeParallax(){currentX+=(desiredX-currentX)*.055;currentY+=(desiredY-currentY)*.055;video.style.transform=`translate3d(${currentX.toFixed(2)}px,${currentY.toFixed(2)}px,0) scale(1.025)`;if(Math.abs(desiredX-currentX)+Math.abs(desiredY-currentY)>.04)parallaxFrame=requestAnimationFrame(easeParallax);else parallaxFrame=0}
hero.addEventListener('pointermove',event=>{if(reduced.matches||!motionAllowed||event.pointerType!=='mouse')return;const rect=hero.getBoundingClientRect();desiredX=(event.clientX/rect.width-.5)*14;desiredY=((event.clientY-rect.top)/rect.height-.5)*10;if(!parallaxFrame)parallaxFrame=requestAnimationFrame(easeParallax)});
hero.addEventListener('pointerleave',()=>{desiredX=0;desiredY=0;if(!parallaxFrame)parallaxFrame=requestAnimationFrame(easeParallax)});
