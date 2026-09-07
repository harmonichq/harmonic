// Shared design-only scaffold. No production writes or personal data.
import { scnBuildEpisodeOption } from '../frontend/scenario-chart.js';
export async function loadCapture(name='harmonic-v2') {
  const path = name === 'verify' ? './verify-660-story.synthetic/payload.json' : './harmonic-v2.exploration/evidence.json';
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error(`Synthetic input unavailable (${response.status})`);
  return response.json();
}
export function resolveColors() {
  const v=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return {text:v('--text'),muted:v('--muted'),line:v('--line'),primary:v('--primary'),accent:v('--accent'),secondary:v('--secondary'),high:v('--high'),inRange:v('--in-range'),low:v('--low'),surface:v('--surface'),observed:v('--observed'),inferred:v('--inferred'),notindata:v('--notindata'),basal:v('--basal')};
}
export function renderShell({baseline=false}={}) {
  const root=document.createElement('div');root.className='cockpit-shell cockpit'+(baseline?'':' v2-shell');
  const navigation = baseline ? `<nav class="cockpit-flow" aria-label="Workflow"><button class="cockpit-step" aria-current="step"><span class="cockpit-step-number">1</span>Diagnose</button><span class="cockpit-flow-separator">→</span><button class="cockpit-step"><span class="cockpit-step-number">2</span>Plan</button><span class="cockpit-flow-separator">→</span><button class="cockpit-step"><span class="cockpit-step-number">3</span>Verify</button></nav><span class="cockpit-divider"></span><a class="cockpit-day" href="#day">Day</a>` : `<nav class="v2-nav" aria-label="Main">${['Overview','Explore','Changes','Day'].map((x,i)=>`<button data-destination="${x.toLowerCase()}" ${i===0?'aria-current="page"':''}>${x}</button>`).join('')}</nav>`;
  root.innerHTML=`<header class="cockpit-topbar"><div class="cockpit-identity"><span class="cockpit-mark" aria-hidden="true"></span>Harmonic <small>advisory</small></div>${navigation}<span class="cockpit-gap"></span><div class="cockpit-scope"><span class="cockpit-scope-label">Scope</span><span class="cockpit-scope-dot"></span><span>30 d</span></div><button class="cockpit-log-carbs"><span class="plus">＋</span>Log carbs</button></header><main class="v2-content" id="v2-content"></main><footer class="cockpit-footer status">${baseline?'<span class="cockpit-profile-facts">Pump profile · ISF 40 mg/dL/U · I:C 10 g/U</span>':''}<span class="cockpit-advisory advisory">Advisory only — review with your clinician before changing pump settings.</span><nav class="cockpit-utilities" aria-label="Utilities">${baseline?'<button class="cockpit-questions">Carb questions <span class="cockpit-count">5</span></button>':''}<button>Guide</button><button>Settings</button><button class="cockpit-glossary">Glossary</button></nav></footer>`;
  document.body.append(root); return root.querySelector('main');
}
export const STATES=['investigate','active','ready','history','quiet','error'];
export function renderMockBar(parent,concept,onState) {
  const state=new URLSearchParams(location.search).get('state')||'investigate';
  const bar=document.createElement('div');bar.className='mockbar';
  bar.innerHTML=`<strong>${concept}</strong><label>Scenario <select aria-label="Prototype scenario">${STATES.map(s=>`<option ${s===state?'selected':''}>${s}</option>`).join('')}</select></label><p>Synthetic design exploration. Selection and new actions are illustrative.</p>`;
  // Controls in this bar are not part of the real app.
  bar.querySelector('select').onchange=e=>{const u=new URL(location.href);u.searchParams.set('state',e.target.value);history.replaceState(null,'',u);onState(e.target.value);};
  parent.append(bar);return state;
}
export function renderEpisodeChart(element,episode,step=1) {
  if(!globalThis.echarts)throw new Error('ECharts 5.5.0 is required');
  const chart=echarts.init(element);chart.setOption(scnBuildEpisodeOption(episode,step,resolveColors()));
  const observer=new ResizeObserver(()=>chart.resize());observer.observe(element);
  return {selectStep(index){chart.setOption(scnBuildEpisodeOption(episode,index,resolveColors()),true);},dispose(){observer.disconnect();chart.dispose();}};
}
export function escapeText(text) { const e=document.createElement('span');e.textContent=String(text??'');return e.innerHTML; }
