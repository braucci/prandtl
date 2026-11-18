const base = {
  scheme:'light', soft:'#43534C', onAccent:'#FFFFFF',
  background:'#F8F9FA', surface:'#FFFFFF', paper:'#F4F5F1',
  sceneBackground:'#F3F5F2', ink:'#202C29', muted:'#626F69', line:'#D8DED8',
  grid:'#C7D1C9', velocity:'#4A625C', local:'#176B60',
  resultant:'#8D5D1C', lift:'#2D7351', drag:'#B6402B',
  wing:'#BCCBC5', wingEdge:'#60766C', pressureLow:'#8C4D93', pressureMid:'#E8E2DB', pressureHigh:'#7F6B22'
};

export const THEMES = {
  ember:{...base,id:'ember',name:'Arancione bruciato',accent:'#B54A2B',accentStrong:'#8D341E',accentSoft:'#F6E9E2',flowA:'#B54A2B',flowB:'#25766B',downwash:'#B54A2B'},
  forest:{...base,id:'forest',name:'Verde bosco',accent:'#24674B',accentStrong:'#174B35',accentSoft:'#E5EEE5',flowA:'#24674B',flowB:'#BD6236',downwash:'#24674B'},
  cobalt:{...base,id:'cobalt',name:'Blu cobalto',accent:'#2554BF',accentStrong:'#183F97',accentSoft:'#E8EDF8',flowA:'#2554BF',flowB:'#BB5D32',downwash:'#2554BF'},
  slate:{
    ...base,id:'slate',name:'Ardesia',scheme:'dark',
    background:'#252D2B',surface:'#2E3834',paper:'#29322F',sceneBackground:'#222B27',
    ink:'#EDF0E8',soft:'#CDD5CB',muted:'#AAB8AD',line:'#49564E',grid:'#506056',
    accent:'#E2A078',accentStrong:'#F0BA97',accentSoft:'#43382F',onAccent:'#241B15',
    flowA:'#E2A078',flowB:'#7DC7B7',velocity:'#BBCDC1',downwash:'#E2A078',
    local:'#79CBB7',resultant:'#E2CA83',lift:'#9DCEA0',drag:'#EE9380',
    wing:'#9AACA2',wingEdge:'#CBD7CD',pressureLow:'#D5A0DB',pressureMid:'#A8A797',pressureHigh:'#DDCE81'
  },
  night:{
    ...base,id:'night',name:'Notte',scheme:'dark',
    background:'#0C100F',surface:'#131A17',paper:'#0F1512',sceneBackground:'#090E0C',
    ink:'#D5DDD2',soft:'#BAC9BE',muted:'#8FA497',line:'#2D3D32',grid:'#354A3C',
    accent:'#C9A46C',accentStrong:'#DFC396',accentSoft:'#29271D',onAccent:'#181B13',
    flowA:'#C9A46C',flowB:'#76AE9D',velocity:'#A8BEB0',downwash:'#C9A46C',
    local:'#75B7A7',resultant:'#C9B878',lift:'#92BC91',drag:'#D68D7A',
    wing:'#758B7D',wingEdge:'#A2B9A8',pressureLow:'#C594D1',pressureMid:'#7B8475',pressureHigh:'#C7BC78'
  }
};
export function getPalette(){return THEMES[document.documentElement.dataset.theme]||THEMES.ember;}
export function setTheme(name,persist=true){
  const p=THEMES[name]||THEMES.ember;
  document.documentElement.dataset.theme=p.id;
  document.documentElement.style.colorScheme=p.scheme;
  const names={background:'bg',surface:'surface',paper:'paper',ink:'text',soft:'soft',muted:'muted',line:'line',accent:'accent',accentStrong:'accent-strong',accentSoft:'accent-soft',onAccent:'on-accent',flowA:'flow-a',flowB:'flow-b',velocity:'velocity',downwash:'downwash',local:'local',resultant:'resultant',lift:'lift',drag:'drag',sceneBackground:'scene-bg',pressureLow:'pressure-low',pressureMid:'pressure-mid',pressureHigh:'pressure-high'};
  for(const[key,css]of Object.entries(names))document.documentElement.style.setProperty('--'+css,p[key]);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',p.background);
  if(persist)try{localStorage.setItem('vortice-theme',p.id);}catch{}
  document.dispatchEvent(new CustomEvent('vortice-theme',{detail:p}));
  return p;
}
export function onThemeChange(listener){const fn=e=>listener(e.detail);document.addEventListener('vortice-theme',fn);return()=>document.removeEventListener('vortice-theme',fn);}
setTheme(document.documentElement.dataset.theme||'ember',false);
