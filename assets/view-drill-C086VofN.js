import{g as b,s as c,A as o,r as v,f as p,a as g,n as u,u as y,b as x,l as h}from"./index-DQB7Jlyn.js";function m(t){if(!window.speechSynthesis)return;const r=new SpeechSynthesisUtterance(t);r.lang="ru-RU",window.speechSynthesis.speak(r)}function k(t){return t.flags.hasSingular&&t.flags.hasPlural?Math.random()<.5?"singular":"plural":t.flags.hasPlural?"plural":"singular"}const e={active:!1,queue:[],currentIndex:0,currentWord:null,targetNumber:"singular",currentStreak:0,startTime:null,results:{correct:0,incorrect:0},lastProcessedWordId:null,abortController:null};async function T(t=null,r=!1){const n=await b(t,r);if(n.length===0){r?c("No words available to practice in this set.","info"):c("No words due for review yet! Come back later or use Cram Mode.","info");return}e.active=!0,e.queue=n,e.currentIndex=0,e.currentStreak=0,e.startTime=Date.now(),e.results={correct:0,incorrect:0},e.lastProcessedWordId=null,d()}function d(){if(e.abortController&&e.abortController.abort(),e.currentIndex>=e.queue.length){E();return}e.currentWord=e.queue[e.currentIndex],e.targetNumber=k(e.currentWord),f()}function f(){const t=document.getElementById("main-content"),r=e.currentWord,n=e.targetNumber==="plural",i=n?r.nominative_pl:r.nominative_sg,a=n?r.genitive_pl:r.genitive_sg;if(!i||!a){console.error("Missing DB forms for word:",r),e.currentIndex++,d();return}t.innerHTML=`
        <div class="page page--active" id="page-drill" style="height: 100vh; display: flex; flex-direction: column;">
             <div class="drill-header" style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-md); border-bottom: 1px solid var(--border-subtle);">
                <button class="btn btn--secondary btn--sm" id="drill-back">← Dashboard</button>
                <div style="font-weight: 600; color: var(--text-secondary);">
                    Word ${e.currentIndex+1} of ${e.queue.length}
                </div>
                <div style="font-weight: bold; color: var(--accent-primary);">
                    🔥 Streak: ${e.currentStreak}
                </div>
             </div>
             
             <div class="drill-body" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: var(--spacing-xl);">
                 
                 <div class="drill-card" style="background: var(--surface-2); padding: var(--spacing-xl); border-radius: var(--radius-lg); text-align: center; width: 100%; max-width: 500px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                      
                      <div style="color: var(--text-muted); text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.05em; margin-bottom: var(--spacing-md);">
                          Genitive ${n?"Plural":"Singular"}
                      </div>
                      
                      <div style="font-size: 2.5rem; font-weight: 800; font-family: var(--font-russian); margin-bottom: var(--spacing-sm);">
                          ${i}
                      </div>
                      
                      ${o.settings.showTranslations?`<div style="color: var(--text-secondary); font-size: 1.1rem; margin-bottom: var(--spacing-lg);">${r.translation_en||""}</div>`:""}
                      
                      <form id="drill-form" style="width: 100%; display: flex; flex-direction: column; gap: var(--spacing-md);">
                          <input type="text" id="drill-input" class="text-input" style="font-size: 1.5rem; text-align: center; padding: var(--spacing-md);" 
                                 autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"
                                 placeholder="Type the genitive form...">
                          
                          <button type="submit" class="btn btn--primary btn--full" style="font-size: 1.2rem; padding: var(--spacing-md);">Check</button>
                      </form>

                 </div>
                 
                 <div id="drill-feedback-container" style="margin-top: var(--spacing-xl); width: 100%; max-width: 500px;"></div>

             </div>
        </div>
    `,w(r,a),I(r,e.targetNumber)}async function I(t,r){if(!o.apiKey)return;const n=document.getElementById("drill-feedback-container");if(t.mastery.contextSentences&&t.mastery.contextSentences[r]){const i=t.mastery.contextSentences[r];n&&(n.innerHTML=`
                <div style="padding: var(--spacing-md); border-radius: var(--radius-sm); background: var(--surface-card); border-left: 3px solid var(--brand-primary); box-shadow: var(--shadow-sm);">
                    <div style="font-family: var(--font-russian); font-size: 1.05rem; margin-bottom: 4px; color: var(--text-primary);">
                        ${i.russian}
                    </div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary); font-style: italic;">
                        "${i.english}"
                    </div>
                </div>
            `);return}if(e.abortController=new AbortController,!(!n||n.innerHTML.trim()!=="")){n.innerHTML=`
        <div style="padding: var(--spacing-md); border-radius: var(--radius-sm); background: rgba(0,0,0,0.05); text-align: center;">
            <span class="spinner" style="vertical-align: middle; margin-right: 8px;"></span> 
            <span style="color: var(--text-muted); font-size: 0.9rem;">Generating context sentence...</span>
        </div>
    `;try{const i=await p(t,r,e.abortController.signal,o.apiKey),a=document.getElementById("drill-feedback-container");if(!a||e.active===!1||e.currentWord?.wordId!==t.wordId)return;i?(t.mastery.contextSentences||(t.mastery.contextSentences={}),t.mastery.contextSentences[r]=i,g(t).catch(s=>console.error("Failed to cache sentence:",s)),a.innerHTML=`
                <div style="padding: var(--spacing-md); border-radius: var(--radius-sm); background: var(--surface-card); border-left: 3px solid var(--brand-primary); box-shadow: var(--shadow-sm);">
                    <div style="font-family: var(--font-russian); font-size: 1.05rem; margin-bottom: 4px; color: var(--text-primary);">
                        ${i.russian}
                    </div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary); font-style: italic;">
                        "${i.english}"
                    </div>
                </div>
            `):a.innerHTML=""}catch(i){if(i.name==="AbortError")return;const a=document.getElementById("drill-feedback-container");a&&(a.innerHTML="")}}}function w(t,r){const n=document.getElementById("drill-back"),i=document.getElementById("drill-form"),a=document.getElementById("drill-input");a&&requestAnimationFrame(()=>{setTimeout(()=>a.focus(),150)}),n?.addEventListener("click",()=>{e.abortController&&e.abortController.abort(),e.active=!1,o.currentPage="dashboard",v()}),i?.addEventListener("submit",async s=>{s.preventDefault();const l=a.value;l.trim()&&await S(t,l,r)})}async function S(t,r,n){const i=u(r)===u(n),a=document.getElementById("drill-input"),s=document.querySelector("#drill-form button");if(a&&(a.disabled=!0),s&&(s.disabled=!0),t.mastery._backupStreak=t.mastery.level2_streak,t.mastery._backupNextReview=t.mastery.nextReviewDate,await y(t.wordId,i),e.lastProcessedWordId=t.wordId,i)e.results.correct++,e.currentStreak++,m(n),a.style.backgroundColor="rgba(46, 204, 113, 0.2)",a.style.borderColor="var(--accent-primary)",a.style.color="var(--accent-primary)",setTimeout(()=>{e.currentIndex++,d()},800);else{e.results.incorrect++,e.currentStreak=0;const l=document.getElementById("drill-feedback-container");e.abortController&&e.abortController.abort(),l.innerHTML=`
              <div class="card" style="border: 2px solid var(--accent-error); background: rgba(239, 68, 68, 0.05);">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--spacing-md);">
                      <h3 style="color: var(--accent-error); margin: 0;">Incorrect</h3>
                      <button class="btn btn--secondary btn--sm" id="drill-report-btn">⚠ Report Error</button>
                  </div>
                  
                  <div style="margin-bottom: var(--spacing-md); font-size: 1.1rem;">
                      <div style="color: var(--text-muted); font-size: 0.9rem;">You typed:</div>
                      <div style="text-decoration: line-through; color: var(--accent-error); margin-bottom: var(--spacing-sm);">${r}</div>
                      
                      <div style="color: var(--text-muted); font-size: 0.9rem;">Expected:</div>
                      <div style="font-weight: bold; color: var(--accent-primary); font-family: var(--font-russian); font-size: 1.3rem;">
                          ${n}
                          <button id="drill-audio-btn" style="background:none; border:none; cursor:pointer; font-size:1.2rem; margin-left:8px;" title="Listen">🔊</button>
                      </div>
                  </div>
                  
                  <div style="display: flex; gap: var(--spacing-sm); flex-direction: column;">
                      <button id="btn-next-word" class="btn btn--primary btn--full">Continue →</button>
                      <button id="btn-typo-guard" class="btn btn--outline btn--full" style="border-color: var(--text-muted); color: var(--text-secondary);">
                         Undo Mistake (Oops, I mistyped!)
                      </button>
                  </div>
              </div>
         `,document.getElementById("drill-audio-btn")?.addEventListener("click",()=>m(n)),document.getElementById("btn-next-word")?.addEventListener("click",()=>{e.currentIndex++,d()}),document.getElementById("btn-typo-guard")?.addEventListener("click",async()=>{await x(t.wordId),e.results.incorrect--,e.currentStreak=t.mastery._backupStreak,c("Streak restored. Let's try that again!","success"),f()}),document.getElementById("drill-report-btn")?.addEventListener("click",()=>{h({wordId:t.wordId,nominative:t.nominative_sg,targetForm:n,userAnswer:r,type:"database_error_reported"}),c("Report sent to engineering.","success")})}}function E(){const t=document.getElementById("main-content"),r=e.results.correct+e.results.incorrect,n=r>0?Math.round(e.results.correct/r*100):0;return t.innerHTML=`
        <div class="page page--active" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;">
            <div class="summary" style="max-width: 500px; width: 100%; text-align: center;">
                 <div style="font-size: 4rem; margin-bottom: var(--spacing-md);">🏆</div>
                 <h2 style="font-size: 2rem; margin-bottom: var(--spacing-xl);">Drill Complete!</h2>
                 
                 <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-md); margin-bottom: var(--spacing-xl);">
                      <div class="stat-card">
                          <div class="stat-card__value" style="color: var(--accent-primary);">${n}%</div>
                          <div class="stat-card__label">Accuracy</div>
                      </div>
                      <div class="stat-card">
                          <div class="stat-card__value">🔥 ${e.currentStreak}</div>
                          <div class="stat-card__label">Final Streak</div>
                      </div>
                 </div>
                 
                 <button class="btn btn--primary btn--full" id="drill-finish">Return to Dashboard</button>
            </div>
        </div>
    `,document.getElementById("drill-finish")?.addEventListener("click",()=>{e.active=!1,o.currentPage="dashboard",v()}),function(){e.abortController&&e.abortController.abort(),e.active=!1}}export{e as DrillState,k as assignDrillTarget,T as startDrillSession};
